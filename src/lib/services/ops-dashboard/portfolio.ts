/**
 * Carteira — churn 30d e lojas sem envio 14d (métricas que o design
 * pede e NENHUMA rota agregava; sem mock, então nasceram aqui).
 *
 * Churn: assinaturas `cancelled` cuja última mudança caiu na janela.
 * A tabela não tem cancelled_at — updated_at é o melhor proxy (a
 * transição de status é o último write no fluxo normal) e o card
 * declara a janela. MRR normalizado por ciclo com a MESMA régua do
 * /api/crm/dashboard/cs (YEARLY/12 etc.) pra os números baterem.
 */

export interface ChurnedSubRow {
  client_id: string
  value: number | string
  cycle: string | null
}

const CYCLE_DIVISOR: Record<string, number> = {
  YEARLY: 12,
  SEMIANNUALLY: 6,
  QUARTERLY: 3,
  MONTHLY: 1,
  BIWEEKLY: 0.5,
  WEEKLY: 0.25,
}

/** Valor mensal equivalente de uma assinatura (mesma régua do CS). */
export function monthlyValue(value: number | string, cycle: string | null): number {
  const v = Number(value) || 0
  const divisor = CYCLE_DIVISOR[(cycle || "MONTHLY").toUpperCase()] ?? 1
  return v / divisor
}

export function summarizeChurn(rows: ChurnedSubRow[]): {
  clients: number
  mrr_cents: number
} {
  const byClient = new Map<string, number>()
  for (const r of rows) {
    byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + monthlyValue(r.value, r.cycle))
  }
  const mrr = [...byClient.values()].reduce((s, v) => s + v, 0)
  return { clients: byClient.size, mrr_cents: Math.round(mrr * 100) }
}

/**
 * Lojas ativas SEM campanha enviada desde o cutoff (inclui quem nunca
 * enviou). `recentSenders` = store_ids com send_time >= cutoff.
 */
export function storesWithoutRecentSend<T extends { id: string; store_name: string }>(
  activeStores: T[],
  recentSenders: Set<string>,
): T[] {
  return activeStores.filter((s) => !recentSenders.has(s.id))
}

/**
 * Tendência REAL por loja: open rate da 2ª metade da janela vs a 1ª
 * (store_daily_metrics). O "trend" antigo comparava a loja com a MÉDIA
 * da carteira — não era tendência temporal. null = volume insuficiente
 * em alguma metade (< MIN_DELIVERED) ou variação < 0,5 pp (estável).
 */
export interface DailyTrendRow {
  store_id: string
  metric_date: string
  delivered: number | null
  opened: number | null
}

const TREND_MIN_DELIVERED = 50
const TREND_MIN_PP = 0.5

export function computeStoreTrends(
  rows: DailyTrendRow[],
  midDateExclusive: string,
): Map<string, "up" | "down" | null> {
  const acc = new Map<string, { d1: number; o1: number; d2: number; o2: number }>()
  for (const r of rows) {
    const a = acc.get(r.store_id) ?? { d1: 0, o1: 0, d2: 0, o2: 0 }
    const delivered = Number(r.delivered) || 0
    const opened = Number(r.opened) || 0
    if (r.metric_date < midDateExclusive) {
      a.d1 += delivered
      a.o1 += opened
    } else {
      a.d2 += delivered
      a.o2 += opened
    }
    acc.set(r.store_id, a)
  }
  const out = new Map<string, "up" | "down" | null>()
  for (const [storeId, a] of acc) {
    if (a.d1 < TREND_MIN_DELIVERED || a.d2 < TREND_MIN_DELIVERED) {
      out.set(storeId, null)
      continue
    }
    const r1 = (a.o1 / a.d1) * 100
    const r2 = (a.o2 / a.d2) * 100
    const diff = r2 - r1
    out.set(storeId, diff >= TREND_MIN_PP ? "up" : diff <= -TREND_MIN_PP ? "down" : null)
  }
  return out
}

/** Meia-janela (data ISO exclusiva do 2º trecho) pro cálculo de trend. */
export function midDate(win: { from: string; to: string; days: number }): string {
  const start = new Date(`${win.from}T00:00:00.000Z`).getTime()
  const half = Math.floor(win.days / 2)
  return new Date(start + half * 86_400_000).toISOString().slice(0, 10)
}
