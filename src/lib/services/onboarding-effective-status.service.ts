/**
 * Calcula payment_status e contract_status "efetivos" do onboarding em
 * runtime, baseado nas fontes da verdade reais (unified_invoices +
 * contracts), nao no campo armazenado em onboardings.
 *
 * Motivacao: campo onboardings.payment_status era hardcoded "pending" ao
 * criar e nunca sincronizava. Cliente que ja pagava via Asaas (webhook
 * atualizando invoices) OU que tinha pagamento manual marcado pelo gestor
 * em "Cliente > Assinaturas" (atualizando client_charges) aparecia como
 * pendente no card do kanban.
 *
 * Sources:
 *  - unified_invoices: VIEW UNION de invoices (Asaas) + client_charges (manual)
 *  - contracts: tabela de contratos por cliente
 *
 * Estrategia: batch-fetch por client_ids, pega o registro mais recente
 * por cliente, mapeia pra enum do onboarding.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  OnboardingPaymentStatus,
  OnboardingContractStatus,
} from "@/types/onboarding-pipeline"

interface UnifiedInvoiceRow {
  client_id: string
  status: string
  due_date: string
  payment_date: string | null
  source: "asaas" | "local"
}

interface ContractRow {
  client_id: string
  status: string
  start_date: string | null
}

export interface EffectiveStatusMap {
  /** Map client_id -> effective payment_status */
  payment: Record<string, OnboardingPaymentStatus>
  /** Map client_id -> effective contract_status */
  contract: Record<string, OnboardingContractStatus>
  /** Source da info (asaas/local/manual) — UI pode exibir tooltip */
  paymentSource: Record<string, "asaas" | "local" | "fallback">
}

/**
 * Mapeia status de unified_invoices (paid/pending/overdue/cancelled/refunded)
 * pra enum do onboarding (pending/paid/overdue/renewal_due).
 */
function mapInvoiceStatus(s: string): OnboardingPaymentStatus {
  switch (s) {
    case "paid":
      return "paid"
    case "overdue":
      return "overdue"
    case "pending":
      return "pending"
    case "cancelled":
    case "refunded":
      return "pending"
    default:
      return "pending"
  }
}

/**
 * Mapeia contracts.status (active/expired/cancelled/pending) pra enum do
 * onboarding (pending/sent/signed/expiring).
 */
function mapContractStatus(s: string): OnboardingContractStatus {
  switch (s) {
    case "active":
      return "signed"
    case "expired":
      return "expiring"
    case "pending":
      return "pending"
    case "cancelled":
      return "pending"
    default:
      return "pending"
  }
}

/**
 * Recebe lista de client_ids unicos e devolve mapa client_id -> status efetivo.
 *
 * Performance: 2 queries (uma pra unified_invoices, uma pra contracts),
 * filtradas pelo IN dos client_ids. O(N) onde N = clientes distintos.
 */
export async function resolveEffectiveStatuses(
  admin: SupabaseClient,
  clientIds: string[],
): Promise<EffectiveStatusMap> {
  const result: EffectiveStatusMap = {
    payment: {},
    contract: {},
    paymentSource: {},
  }
  if (clientIds.length === 0) return result

  const uniqueIds = Array.from(new Set(clientIds))

  // 1. Pega TODOS os charges desses clientes, em ordem cronologica decrescente
  // Resiliente: se a view nao existir ou falhar, segue com array vazio em vez
  // de quebrar o endpoint inteiro de onboardings.
  let invoices: UnifiedInvoiceRow[] | null = null
  try {
    const res = await admin
      .from("unified_invoices")
      .select("client_id, status, due_date, payment_date, source")
      .in("client_id", uniqueIds)
      .order("due_date", { ascending: false })
    if (!res.error) invoices = res.data as UnifiedInvoiceRow[]
  } catch {
    invoices = null
  }

  // Pra cada cliente, pega o "melhor" status:
  // - Se TEM algum charge 'paid' nos ultimos 35 dias -> paid
  // - Se TEM algum 'overdue' atualmente -> overdue
  // - Se TEM algum 'pending' com due_date futuro -> pending (renewal_due se < 7d)
  // - Se nao tem nenhum charge -> pending (fallback)
  const now = Date.now()
  const ms35d = 35 * 24 * 60 * 60 * 1000
  const ms7d = 7 * 24 * 60 * 60 * 1000

  for (const id of uniqueIds) {
    const rows = (invoices ?? []).filter((r) => r.client_id === id)
    if (rows.length === 0) {
      result.payment[id] = "pending"
      result.paymentSource[id] = "fallback"
      continue
    }

    // Procura paid recente
    const paidRecent = rows.find(
      (r) =>
        r.status === "paid" &&
        r.payment_date &&
        now - new Date(r.payment_date).getTime() < ms35d,
    )
    if (paidRecent) {
      result.payment[id] = "paid"
      result.paymentSource[id] = paidRecent.source
      continue
    }

    // Procura overdue
    const overdue = rows.find((r) => r.status === "overdue")
    if (overdue) {
      result.payment[id] = "overdue"
      result.paymentSource[id] = overdue.source
      continue
    }

    // Procura pending com due_date proximo (renewal_due)
    const pendingSoon = rows.find((r) => {
      if (r.status !== "pending") return false
      const due = new Date(r.due_date).getTime()
      return due - now > 0 && due - now < ms7d
    })
    if (pendingSoon) {
      result.payment[id] = "renewal_due"
      result.paymentSource[id] = pendingSoon.source
      continue
    }

    // Fallback: usa o primeiro status (mais recente)
    result.payment[id] = mapInvoiceStatus(rows[0].status)
    result.paymentSource[id] = rows[0].source
  }

  // 2. Contracts (resiliente)
  let contracts: ContractRow[] | null = null
  try {
    const res = await admin
      .from("contracts")
      .select("client_id, status, start_date")
      .in("client_id", uniqueIds)
      .order("start_date", { ascending: false })
    if (!res.error) contracts = res.data as ContractRow[]
  } catch {
    contracts = null
  }

  for (const id of uniqueIds) {
    const c = (contracts ?? []).find((r) => r.client_id === id)
    result.contract[id] = c ? mapContractStatus(c.status) : "pending"
  }

  return result
}

/**
 * Aplica os status efetivos sobre uma lista de onboardings, retornando
 * os mesmos objetos com `effective_payment_status` e `effective_contract_status`
 * preenchidos. Mantém os campos originais (payment_status / contract_status)
 * pra fallback histórico.
 */
export function applyEffectiveStatuses<
  T extends {
    client_id: string
    payment_status?: OnboardingPaymentStatus
    contract_status?: OnboardingContractStatus
  },
>(
  onboardings: T[],
  statuses: EffectiveStatusMap,
): Array<
  T & {
    effective_payment_status: OnboardingPaymentStatus
    effective_contract_status: OnboardingContractStatus
    effective_payment_source: "asaas" | "local" | "fallback"
  }
> {
  return onboardings.map((onb) => ({
    ...onb,
    effective_payment_status:
      statuses.payment[onb.client_id] ?? onb.payment_status ?? "pending",
    effective_contract_status:
      statuses.contract[onb.client_id] ?? onb.contract_status ?? "pending",
    effective_payment_source:
      statuses.paymentSource[onb.client_id] ?? "fallback",
  }))
}
