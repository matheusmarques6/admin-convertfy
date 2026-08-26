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

/**
 * Fallback da série diária: deriva pontos por dia direto das linhas de
 * campanha (send_time) quando store_daily_metrics ainda não tem a
 * janela — MESMA fonte que o backfill do cron usa, só que em memória.
 * Sem isso, cron parado = gráfico eternamente "coletando".
 */
export interface CampaignDailyRow {
  store_id: string
  campaign_id: string
  send_time: string | null
  recipients: number | null
  delivered: number | null
  opened: number | null
  clicked: number | null
  conversions: number | null
  conversion_value: number | null
  bounced: number | null
  unsubscribed: number | null
  fetched_at: string | null
}

export function dailyPointsFromCampaignRows(
  rows: CampaignDailyRow[],
  win: DateWindow,
): EmailDailyPoint[] {
  // Dedup por (store, campaign) mantendo o sync mais recente — a mesma
  // campanha pode ter linhas de syncs concorrentes.
  const dedup = new Map<string, CampaignDailyRow>()
  for (const r of rows) {
    if (!r.send_time) continue
    const key = `${r.store_id}|${r.campaign_id}`
    const ex = dedup.get(key)
    if (!ex || new Date(r.fetched_at ?? 0).getTime() > new Date(ex.fetched_at ?? 0).getTime()) {
      dedup.set(key, r)
    }
  }
  const byDate = new Map<string, EmailDailyPoint>()
  for (const r of dedup.values()) {
    const date = String(r.send_time).slice(0, 10)
    if (date < win.from || date > win.to) continue
    const p = byDate.get(date) ?? {
      date,
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      conversions: 0,
      conversion_value: 0,
      bounced: 0,
      unsubscribed: 0,
      openRate: 0,
      clickRate: 0,
      ctor: 0,
      placedOrderRate: 0,
    }
    p.recipients += Number(r.recipients) || 0
    p.delivered += Number(r.delivered) || 0
    p.opened += Number(r.opened) || 0
    p.clicked += Number(r.clicked) || 0
    p.conversions += Number(r.conversions) || 0
    p.conversion_value += Number(r.conversion_value) || 0
    p.bounced += Number(r.bounced) || 0
    p.unsubscribed += Number(r.unsubscribed) || 0
    byDate.set(date, p)
  }
  return [...byDate.values()]
    .map((p) => ({
      ...p,
      openRate: p.delivered > 0 ? Math.round((p.opened / p.delivered) * 1000) / 10 : 0,
      clickRate: p.delivered > 0 ? Math.round((p.clicked / p.delivered) * 1000) / 10 : 0,
      ctor: p.opened > 0 ? Math.round((p.clicked / p.opened) * 1000) / 10 : 0,
      placedOrderRate:
        p.delivered > 0 ? Math.round((p.conversions / p.delivered) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
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
  // Janela ATUAL vazia = coleta parada → NENHUM delta (comparar "0" da
  // coleta parada com o histórico gerava "↓100 pp" mentiroso na tela).
  const comparable = current.length > 0 && previous.length > 0
  const ppDelta = (cur: number, prev: number): number | null =>
    comparable ? Math.round((cur - prev) * 100) / 100 : null
  return {
    atual: fillDays(current, curWin),
    anterior: fillDays(previous, prevWin),
    totals,
    totalsPrev,
    deltas: {
      revenue: comparable ? computeDeltaPct(totals.revenue, totalsPrev.revenue) : null,
      openRate: ppDelta(totals.openRate, totalsPrev.openRate),
      clickRate: ppDelta(totals.clickRate, totalsPrev.clickRate),
      ctor: ppDelta(totals.ctor, totalsPrev.ctor),
      placedOrderRate: ppDelta(totals.placedOrderRate, totalsPrev.placedOrderRate),
      rpe: comparable ? computeDeltaPct(totals.rpe, totalsPrev.rpe) : null,
      deliveryRate: ppDelta(totals.deliveryRate, totalsPrev.deliveryRate),
      unsubRate: ppDelta(totals.unsubRate, totalsPrev.unsubRate),
    },
    collecting: current.length === 0,
  }
}
