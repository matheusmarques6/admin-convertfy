/**
 * Cálculo dos itens de produto de um negócio (estilo Datacrazy/Pipedrive).
 *
 * Puro e testado porque é dinheiro: total de linha = qtd × preço × (1 −
 * desconto%), com arredondamento a 2 casas POR LINHA — somar valores já
 * arredondados é o que o cliente confere na proposta; arredondar só o
 * total geraria diferenças de centavos entre a lista e o rodapé.
 *
 * `deals.value` = soma de TODOS os itens (único + recorrente). É a única
 * definição de valor que o kanban, o funil e as metas já usam — criar um
 * segundo "valor" quebraria todos os KPIs. O breakdown por recorrência é
 * informativo (UI mostra "R$ X único · R$ Y/mês").
 */

export interface DealProductLine {
  quantity: number
  unit_price: number
  discount_pct: number
  billing_type?: string | null
}

/** Arredonda a 2 casas com EPSILON — 1.005 vira 1.01, não 1.00. */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

/** Clamp de quantidade: mínimo 1 (0 ou negativo não é linha, é remoção). */
export function normalizeQuantity(raw: number | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 1
  return round2(n)
}

/** Clamp de desconto 0–100. */
export function normalizeDiscount(raw: number | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return round2(n)
}

/** Total da linha: qtd × preço × (1 − desconto%), 2 casas. */
export function lineTotal(item: DealProductLine): number {
  const qty = Number(item.quantity) || 0
  const price = Number(item.unit_price) || 0
  const disc = normalizeDiscount(item.discount_pct)
  return round2(qty * price * (1 - disc / 100))
}

export interface DealTotals {
  /** Soma das linhas one_time. */
  oneTime: number
  /** Soma das linhas recurring (1 ciclo). */
  recurring: number
  /** oneTime + recurring — vai para deals.value. */
  total: number
  count: number
}

export function dealTotals(items: DealProductLine[]): DealTotals {
  let oneTime = 0
  let recurring = 0
  for (const item of items) {
    const t = lineTotal(item)
    if (item.billing_type === "recurring") recurring = round2(recurring + t)
    else oneTime = round2(oneTime + t)
  }
  return {
    oneTime,
    recurring,
    total: round2(oneTime + recurring),
    count: items.length,
  }
}

/**
 * Valor efetivo do deal: com itens, a soma VENCE o valor manual (regra
 * Pipedrive — produtos são a fonte); sem itens, o manual continua livre.
 */
export function resolveDealValue(
  items: DealProductLine[],
  manualValue: number | null | undefined,
): number {
  if (items.length > 0) return dealTotals(items).total
  return round2(Number(manualValue) || 0)
}
