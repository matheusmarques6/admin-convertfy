/**
 * Regras puras da Gestão de Carteira (Pipelines CS) — client-safe.
 *
 * Mensalidade a partir de unified_invoices (Asaas + cobranças locais),
 * régua de calls (25d = agendar, 30d = atrasada) e labels pt-BR usados
 * nos cards e no drawer. Sem I/O — testável de ponta a ponta.
 */

export type MensalidadeStatus = "paga" | "pendente" | "atrasada" | "none"

export interface InvoiceLite {
  due_date: string | null
  payment_date: string | null
  /** pending | paid | overdue | cancelled | refunded (assimetria documentada da VIEW). */
  status: string
  amount: number
}

export interface MensalidadeMes {
  /** "ago/26" — derivado do due_date. */
  month: string
  status: "paga" | "atrasada" | "em aberto" | "cancelada" | "reembolsada"
  /** "paga em 05/08" | "venceu 05/08" | "vence 05/09" */
  detail: string
  amount: number
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

/**
 * Status da mensalidade + histórico (últimas `historyMax` faturas) a
 * partir das faturas do CLIENTE (unified_invoices não tem store_id),
 * ordenadas aqui por due_date desc.
 *
 * Regra do status agregado:
 *  - alguma vencida (status 'overdue', ou 'pending' com due_date < hoje) → atrasada
 *  - senão alguma 'pending' a vencer → pendente
 *  - senão a mais recente 'paid' → paga
 *  - sem faturas → none (loja sem cobrança modelada)
 */
export function mensalidadeFromInvoices(
  invoices: InvoiceLite[],
  now: number,
  historyMax = 4,
): MensalidadeInfo {
  const sorted = [...invoices]
    .filter((i) => i.due_date)
    .sort((a, b) => (b.due_date as string).localeCompare(a.due_date as string))

  const isOverdue = (i: InvoiceLite) =>
    i.status === "overdue" ||
    (i.status === "pending" && ymd(i.due_date as string).getTime() < now - 12 * 3_600_000)

  let status: MensalidadeStatus = "none"
  if (sorted.some(isOverdue)) status = "atrasada"
  else if (sorted.some((i) => i.status === "pending")) status = "pendente"
  else if (sorted.some((i) => i.status === "paid")) status = "paga"

  const history: MensalidadeMes[] = sorted.slice(0, historyMax).map((i) => {
    const due = i.due_date as string
    if (i.status === "paid") {
      return {
        month: monthLabel(due),
        status: "paga",
        detail: i.payment_date ? `paga em ${ddmm(i.payment_date)}` : "paga",
        amount: i.amount,
      }
    }
    if (i.status === "cancelled") {
      return { month: monthLabel(due), status: "cancelada", detail: `vencia ${ddmm(due)}`, amount: i.amount }
    }
    if (i.status === "refunded") {
      return { month: monthLabel(due), status: "reembolsada", detail: ddmm(due), amount: i.amount }
    }
    if (isOverdue(i)) {
      return { month: monthLabel(due), status: "atrasada", detail: `venceu ${ddmm(due)}`, amount: i.amount }
    }
    return { month: monthLabel(due), status: "em aberto", detail: `vence ${ddmm(due)}`, amount: i.amount }
  })

  return { status, history }
}

/** Cor do "Convertfy gera": verde >= 15%, âmbar abaixo (regra do design). */
export function pctTone(pct: number | null): "pos" | "warn" | "mut" {
  if (pct == null) return "mut"
  return pct >= 15 ? "pos" : "warn"
}
