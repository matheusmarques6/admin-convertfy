/**
 * Agregação da série diária (store_daily_metrics) pro Dashboard
 * Operacional: janela atual + janela anterior → séries pro gráfico,
 * totais e deltas REAIS (taxas ponderadas por volume, nunca média de
 * médias). A fonte cobre CAMPANHAS por dia (flows não têm série diária
 * — a UI rotula isso; honestidade > fidelidade ao mock).
 */

import type { EmailDailyPoint } from "@/lib/services/store-daily-metrics.service"
import { computeDeltaPct, type DateWindow } from "./period-window"

export interface OpsSeriesPoint {
  date: string
  revenue: number
  delivered: number
  openRate: number
  clickRate: number
  conversions: number
}

export interface OpsSeriesTotals {
  revenue: number
  recipients: number
  delivered: number
  opened: number
  clicked: number
  conversions: number
  bounced: number
  unsubscribed: number
  openRate: number
  clickRate: number
  ctor: number
  placedOrderRate: number
  rpe: number
  deliveryRate: number
  unsubRate: number
}

export interface OpsSeriesPayload {
  atual: OpsSeriesPoint[]
  anterior: OpsSeriesPoint[]
  totals: OpsSeriesTotals
  totalsPrev: OpsSeriesTotals
  /** Delta % atual vs anterior; null = sem base de comparação. */
  deltas: {
    revenue: number | null
    openRate: number | null
    clickRate: number | null
    ctor: number | null
    placedOrderRate: number | null
    rpe: number | null
    deliveryRate: number | null
    unsubRate: number | null
  }
  /** true = a coleta diária ainda não tem pontos na janela atual. */
  collecting: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function totalsFromPoints(points: EmailDailyPoint[]): OpsSeriesTotals {
  const sum = (k: keyof EmailDailyPoint) =>
    points.reduce((s, p) => s + (Number(p[k]) || 0), 0)
  const recipients = sum("recipients")
  const delivered = sum("delivered")
  const opened = sum("opened")
  const clicked = sum("clicked")
  const conversions = sum("conversions")
  const revenue = sum("conversion_value")
  const bounced = sum("bounced")
  const unsubscribed = sum("unsubscribed")
  return {
    revenue: round2(revenue),
    recipients,
    delivered,
    opened,
    clicked,
    conversions,
    bounced,
    unsubscribed,
    openRate: delivered > 0 ? round2((opened / delivered) * 100) : 0,
    clickRate: delivered > 0 ? round2((clicked / delivered) * 100) : 0,
    ctor: opened > 0 ? round2((clicked / opened) * 100) : 0,
    placedOrderRate: delivered > 0 ? round2((conversions / delivered) * 100) : 0,
    rpe: recipients > 0 ? round2(revenue / recipients) : 0,
    deliveryRate: recipients > 0 ? round2((delivered / recipients) * 100) : 0,
    unsubRate: delivered > 0 ? round2((unsubscribed / delivered) * 100) : 0,
  }
}

/** Preenche dias sem linha com zeros — o gráfico precisa de eixo contínuo. */
export function fillDays(points: EmailDailyPoint[], win: DateWindow): OpsSeriesPoint[] {
  if (points.length === 0) return []
  const byDate = new Map(points.map((p) => [p.date, p]))
  const out: OpsSeriesPoint[] = []
  const start = new Date(`${win.from}T00:00:00.000Z`).getTime()
  for (let i = 0; i < win.days; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
    const p = byDate.get(date)
    out.push({
      date,
      revenue: round2(p?.conversion_value ?? 0),
      delivered: p?.delivered ?? 0,
      openRate: p?.openRate ?? 0,
      clickRate: p?.clickRate ?? 0,
      conversions: p?.conversions ?? 0,
    })
  }
  return out
}

export function buildOpsSeries(
  current: EmailDailyPoint[],
  previous: EmailDailyPoint[],
  curWin: DateWindow,
  prevWin: DateWindow,
): OpsSeriesPayload {
  const totals = totalsFromPoints(current)
  const totalsPrev = totalsFromPoints(previous)
  // Delta de taxa é diferença em PONTOS PERCENTUAIS (pp), não %-de-% —
  // exceto revenue/rpe, que são valores (delta relativo em %).
  const ppDelta = (cur: number, prev: number): number | null =>
    previous.length === 0 ? null : Math.round((cur - prev) * 100) / 100
  return {
    atual: fillDays(current, curWin),
    anterior: fillDays(previous, prevWin),
    totals,
    totalsPrev,
    deltas: {
      revenue: computeDeltaPct(totals.revenue, totalsPrev.revenue),
      openRate: ppDelta(totals.openRate, totalsPrev.openRate),
      clickRate: ppDelta(totals.clickRate, totalsPrev.clickRate),
      ctor: ppDelta(totals.ctor, totalsPrev.ctor),
      placedOrderRate: ppDelta(totals.placedOrderRate, totalsPrev.placedOrderRate),
      rpe: computeDeltaPct(totals.rpe, totalsPrev.rpe),
      deliveryRate: ppDelta(totals.deliveryRate, totalsPrev.deliveryRate),
      unsubRate: ppDelta(totals.unsubRate, totalsPrev.unsubRate),
    },
    collecting: current.length === 0,
  }
}
