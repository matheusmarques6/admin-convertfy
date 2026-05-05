/**
 * Omnisend Health Metrics Service
 *
 * Coleta metricas de saude (deliverability, reputacao, engajamento) via
 * fetchOmnisendReports (POST /api/analytics/reports) e calcula score 0-100
 * usando a formula recomendada pelo suporte da Omnisend.
 *
 * Cache: aproveita o cache L1+L2 (1h fresh / 24h stale) ja embutido no
 * fetchOmnisendReports. Limite oficial: 55 calls/dia/brand → 24 calls
 * por dia se rodar a cada hora ainda cabe com folga.
 */

import { fetchOmnisendReports, type OmnisendReportsResult } from "@/lib/services/omnisend-sync.service"

export interface OmnisendHealthMetrics {
  // Engagement
  sent: number
  openedUnique: number
  openRate: number
  clickedUnique: number
  clickRate: number
  // Deliverability
  bounced: number
  bounceRate: number
  failed: number
  failRate: number
  // Reputation
  unsubscribedUnique: number
  unsubscribeRate: number
  markedAsSpamUnique: number
  markedAsSpamRate: number
  // Conversao
  attributedOrders: number
  attributedRevenue: number
  // Score derivado
  score: number
  issues: string[]
}

const EMPTY_HEALTH: OmnisendHealthMetrics = {
  sent: 0,
  openedUnique: 0,
  openRate: 0,
  clickedUnique: 0,
  clickRate: 0,
  bounced: 0,
  bounceRate: 0,
  failed: 0,
  failRate: 0,
  unsubscribedUnique: 0,
  unsubscribeRate: 0,
  markedAsSpamUnique: 0,
  markedAsSpamRate: 0,
  attributedOrders: 0,
  attributedRevenue: 0,
  score: 0,
  issues: [],
}

/**
 * Score 0-100 ponderado por conversao (40%), retencao (20%) e
 * entregabilidade (40%). Formula recomendada pelo suporte da Omnisend.
 *
 * Rates da API vem em decimal 0-1 (ex: openRate=0.20 → 20%). A formula
 * usa rates como decimais e o resultado e multiplicado por 100 para
 * cair na faixa 0-100.
 *
 * Faixas: 80-100 excelente · 60-79 bom · 40-59 medio · <40 critico.
 */
export function calculateOmnisendHealthScore(r: OmnisendReportsResult): { score: number; issues: string[] } {
  const issues: string[] = []

  // Sem envios no periodo: score 0 (loja inativa nao "saudavel" por
  // omissao). Antes a tela mostrava 100 quando todos os rates eram 0.
  if (r.sent === 0) {
    return { score: 0, issues: ["Sem envios no periodo"] }
  }

  const orderRate = r.attributedOrders / r.sent

  const score =
    r.openRate * 0.20 +
    r.clickRate * 0.20 +
    orderRate * 0.20 +
    (1 - r.failRate) * 0.15 +
    (1 - r.unsubscribeRate) * 0.10 +
    (1 - r.markedAsSpamRate) * 0.10 +
    (r.openRate + r.clickRate) * 0.05

  const score100 = Math.max(0, Math.min(100, Math.round(score * 100)))

  // Issues acionaveis pra UI explicar quando algo esta ruim.
  // Thresholds em rates (0-1): comparados em forma decimal.
  if (r.bounceRate > 0.03) issues.push(`Bounce rate critico: ${(r.bounceRate * 100).toFixed(2)}%`)
  else if (r.bounceRate > 0.02) issues.push(`Bounce rate alto: ${(r.bounceRate * 100).toFixed(2)}%`)

  if (r.markedAsSpamRate > 0.003) issues.push(`Spam rate critico: ${(r.markedAsSpamRate * 100).toFixed(2)}%`)
  else if (r.markedAsSpamRate > 0.001) issues.push(`Spam rate elevado: ${(r.markedAsSpamRate * 100).toFixed(3)}%`)

  if (r.unsubscribeRate > 0.005) issues.push(`Unsub rate alto: ${(r.unsubscribeRate * 100).toFixed(2)}%`)
  else if (r.unsubscribeRate > 0.003) issues.push(`Unsub rate acima da media: ${(r.unsubscribeRate * 100).toFixed(2)}%`)

  if (r.openRate < 0.15) issues.push(`Open rate baixo: ${(r.openRate * 100).toFixed(1)}%`)
  else if (r.openRate < 0.20) issues.push(`Open rate abaixo da media: ${(r.openRate * 100).toFixed(1)}%`)

  if (r.failRate > 0.02) issues.push(`Fail rate alto: ${(r.failRate * 100).toFixed(2)}%`)

  return { score: score100, issues }
}

/**
 * Busca health metrics da Omnisend para uma loja. Usa fetchOmnisendReports
 * que ja cache L1+L2 com TTL de 1h. Falhas (rate limit, 5xx) servem stale
 * cache antes de zerar.
 */
export async function fetchOmnisendHealth(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<OmnisendHealthMetrics> {
  try {
    const r = await fetchOmnisendReports(apiKey, startDate, endDate)
    const { score, issues } = calculateOmnisendHealthScore(r)
    return {
      sent: r.sent,
      openedUnique: r.openedUnique,
      openRate: r.openRate,
      clickedUnique: r.clickedUnique,
      clickRate: r.clickRate,
      bounced: r.bounced,
      bounceRate: r.bounceRate,
      failed: r.failed,
      failRate: r.failRate,
      unsubscribedUnique: r.unsubscribedUnique,
      unsubscribeRate: r.unsubscribeRate,
      markedAsSpamUnique: r.markedAsSpamUnique,
      markedAsSpamRate: r.markedAsSpamRate,
      attributedOrders: r.attributedOrders,
      attributedRevenue: r.attributedRevenue,
      score,
      issues,
    }
  } catch {
    return { ...EMPTY_HEALTH }
  }
}
