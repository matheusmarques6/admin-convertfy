/**
 * Espelho local (`invoices`) de um pagamento do Asaas.
 *
 * Fonte ÚNICA de duas regras que antes viviam copiadas no sync, no
 * webhook e nas rotas de cobrança — e as cópias divergiam (o sync
 * procurava o cliente pela coluna `clients.asaas_customer_id`, que está
 * vazia; o dado real mora em `custom_fields.asaas_customer_id`):
 *
 *  - `resolveClientForPayment`: externalReference (id do cliente) →
 *    `custom_fields->>asaas_customer_id`, sempre dentro da org.
 *  - `buildInvoiceRowFromPayment`: a linha de `invoices` a partir do
 *    payment (status mapeado, data de pagamento, assinatura de origem).
 *
 * `ensureAsaasInvoiceMirror` cria o espelho SOB DEMANDA: o Financeiro
 * lista os pagamentos ao vivo da API, mas classificação, comprovante e
 * carteira moram em `invoices`, que só o sync preenchia — classificar ou
 * marcar pago um pagamento recém-gerado dava "Fatura ainda não
 * sincronizada localmente". Idempotente por `asaas_id` (índice único
 * parcial da migration 20261119 — sem ele, sync e espelho correndo em
 * paralelo duplicavam a fatura).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAsaasService, mapAsaasStatusToInternal, type AsaasService } from "@/lib/integrations/asaas"
import type { AsaasPayment } from "@/lib/integrations/types"
import { decryptCredentialsJson } from "@/lib/crypto"
import { AppError } from "@/lib/api/errors"
import { isMissingClassificationColumn, stripClassification } from "@/lib/services/charge-classification"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasInvoiceMirror")

export interface MirroredInvoice {
  id: string
  client_id: string | null
  created: boolean
  /** O payment lido do Asaas, quando foi preciso buscá-lo (espelho novo). */
  payment?: AsaasPayment
}

/** Subconjunto do payment que a linha de `invoices` precisa. */
export type PaymentLike = Pick<
  AsaasPayment,
  "id" | "customer" | "value" | "dueDate" | "status" | "description" | "externalReference" | "subscription" | "paymentDate" | "clientPaymentDate"
>

export async function loadAsaasService(admin: SupabaseClient, orgId: string): Promise<AsaasService> {
  const { data: integration } = await admin
    .from("integrations")
    .select("credentials, is_active")
    .eq("type", "asaas")
    .eq("is_active", true)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!integration) throw new AppError("Integração Asaas não ativa", 400)
  return createAsaasService(decryptCredentialsJson(integration.credentials))
}

/**
 * Cliente dono do payment: `externalReference` (id do cliente) e, sem
 * ele, o `asaas_customer_id` guardado em `custom_fields`. `orgId` null =
 * sem filtro de org (webhook, que não tem sessão).
 */
export async function resolveClientForPayment(
  db: SupabaseClient,
  orgId: string | null,
  payment: Pick<PaymentLike, "externalReference" | "customer">,
): Promise<string | null> {
  if (payment.externalReference) {
    let q = db.from("clients").select("id").eq("id", payment.externalReference)
    if (orgId) q = q.eq("org_id", orgId)
    const { data } = await q.maybeSingle()
    if (data?.id) return data.id
  }
  if (payment.customer) {
    let q = db.from("clients").select("id").eq("custom_fields->>asaas_customer_id", payment.customer)
    if (orgId) q = q.eq("org_id", orgId)
    const { data } = await q.limit(1).maybeSingle()
    if (data?.id) return data.id
  }
  return null
}

/**
 * Linha de `invoices` para o payment. `currentChargeType` = classificação
 * já gravada (update): assinatura de origem só classifica como
 * `subscription` quando não há classificação manual.
 */
export function buildInvoiceRowFromPayment(
  payment: PaymentLike,
  clientId: string | null,
  currentChargeType?: string | null,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    asaas_id: payment.id,
    client_id: clientId,
    amount: payment.value,
    due_date: payment.dueDate,
    payment_date: payment.paymentDate || payment.clientPaymentDate || null,
    status: mapAsaasStatusToInternal(payment.status),
    description: payment.description || `Assinatura Asaas #${payment.id}`,
  }
  if (payment.subscription) {
    row.asaas_subscription_id = payment.subscription
    if (!currentChargeType || currentChargeType === "other") row.charge_type = "subscription"
  }
  return row
}

async function findMirrorInOrg(admin: SupabaseClient, orgId: string, paymentId: string) {
  const { data } = await admin
    .from("invoices")
    .select("id, client_id, clients!inner(org_id)")
    .eq("asaas_id", paymentId)
    .eq("clients.org_id", orgId)
    .limit(1)
    .maybeSingle()
  return data ? { id: data.id as string, client_id: (data.client_id as string | null) ?? null } : null
}

/**
 * Garante a linha em `invoices` para o payment. Devolve null quando o
 * payment não existe no Asaas ou o cliente não é da org.
 */
export async function ensureAsaasInvoiceMirror(
  admin: SupabaseClient,
  orgId: string,
  paymentId: string,
  opts: { asaas?: AsaasService } = {},
): Promise<MirroredInvoice | null> {
  const existing = await findMirrorInOrg(admin, orgId, paymentId)
  if (existing) return { ...existing, created: false }

  const asaas = opts.asaas ?? (await loadAsaasService(admin, orgId))
  let payment: AsaasPayment
  try {
    payment = await asaas.getPayment(paymentId)
  } catch (err) {
    log.warn("payment não encontrado no Asaas", { paymentId, error: err instanceof Error ? err.message : String(err) })
    return null
  }

  const clientId = await resolveClientForPayment(admin, orgId, payment)
  if (!clientId) {
    log.warn("payment sem cliente da org", { paymentId, customer: payment.customer })
    return null
  }

  const row = buildInvoiceRowFromPayment(payment, clientId)
  let ins = await admin.from("invoices").insert(row).select("id, client_id").single()
  if (ins.error && isMissingClassificationColumn(ins.error)) {
    ins = await admin.from("invoices").insert(stripClassification(row)).select("id, client_id").single()
  }
  if (ins.error) {
    // 23505 = corrida com o sync/webhook: a linha acabou de nascer.
    const again = await findMirrorInOrg(admin, orgId, paymentId)
    if (again) return { ...again, created: false, payment }
    throw ins.error
  }
  log.info("espelho da fatura Asaas criado sob demanda", { paymentId, invoice_id: ins.data.id })
  return { id: ins.data.id, client_id: ins.data.client_id, created: true, payment }
}
