/**
 * sync-period-order — ordena os períodos a sincronizar no cron
 * sync-reports pelos MAIS famintos primeiro.
 *
 * Problema (jul/2026): a ordem fixa de CACHED_PERIODS (30d, 7d, 15d,
 * 90d, 12m) + orçamento XS por ciclo fazia o cron gastar tudo nos
 * períodos curtos e NUNCA chegar nos longos — em produção, 90d cobria
 * 28 de 63 lojas integradas com sync de semanas atrás, o que quebrava
 * o delta "vs média 90d" do dashboard (+3763%).
 *
 * A fome é medida pela razão idade/threshold do período (quantas vezes
 * o threshold de freshness já estourou): 90d com 3 dias de idade
 * (razão 6× o threshold de 12h) fura a fila na frente de 30d com 4h
 * (razão 1.3× de 3h). Período sem dado nenhum vem SEMPRE primeiro.
 *
 * Módulo puro (zero I/O) — testável.
 */

import {
  PERIOD_FRESHNESS_THRESHOLDS,
  type CachedPeriod,
} from "@/lib/shared/data-status"

export type PeriodFreshnessMap = Map<string, Date | null>

export function orderPeriodsByStaleness(
  periods: readonly string[],
  freshness: PeriodFreshnessMap,
  now: number,
): string[] {
  const hungerOf = (period: string): number => {
    const fetchedAt = freshness.get(period)
    if (!fetchedAt) return Number.POSITIVE_INFINITY // nunca sincronizado
    const threshold = PERIOD_FRESHNESS_THRESHOLDS[period as CachedPeriod] ?? 1
    return (now - fetchedAt.getTime()) / Math.max(1, threshold)
  }
  // sort estável: empates preservam a ordem original (30d antes de 7d etc.)
  return [...periods].sort((a, b) => hungerOf(b) - hungerOf(a))
}
