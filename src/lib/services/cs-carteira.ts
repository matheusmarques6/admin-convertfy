/**
 * Regras puras da Gestão de Carteira (Pipelines CS) — client-safe.
 *
 * Mensalidade e comissão a partir de unified_invoices (Asaas +
 * cobranças locais) atribuídas POR LOJA, régua de calls (25d =
 * agendar, 30d = atrasada) e labels pt-BR usados nos cards e no
 * drawer. Sem I/O — testável de ponta a ponta.
 */

import {
  isMonthKey,
  monthOf,
  monthOfDay,
  monthRange,
  previousMonth,
  type MonthKey,
} from "./call-coverage"
import { monthsLabel } from "./charge-description"

export type MensalidadeStatus = "paga" | "pendente" | "atrasada" | "none"

export interface InvoiceLite {
  due_date: string | null
  payment_date: string | null
  /** pending | paid | overdue | cancelled | refunded (assimetria documentada da VIEW). */
  status: string
  amount: number
  /** subscription | commission | other (migration 20261113); ausente = other. */
  charge_type?: string | null
  /** Meses a que a cobrança se refere (YYYY-MM). */
  reference_months?: string[] | null
  /** Loja da cobrança; NULL = do cliente, sem loja definida. */
  store_id?: string | null
  /**
   * Lojas da cobrança (migration 20261118): comissão de várias lojas
   * numa fatura só. Quando preenchido, vence `store_id`.
   */
  store_ids?: string[] | null
  /** Assinatura (local, ou Asaas resolvida pela view). */
  subscription_id?: string | null
}

/** Lojas efetivas da cobrança: `store_ids` vence; senão `[store_id]`. */
export function invoiceStoreIds(i: Pick<InvoiceLite, "store_id" | "store_ids">): string[] {
  if (Array.isArray(i.store_ids) && i.store_ids.length > 0) return i.store_ids
  return i.store_id ? [i.store_id] : []
}

export type MesStatus = "paga" | "atrasada" | "em aberto" | "cancelada" | "reembolsada"

export interface MensalidadeMes {
  /** "ago/26" — derivado do due_date (mensalidade) ou dos meses de referência (comissão). */
  month: string
  status: MesStatus
  /** "paga em 05/08" | "venceu 05/08" | "vence 05/09" */
  detail: string
  amount: number
  /** Meses de referência (comissão). Ausente na mensalidade. */
  months?: MonthKey[]
  /** true quando o mês foi deduzido do vencimento (cobrança sem reference_months). */
  inferred?: boolean
  /**
   * Nº de lojas que a cobrança cobre quando é mais de uma (comissão
   * conjunta). O valor é o da FATURA inteira — o drawer avisa que o
   * montante é compartilhado, em vez de sugerir que a loja pagou tudo.
   */
  shared?: number
}

