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
  /** Intervalo da recorrência (snapshot). NULL/ausente = mensal. */
  recurring_interval?: string | null
}

// ─── Intervalos de recorrência ───────────────────────────────────
// O incidente: a UI assumia "/mês" pra QUALQUER recorrência e o
// "Em 12m" multiplicava tudo por 12 — um plano semestral de R$ 18
// aparecia como "R$ 18/mês" e anualizava como R$ 216.

export type RecurringInterval = "monthly" | "quarterly" | "semiannual" | "yearly"

export const RECURRING_INTERVALS: RecurringInterval[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
]

const INTERVAL_META: Record<RecurringInterval, { label: string; suffix: string; cycles: number }> = {
  monthly: { label: "Mensal", suffix: "/mês", cycles: 12 },
  quarterly: { label: "Trimestral", suffix: "/tri", cycles: 4 },
  semiannual: { label: "Semestral", suffix: "/sem", cycles: 2 },
  yearly: { label: "Anual", suffix: "/ano", cycles: 1 },
}

/** Normaliza qualquer valor vindo do banco pro domínio (default mensal). */
export function normalizeInterval(raw: string | null | undefined): RecurringInterval {
  return (RECURRING_INTERVALS as string[]).includes(raw ?? "") ? (raw as RecurringInterval) : "monthly"
}

export function intervalLabel(raw: string | null | undefined): string {
  return INTERVAL_META[normalizeInterval(raw)].label
}

/** Sufixo de exibição: "/mês", "/tri", "/sem", "/ano". */
export function intervalSuffix(raw: string | null | undefined): string {
  return INTERVAL_META[normalizeInterval(raw)].suffix
}

/** Quantos ciclos cabem em 12 meses (mensal 12, trimestral 4...). */
export function cyclesPerYear(raw: string | null | undefined): number {
  return INTERVAL_META[normalizeInterval(raw)].cycles
}

/** Arredonda a 2 casas com EPSILON — 1.005 vira 1.01, não 1.00. */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

/**
 * Interpreta número digitado em formato brasileiro OU técnico.
 *
 * O incidente que motivou isto: vendedor digitou "10.000" querendo dez
 * mil e o `parseFloat` entregou 10 — o negócio ficou 1000x menor sem
 * ninguém perceber. Regras:
 *   - vírgula presente → vírgula é o decimal, pontos são milhar ("10.000,50")
 *   - só pontos, e o último grupo tem 3 dígitos → milhar BR ("10.000" → 10000)
 *   - só pontos, último grupo com 1-2 dígitos → decimal técnico ("10.5", "10000.50")
 *   - "R$", espaços e símbolos são ignorados
 */
export function parseBRNumber(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0
  if (!raw) return 0
  let s = String(raw).replace(/[^\d.,-]/g, "")
  if (!s) return 0
  const negative = s.startsWith("-")
  s = s.replace(/-/g, "")

  let normalized: string
  if (s.includes(",")) {
    // vírgula é decimal; pontos são separador de milhar
    normalized = s.replace(/\./g, "").replace(",", ".")
  } else {
    const parts = s.split(".")
    if (parts.length === 1) {
      normalized = s
    } else {
      const last = parts[parts.length - 1]
      if (last.length === 3) {
        // "10.000" / "1.234.567" → milhar BR
        normalized = parts.join("")
      } else {
        // "10.5" / "10000.50" → decimal técnico (junta grupos anteriores)
        normalized = parts.slice(0, -1).join("") + "." + last
      }
    }
  }
  const n = parseFloat(normalized)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

/** "1234567" (string de centavos) → "12.345,67". Vazio → "". */
export function formatCentsBRL(centsStr: string): string {
  if (!centsStr) return ""
  const cents = parseInt(centsStr, 10) || 0
  const reais = Math.floor(cents / 100)
  const cen = cents % 100
  return `${reais.toLocaleString("pt-BR")},${cen.toString().padStart(2, "0")}`
}

/** Número em reais → string de centavos ("997.5" → "99750"). */
export function numberToCents(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ""
  return String(Math.round(n * 100))
}

/** String de centavos → número em reais ("99750" → 997.5). */
export function centsToNumber(centsStr: string): number {
  if (!centsStr) return 0
  return (parseInt(centsStr, 10) || 0) / 100
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
 * Recorrência agrupada por intervalo, na ordem canônica — a UI mostra
 * "R$ X/mês · R$ Y/sem" em vez de somar ciclos diferentes num "/mês".
 */
export function recurringByInterval(
  items: DealProductLine[],
): Array<{ interval: RecurringInterval; amount: number }> {
  const sums = new Map<RecurringInterval, number>()
  for (const item of items) {
    if (item.billing_type !== "recurring") continue
    const interval = normalizeInterval(item.recurring_interval)
    sums.set(interval, round2((sums.get(interval) ?? 0) + lineTotal(item)))
  }
  return RECURRING_INTERVALS.filter((i) => sums.has(i)).map((interval) => ({
    interval,
    amount: sums.get(interval)!,
  }))
}

/**
 * Projeção de 12 meses: únicos + cada recorrência × ciclos no ano
 * (mensal ×12, trimestral ×4, semestral ×2, anual ×1).
 */
export function annualizedTotal(items: DealProductLine[]): number {
  let total = 0
  for (const item of items) {
    const t = lineTotal(item)
    total = round2(
      total + (item.billing_type === "recurring" ? t * cyclesPerYear(item.recurring_interval) : t),
    )
  }
  return total
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
