/**
 * Regras de cash collect do funil comercial.
 *
 * O valor recebido de uma venda NÃO é digitado: sai de `unified_invoices`
 * — a VIEW que une as cobranças do Asaas (webhook) com os lançamentos
 * manuais de Cliente > Financeiro. É a mesma fonte que o onboarding usa
 * pra dizer se o cliente pagou, então funil e onboarding nunca discordam.
 *
 * Duas decisões que valem explicação:
 *
 * 1. **Só conta pagamento a partir do fechamento da venda.** Cliente
 *    antigo que volta a comprar tem histórico de pagamentos anteriores;
 *    somá-los inflaria o cash collect da venda nova.
 * 2. **O valor manual vence o derivado.** Venda sem cliente vinculado não
 *    tem como derivar nada, e o gestor precisa poder corrigir um caso
 *    específico sem mexer no financeiro.
 */

export type PaymentSource = "asaas" | "local" | "mixed" | null

export interface PaidInvoice {
  client_id: string
  amount: number | null
  payment_date: string | null
  source: string
}

export interface CashCollectInput {
  client_id: string | null
  /** Override manual (deals.cash_collected). */
  cash_collected: number | null
  won_at: string | null
  created_at: string
}

export interface CashCollectResult {
  /** Valor que entra nas métricas. */
  effective: number
  /** Somatório dos pagamentos confirmados desde o fechamento. */
  auto: number
  /** Override manual, quando informado. */
  manual: number | null
  source: PaymentSource
}

/** Agrupa as faturas pagas por cliente (uma passada só). */
export function groupPaidInvoices(
  invoices: PaidInvoice[],
): Map<string, PaidInvoice[]> {
  const map = new Map<string, PaidInvoice[]>()
  for (const inv of invoices) {
    const list = map.get(inv.client_id)
    if (list) list.push(inv)
    else map.set(inv.client_id, [inv])
  }
  return map
}

/**
 * Resolve o cash collect de uma venda. `invoicesByClient` vem de
 * groupPaidInvoices e contém apenas faturas com status pago.
 */
export function resolveCashCollect(
  deal: CashCollectInput,
  invoicesByClient: Map<string, PaidInvoice[]>,
): CashCollectResult {
  const manual = deal.cash_collected ?? null

  if (!deal.client_id) {
    return { effective: manual ?? 0, auto: 0, manual, source: null }
  }

  const since = (deal.won_at ?? deal.created_at ?? "").slice(0, 10)
  const relevant = (invoicesByClient.get(deal.client_id) ?? []).filter(
    (inv) => inv.payment_date && (!since || inv.payment_date >= since),
  )

  if (relevant.length === 0) {
    return { effective: manual ?? 0, auto: 0, manual, source: null }
  }

  const auto = relevant.reduce((sum, inv) => sum + (inv.amount || 0), 0)
  const sources = new Set(relevant.map((inv) => inv.source))
  const source: PaymentSource =
    sources.size > 1
      ? "mixed"
      : ((sources.values().next().value ?? null) as "asaas" | "local" | null)

  return { effective: manual ?? auto, auto, manual, source }
}