export interface MensalidadeInfo {
  status: MensalidadeStatus
  history: MensalidadeMes[]
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function ymd(iso: string): Date {
  // Datas da VIEW são DATE (sem hora) — meio-dia evita drift de fuso.
  return new Date(`${iso.slice(0, 10)}T12:00:00`)
}

function ddmm(iso: string): string {
  const d = ymd(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(iso: string): string {
  const d = ymd(iso)
  return `${MESES[d.getMonth()]}/${String(d.getFullYear() % 100).padStart(2, "0")}`
}

/** "desde mar/25" — contrato ou criação da loja. */
export function sinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  return monthLabel(iso)
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

/** "sex 29/08" pra próxima call; null quando não há data futura. */
export function nextCallLabel(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null
  const d = ymd(iso)
  if (d.getTime() < now - 12 * 3_600_000) return null // data no passado não é "próxima"
  return `${DIAS_SEMANA[d.getDay()]} ${ddmm(iso)}`
}

export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const ms = now - ymd(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Régua da call: >=30d vermelho (atrasada), 25-29d âmbar + "agendar". */
export function callTone(days: number | null): { tone: "ok" | "warn" | "neg"; agendar: boolean } {
  if (days == null) return { tone: "ok", agendar: false }
  if (days >= 30) return { tone: "neg", agendar: false }
  if (days >= 25) return { tone: "warn", agendar: true }
  return { tone: "ok", agendar: false }
}

const isOverdue = (i: InvoiceLite, now: number) =>
  i.status === "overdue" ||
  (i.status === "pending" && ymd(i.due_date as string).getTime() < now - 12 * 3_600_000)

function sortByDueDesc(invoices: InvoiceLite[]): InvoiceLite[] {
  return [...invoices]
    .filter((i) => i.due_date)
    .sort((a, b) => (b.due_date as string).localeCompare(a.due_date as string))
}

/**
 * Status agregado de um conjunto de cobranças:
 *  - alguma vencida (status 'overdue', ou 'pending' com due_date < hoje) → atrasada
 *  - senão alguma 'pending' a vencer → pendente
 *  - senão a mais recente 'paid' → paga
 *  - sem faturas → none (nada modelado)
 */
function aggregateStatus(sorted: InvoiceLite[], now: number): MensalidadeStatus {
  if (sorted.some((i) => isOverdue(i, now))) return "atrasada"
  if (sorted.some((i) => i.status === "pending")) return "pendente"
  if (sorted.some((i) => i.status === "paid")) return "paga"
  return "none"
}

function historyEntry(i: InvoiceLite, now: number, month: string): MensalidadeMes {
  const due = i.due_date as string
  const stores = invoiceStoreIds(i)
  const base = { month, amount: i.amount, ...(stores.length > 1 ? { shared: stores.length } : {}) }
  if (i.status === "paid") {
    return { ...base, status: "paga", detail: i.payment_date ? `paga em ${ddmm(i.payment_date)}` : "paga" }
  }
  if (i.status === "cancelled") return { ...base, status: "cancelada", detail: `vencia ${ddmm(due)}` }
  if (i.status === "refunded") return { ...base, status: "reembolsada", detail: ddmm(due) }
  if (isOverdue(i, now)) return { ...base, status: "atrasada", detail: `venceu ${ddmm(due)}` }
  return { ...base, status: "em aberto", detail: `vence ${ddmm(due)}` }
}

/**
 * Status da mensalidade + histórico (últimas `historyMax` faturas) a
 * partir das faturas JÁ atribuídas à loja (ver `splitInvoicesForStore`),
 * ordenadas aqui por due_date desc.
 */
export function mensalidadeFromInvoices(
  invoices: InvoiceLite[],
  now: number,
  historyMax = 4,
): MensalidadeInfo {
  const sorted = sortByDueDesc(invoices)
  const status = aggregateStatus(sorted, now)
  const history = sorted.slice(0, historyMax).map((i) => historyEntry(i, now, monthLabel(i.due_date as string)))
  return { status, history }
}

// ─── Atribuição por loja ────────────────────────────────────────────

export interface StoreInvoiceSplit {
  /** Mensalidades/avulsas desta loja. */
  mensalidade: InvoiceLite[]
  /** Comissões desta loja. */
  comissao: InvoiceLite[]
  /**
   * Cobranças do cliente que NÃO dá pra atribuir: cliente com várias
   * lojas e cobrança sem loja nem assinatura vinculada. O drawer avisa
   * — é o que o financeiro precisa classificar.
   */
  unassigned: number
  /** loja = atribuída por store_id/assinatura; cliente = herdada (cliente com uma loja só). */
  scope: "loja" | "cliente" | "none"
}

/**
 * Quais cobranças do CLIENTE pertencem a ESTA loja.
 *
 * 1. `store_ids`/`store_id` preenchido decide sozinho (uma cobrança de
 *    várias lojas entra em TODAS elas — o histórico marca `shared`).
 * 2. Senão, assinatura vinculada a lojas (`client_subscription_stores`)
 *    decide — inclusive excluindo: assinatura da loja B não é da A.
 * 3. Senão (cobrança do cliente sem loja): entra só quando o cliente
 *    tem UMA loja ativa. Com várias, contar nas duas seria mentir; a
 *    linha vira `unassigned`.
 */
export function splitInvoicesForStore(input: {
  invoices: InvoiceLite[]
  storeId: string
  /** assinatura → lojas vinculadas */
  subscriptionStores: Record<string, string[]>
  /** lojas ativas do cliente (para o fallback do item 3) */
  clientStoreCount: number
}): StoreInvoiceSplit {
  const mine: InvoiceLite[] = []
  let unassigned = 0
  let viaLoja = false
  let viaCliente = false
  for (const inv of input.invoices) {
    let verdict: "mine" | "other" | "unassigned"
    const stores = invoiceStoreIds(inv)
    if (stores.length > 0) {
      verdict = stores.includes(input.storeId) ? "mine" : "other"
      if (verdict === "mine") viaLoja = true
    } else {
      const linked = inv.subscription_id ? (input.subscriptionStores[inv.subscription_id] ?? []) : []
      if (linked.length > 0) {
        verdict = linked.includes(input.storeId) ? "mine" : "other"
        if (verdict === "mine") viaLoja = true
      } else if (input.clientStoreCount <= 1) {
        verdict = "mine"
        viaCliente = true
      } else {
        verdict = "unassigned"
      }
    }
    if (verdict === "mine") mine.push(inv)
    else if (verdict === "unassigned") unassigned++
  }
  return {
    mensalidade: mine.filter((i) => i.charge_type !== "commission"),
    comissao: mine.filter((i) => i.charge_type === "commission"),
    unassigned,
    scope: viaLoja ? "loja" : viaCliente ? "cliente" : "none",
  }
}

export interface SubscriptionLite {
  id: string
  name: string
  value: number
  cycle: string
  status: string
}

/**
 * Assinaturas que cobrem a loja: as vinculadas; sem vínculo nenhum e
 * cliente com uma loja só, todas as do cliente (herdadas).
 */
export function subscriptionsForStore(input: {
  subscriptions: SubscriptionLite[]
  storeId: string
  subscriptionStores: Record<string, string[]>
  clientStoreCount: number
}): { list: SubscriptionLite[]; scope: "loja" | "cliente" | "none" } {
  const linked = input.subscriptions.filter((s) =>
    (input.subscriptionStores[s.id] ?? []).includes(input.storeId),
  )
  if (linked.length > 0) return { list: linked, scope: "loja" }
  const unlinked = input.subscriptions.filter((s) => (input.subscriptionStores[s.id] ?? []).length === 0)
  if (input.clientStoreCount <= 1 && unlinked.length > 0) return { list: unlinked, scope: "cliente" }
  return { list: [], scope: "none" }
}

// ─── Comissões por mês ──────────────────────────────────────────────

export type ComissaoMesStatus = MesStatus | "não cobrada"

export interface ComissaoMes {
  month: MonthKey
  /** "jul/26" */
  label: string
  status: ComissaoMesStatus
  amount: number
}

export interface ComissaoInfo {
  status: MensalidadeStatus
  /** Cobranças de comissão, mais recente primeiro. */
  history: MensalidadeMes[]
  /** Grade mês a mês (mais recente primeiro) até o mês passado — "não cobrada" é o furo. */
  months: ComissaoMes[]
}

/** Meses que uma cobrança de comissão cobre; sem reference_months, o mês ANTERIOR ao vencimento (convenção: comissão de julho vence em agosto). */
export function monthsOfInvoice(i: InvoiceLite): { months: MonthKey[]; inferred: boolean } {
  const explicit = (i.reference_months ?? []).filter(isMonthKey)
  if (explicit.length > 0) return { months: [...new Set(explicit)].sort(), inferred: false }
  const due = i.due_date ? monthOfDay(i.due_date) : null
  return { months: due ? [previousMonth(due)] : [], inferred: true }
}

const MES_PRIORITY: Record<ComissaoMesStatus, number> = {
  atrasada: 5,
  "em aberto": 4,
  paga: 3,
  reembolsada: 2,
  cancelada: 1,
  "não cobrada": 0,
}

/**
 * Comissões da loja: status agregado, histórico e a grade por mês. A
 * grade vai do mês mais antigo cobrado (ou `windowMonths` atrás, o que
 * for mais recente) até o mês PASSADO — o corrente ainda não fechou,
 * não é "não cobrada". Sem nenhuma comissão → grade vazia (loja que
 * não paga comissão não é cobrada disso).
 */
export function comissaoFromInvoices(
  invoices: InvoiceLite[],
  now: number,
  opts: { historyMax?: number; windowMonths?: number } = {},
): ComissaoInfo {
  const historyMax = opts.historyMax ?? 4
  const windowMonths = opts.windowMonths ?? 6
  const sorted = sortByDueDesc(invoices)
  const status = aggregateStatus(sorted, now)

  const history = sorted.slice(0, historyMax).map((i) => {
    const { months, inferred } = monthsOfInvoice(i)
    const label = months.length ? monthsLabel(months) : monthLabel(i.due_date as string)
    return { ...historyEntry(i, now, label), months, inferred }
  })

  if (sorted.length === 0) return { status, history, months: [] }

  const currentMonth = monthOf(new Date(now).toISOString())
  if (!currentMonth) return { status, history, months: [] }
  const to = previousMonth(currentMonth)
  let from = to
  for (let i = 1; i < windowMonths; i++) from = previousMonth(from)

  const byMonth = new Map<MonthKey, ComissaoMes>()
  let earliest: MonthKey | null = null
  let latest: MonthKey = to
  for (const inv of sorted) {
    const { months } = monthsOfInvoice(inv)
    const entry = historyEntry(inv, now, "")
    for (const m of months) {
      if (!earliest || m < earliest) earliest = m
      if (m > latest) latest = m
      const prev = byMonth.get(m)
      if (!prev || MES_PRIORITY[entry.status] > MES_PRIORITY[prev.status]) {
        byMonth.set(m, { month: m, label: monthsLabel([m]), status: entry.status, amount: inv.amount })
      }
    }
  }
  if (earliest && earliest > from) from = earliest

  const months = monthRange(from, latest)
    .map(
      (m) =>
        byMonth.get(m) ?? { month: m, label: monthsLabel([m]), status: "não cobrada" as const, amount: 0 },
    )
    .reverse()

  return { status, history, months }
}

/** Cor do "Convertfy gera": verde >= 15%, âmbar abaixo (regra do design). */
export function pctTone(pct: number | null): "pos" | "warn" | "mut" {
  if (pct == null) return "mut"
  return pct >= 15 ? "pos" : "warn"
}
