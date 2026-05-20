/**
 * Weekly Report Service
 *
 * Gera relatorios semanais por loja agregando metricas das tabelas
 * `omnisend_campaign_metrics` e `omnisend_flow_metrics` da semana
 * (e da semana anterior pra calcular variacoes).
 *
 * Highlights/concerns/suggestions sao gerados heuristicamente — IA
 * opcional via `generateAiSummary`.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import type { WeeklyReport, WeeklyReportMetrics } from "@/types/weekly-report"

const log = logger.child("WeeklyReport")

/** Retorna a segunda-feira da semana de uma data (semana ISO). */
export function startOfWeek(d: Date): Date {
  const dt = new Date(d)
  const day = dt.getUTCDay() // 0=Dom,1=Seg
  const diff = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diff)
  dt.setUTCHours(0, 0, 0, 0)
  return dt
}

export function addDays(d: Date, n: number): Date {
  const dt = new Date(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

interface AggResult {
  revenue: number
  campaigns_sent: number
  recipients: number
  opened: number
  clicked: number
  open_rate: number
  click_rate: number
}

async function aggregateCampaignMetrics(
  storeId: string,
  start: Date,
  end: Date,
): Promise<AggResult> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("omnisend_campaign_metrics")
    .select(
      "recipients, delivered, opened, clicked, conversion_value, send_time, period_start",
    )
    .eq("store_id", storeId)
    .gte("send_time", start.toISOString())
    .lt("send_time", end.toISOString())

  const rows = data ?? []
  const recipients = rows.reduce((s, r) => s + (r.recipients ?? 0), 0)
  const opened = rows.reduce((s, r) => s + (r.opened ?? 0), 0)
  const clicked = rows.reduce((s, r) => s + (r.clicked ?? 0), 0)
  const revenue = rows.reduce((s, r) => s + Number(r.conversion_value ?? 0), 0)

  return {
    revenue,
    campaigns_sent: rows.length,
    recipients,
    opened,
    clicked,
    open_rate: recipients > 0 ? +(opened / recipients).toFixed(4) : 0,
    click_rate: recipients > 0 ? +(clicked / recipients).toFixed(4) : 0,
  }
}

interface PaidOrdersAgg {
  count: number
  value: number
  source: "tracking" | "none"
}

/**
 * Agrega pedidos pagos do periodo. Fonte automatica: tracking_orders
 * via tracking_stores.client_store_id. Se a loja nao tem modulo de
 * tracking ativo, retorna 0/0 + source="none" (CM preenche manual).
 */
async function aggregatePaidOrders(
  storeId: string,
  start: Date,
  end: Date,
): Promise<PaidOrdersAgg> {
  const admin = createAdminClient()

  const { data: trackingStore } = await admin
    .from("tracking_stores")
    .select("id")
    .eq("client_store_id", storeId)
    .maybeSingle()

  if (!trackingStore?.id) {
    return { count: 0, value: 0, source: "none" }
  }

  const { data: orders, error } = await admin
    .from("tracking_orders")
    .select("total_price, financial_status, order_created_at")
    .eq("tracking_store_id", trackingStore.id)
    .eq("financial_status", "paid")
    .gte("order_created_at", start.toISOString())
    .lt("order_created_at", end.toISOString())

  if (error || !orders) return { count: 0, value: 0, source: "none" }

  const value = orders.reduce(
    (s, o) => s + Number(o.total_price ?? 0),
    0,
  )
  return {
    count: orders.length,
    value,
    source: "tracking",
  }
}

async function aggregateTopFlows(
  storeId: string,
  start: Date,
  end: Date,
): Promise<{
  revenue_total: number
  top_flows: Array<{
    flow_id: string
    flow_name: string
    revenue: number
    conversions: number
  }>
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("omnisend_flow_metrics")
    .select("flow_id, flow_name, conversions, conversion_value, period_start")
    .eq("store_id", storeId)
    .gte("period_start", start.toISOString())
    .lt("period_start", end.toISOString())
    .order("conversion_value", { ascending: false })
    .limit(20)

  const rows = data ?? []
  const map = new Map<
    string,
    { flow_id: string; flow_name: string; revenue: number; conversions: number }
  >()
  let total = 0
  for (const r of rows) {
    const rev = Number(r.conversion_value ?? 0)
    total += rev
    const cur = map.get(r.flow_id) ?? {
      flow_id: r.flow_id,
      flow_name: r.flow_name,
      revenue: 0,
      conversions: 0,
    }
    cur.revenue += rev
    cur.conversions += r.conversions ?? 0
    map.set(r.flow_id, cur)
  }
  const top = Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  return { revenue_total: total, top_flows: top }
}

function deriveInsights(metrics: WeeklyReportMetrics): {
  highlights: string[]
  concerns: string[]
  suggestions: string[]
} {
  const highlights: string[] = []
  const concerns: string[] = []
  const suggestions: string[] = []

  if (metrics.revenue.change_pct >= 10) {
    highlights.push(
      `Receita cresceu ${metrics.revenue.change_pct}% comparado à semana anterior.`,
    )
  } else if (metrics.revenue.change_pct <= -10) {
    concerns.push(
      `Receita caiu ${Math.abs(metrics.revenue.change_pct)}% — investigar causa.`,
    )
    suggestions.push(
      "Enviar campanha de reengajamento para a base que abriu nos últimos 30 dias.",
    )
  }

  const openRatePts = Math.round(
    (metrics.opens.rate - metrics.opens.rate_previous) * 100,
  )
  if (openRatePts >= 3) {
    highlights.push(`Taxa de abertura subiu ${openRatePts}pp.`)
  } else if (openRatePts <= -3) {
    concerns.push(`Taxa de abertura caiu ${Math.abs(openRatePts)}pp.`)
    suggestions.push(
      "Revisar subject lines e horários de envio — testar A/B nas próximas campanhas.",
    )
  }

  if (metrics.campaigns_sent === 0) {
    concerns.push("Nenhuma campanha enviada na semana.")
    suggestions.push("Planejar pelo menos 1 campanha promocional ou newsletter.")
  } else if (metrics.campaigns_sent >= 3) {
    highlights.push(`${metrics.campaigns_sent} campanhas enviadas na semana.`)
  }

  const topFlow = metrics.flows.top_flows[0]
  if (topFlow && topFlow.revenue > 0) {
    highlights.push(
      `Flow top: "${topFlow.flow_name}" com R$ ${Math.round(topFlow.revenue).toLocaleString("pt-BR")} em revenue.`,
    )
  }
  if (metrics.flows.revenue_total === 0) {
    concerns.push("Flows não geraram receita na semana.")
    suggestions.push("Revisar status dos flows e fluxo de carrinho abandonado.")
  }

  return { highlights, concerns, suggestions }
}

/**
 * Aplica metrics_overrides sobre metrics auto-gerado. Override marcado
 * como source="manual" quando ha sobrescrita de paid_orders. Recalcula
 * change_pct se revenue.current foi sobrescrito.
 */
export function applyMetricsOverrides(
  metrics: WeeklyReportMetrics,
  overrides: WeeklyReport["metrics_overrides"] | null | undefined,
): WeeklyReportMetrics {
  if (!overrides) return metrics

  const out: WeeklyReportMetrics = JSON.parse(JSON.stringify(metrics))

  if (overrides.revenue) {
    Object.assign(out.revenue, overrides.revenue)
    out.revenue.change_pct = pct(out.revenue.current, out.revenue.previous)
  }
  if (typeof overrides.campaigns_sent === "number") {
    out.campaigns_sent = overrides.campaigns_sent
  }
  if (overrides.opens) {
    Object.assign(out.opens, overrides.opens)
  }
  if (overrides.clicks) {
    Object.assign(out.clicks, overrides.clicks)
  }
  if (overrides.paid_orders) {
    out.paid_orders = {
      count: out.paid_orders?.count ?? 0,
      value: out.paid_orders?.value ?? 0,
      previous_count: out.paid_orders?.previous_count ?? 0,
      previous_value: out.paid_orders?.previous_value ?? 0,
      source: "manual",
      ...overrides.paid_orders,
    }
    // Garante source=manual quando ha override
    out.paid_orders.source = "manual"
  }
  return out
}

interface GenerateOptions {
  /** Forçar regenerar mesmo que ja exista relatorio salvo. */
  force?: boolean
}

export async function generateWeeklyReport(
  storeId: string,
  weekStart: Date,
  weekEnd: Date,
  opts: GenerateOptions = {},
): Promise<WeeklyReport | null> {
  const admin = createAdminClient()

  // Verifica duplicata
  if (!opts.force) {
    const { data: existing } = await admin
      .from("weekly_reports")
      .select("id")
      .eq("store_id", storeId)
      .eq("week_start", weekStart.toISOString().slice(0, 10))
      .maybeSingle()
    if (existing) {
      log.debug("Report ja existe", { storeId })
      return null
    }
  }

  // Busca org_id da loja
  const { data: store } = await admin
    .from("client_stores")
    .select("id, org_id, store_name")
    .eq("id", storeId)
    .maybeSingle()
  if (!store?.org_id) return null

  const prevStart = addDays(weekStart, -7)
  const prevEnd = weekStart

  const [curr, prev, flows, paidCurr, paidPrev] = await Promise.all([
    aggregateCampaignMetrics(storeId, weekStart, weekEnd),
    aggregateCampaignMetrics(storeId, prevStart, prevEnd),
    aggregateTopFlows(storeId, weekStart, weekEnd),
    aggregatePaidOrders(storeId, weekStart, weekEnd),
    aggregatePaidOrders(storeId, prevStart, prevEnd),
  ])

  const metrics: WeeklyReportMetrics = {
    revenue: {
      current: curr.revenue,
      previous: prev.revenue,
      change_pct: pct(curr.revenue, prev.revenue),
    },
    campaigns_sent: curr.campaigns_sent,
    opens: {
      current: curr.opened,
      previous: prev.opened,
      rate: curr.open_rate,
      rate_previous: prev.open_rate,
    },
    clicks: {
      current: curr.clicked,
      previous: prev.clicked,
      rate: curr.click_rate,
      rate_previous: prev.click_rate,
    },
    flows,
    paid_orders: {
      count: paidCurr.count,
      value: paidCurr.value,
      previous_count: paidPrev.count,
      previous_value: paidPrev.value,
      source: paidCurr.source,
    },
  }

  const { highlights, concerns, suggestions } = deriveInsights(metrics)

  const payload = {
    org_id: store.org_id,
    store_id: storeId,
    week_start: weekStart.toISOString().slice(0, 10),
    week_end: weekEnd.toISOString().slice(0, 10),
    metrics,
    highlights,
    concerns,
    suggestions,
    is_reviewed: false,
  }

  const { data, error } = opts.force
    ? await admin
        .from("weekly_reports")
        .upsert(payload, { onConflict: "store_id,week_start" })
        .select("*")
        .single()
    : await admin.from("weekly_reports").insert(payload).select("*").single()

  if (error) {
    log.error("Save error", { storeId, code: error.code, msg: error.message })
    return null
  }
  return data as WeeklyReport
}

export async function generateAllWeeklyReports(
  orgId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<{ generated: number; skipped: number }> {
  const admin = createAdminClient()
  const { data: stores } = await admin
    .from("client_stores")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)

  let generated = 0
  let skipped = 0
  for (const s of stores ?? []) {
    const r = await generateWeeklyReport(s.id, weekStart, weekEnd)
    if (r) generated++
    else skipped++
  }
  return { generated, skipped }
}
