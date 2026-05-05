/**
 * Omnisend Report Builder
 *
 * Produz uma resposta JSON no mesmo formato de /api/integrations/klaviyo/report
 * porem a partir de dados Omnisend (cache em tabelas omnisend_* e, como
 * fallback, live-fetch via syncOmnisendForStore).
 *
 * Objetivo: permitir que o endpoint Klaviyo "dispatch" para esta funcao
 * quando a loja usa somente Omnisend, garantindo que os reports existentes
 * (Reports page, Overview, Analise, fullscreen) funcionem sem exigir
 * Klaviyo API key.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { upsertOmnisendSyncResults, normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { OmnisendRateLimitError } from "@/lib/integrations/omnisend/client"
import { logger } from "@/lib/logger"

const log = logger.child("OmnisendReportBuilder")

const CACHE_FRESH_MS = 35 * 60 * 1000 // 35 minutes (cron runs every 30min)

const PERIOD_DAYS: Record<string, number> = {
  "today": 1,
  "yesterday": 1,
  "1d": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

function daysForPeriod(period: string, customStart?: string | null, customEnd?: string | null): number {
  if (period === "custom" && customStart && customEnd) {
    const ms = new Date(customEnd).getTime() - new Date(customStart).getTime()
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)))
  }
  return PERIOD_DAYS[period] ?? 30
}

function dateRangeForPeriod(period: string, customStart?: string | null, customEnd?: string | null) {
  const now = new Date()
  const end = customEnd ? new Date(customEnd) : now
  const days = daysForPeriod(period, customStart, customEnd)
  // Omnisend "last 30 days" inclui o dia atual: hoje 05/05 com 30d puxa
  // de 06/04 ate 05/05 (30 dias contando hoje). Por isso subtraimos
  // (days - 1) — antes subtraiamos days inteiros e gerava 05/04 → 05/05
  // = 31 dias, causando divergencia ~3% vs dashboard.
  const start = customStart
    ? new Date(customStart)
    : new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

  const pad = (n: number) => String(n).padStart(2, "0")
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { startDateStr: toStr(start), endDateStr: toStr(end) }
}

function getCurrencySymbol(currency: string): string {
  switch ((currency || "").toUpperCase()) {
    case "BRL": return "R$"
    case "USD": return "$"
    case "EUR": return "€"
    case "GBP": return "£"
    default: return currency || ""
  }
}

export interface OmnisendReportResponse {
  success: boolean
  connected: boolean
  platform: "omnisend"
  storeName: string
  generatedAt: string
  period: string
  dateRange: { start: string; end: string }
  account: {
    currency: string
    currencySymbol: string
    locale: string
  }
  revenue: {
    storeRevenue: number
    storeOrders: number
    totalRevenue: number
    klaviyoAttributedRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalOrders: number
    klaviyoAttributedOrders: number
    averageOrderValue: number
    recoveryRate: number
  }
  emailPerformance: {
    delivered: number
    opened: number
    clicked: number
    bounceRate: number
    unsubscribeRate: number
    openRate: number
    clickRate: number
    clickToOpenRate: number
  }
  overview: {
    totalSubscribers: number
    totalLists: number
    totalSegments: number
    totalFlows: number
    liveFlows: number
    totalCampaigns: number
    sentCampaigns: number
    campaignsInPeriod: number
    totalTemplates: number
  }
  engagement: {
    engagedProfiles: number
    engagementRate: string
    engaged90dSegmentName: string | null
  }
  automation: {
    totalFlows: number
    liveFlows: number
    draftFlows: number
    automationCoverage: string
  }
  growth: {
    campaignsLast30Days: number
  }
  campaignPerformance: {
    totalRevenue: number
    totalConversions: number
    totalDelivered: number
    avgOpenRate: number
    avgClickRate: number
    campaigns: Array<{
      campaignId: string
      name: string
      revenue: number
      conversions: number
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
      bounceRate: number
      unsubscribeRate: number
      sendTime: string | null
    }>
  }
  flowPerformance: {
    totalRevenue: number
    totalConversions: number
    totalDelivered: number
    avgOpenRate: number
    avgClickRate: number
    flows: Array<{
      flowId: string
      name: string
      status: string
      revenue: number
      conversions: number
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
      bounceRate: number
      unsubscribeRate: number
    }>
  }
  lists: Array<{ id: string; name: string; profileCount: number; created: string }>
  segments: Array<{
    id: string
    name: string
    profileCount: number
    isActive: boolean
    isStarred: boolean
    created: string
  }>
  flows: Array<{ id: string; name: string; status: string; triggerType: string }>
  campaigns: {
    total: number
    sent: number
    scheduled: number
    drafts: number
    recentCampaigns: Array<{
      id: string
      name: string
      status: string
      sendTime: string | null
      revenue: number
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
    }>
    allInPeriod: Array<{
      id: string
      name: string
      status: string
      sendTime: string | null
    }>
  }
  integrations: {
    hasEcommerce: boolean
  }
  rateLimited?: boolean
  fromCache?: boolean
  fetchedAt?: string
}

/** Cache stale aceitavel como fallback quando live-fetch falha (24h) */
const STALE_CACHE_MAX_MS = 24 * 60 * 60 * 1000

interface StoreContext {
  storeId: string
  storeName: string
  orgId: string
}

/**
 * SELECT resiliente da linha store_revenue_summary. Tenta com a coluna
 * omnisend_total_orders (adicionada em 2026-04-22); faz fallback sem ela
 * se a migration nao foi aplicada.
 */
async function readSummaryRow(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  period: string
) {
  const baseCols = "omnisend_total_revenue, omnisend_campaign_revenue, omnisend_flow_revenue, store_total_revenue, store_orders, total_leads, engaged_leads, engagement_rate, currency, sync_status, fetched_at"
  const withOrders = `${baseCols}, omnisend_total_orders`

  let res = await admin
    .from("store_revenue_summary")
    .select(withOrders)
    .eq("store_id", storeId)
    .eq("period_label", period)
    .maybeSingle()

  if (res.error && /omnisend_total_orders/.test(res.error.message || "")) {
    res = await admin
      .from("store_revenue_summary")
      .select(baseCols)
      .eq("store_id", storeId)
      .eq("period_label", period)
      .maybeSingle()
  }
  return res
}

/**
 * Le dados do cache Omnisend (tabelas omnisend_*) para o periodo.
 * Retorna null se nao houver dados frescos em cache.
 */
async function readFromCache(storeId: string, period: string) {
  const admin = createAdminClient()

  const { data: summary } = await readSummaryRow(admin, storeId, period)

  if (!summary) return null

  const fetchedAt = summary.fetched_at ? new Date(summary.fetched_at as string) : null
  if (!fetchedAt || Date.now() - fetchedAt.getTime() > CACHE_FRESH_MS) return null
  if (summary.sync_status !== "ok" && summary.sync_status !== "partial") return null

  const [{ data: campaignRows }, { data: flowRows }] = await Promise.all([
    admin
      .from("omnisend_campaign_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false }),
    admin
      .from("omnisend_flow_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false }),
  ])

  // Dedup defensivo: se o sync historico deixou duplicatas (antes do
  // cleanup em 83175a0), o report mostrava 9 flows como 36. Aqui so
  // mantemos o row mais recente por campaign_id / flow_id.
  return {
    summary,
    campaignRows: dedupRowsBy(campaignRows || [], "campaign_id"),
    flowRows: dedupRowsBy(flowRows || [], "flow_id"),
    fetchedAt: summary.fetched_at as string,
  }
}

/**
 * Le dados do cache Omnisend com threshold relaxado (24h) para servir
 * como fallback quando o live-fetch falha (rate limit, timeout, etc.).
 */
async function readFromCacheStale(storeId: string, period: string) {
  const admin = createAdminClient()

  const { data: summary } = await readSummaryRow(admin, storeId, period)

  if (!summary) return null

  const fetchedAt = summary.fetched_at ? new Date(summary.fetched_at as string) : null
  if (!fetchedAt || Date.now() - fetchedAt.getTime() > STALE_CACHE_MAX_MS) return null

  const [{ data: campaignRows }, { data: flowRows }] = await Promise.all([
    admin.from("omnisend_campaign_metrics").select("*").eq("store_id", storeId).eq("period_label", period).order("fetched_at", { ascending: false }),
    admin.from("omnisend_flow_metrics").select("*").eq("store_id", storeId).eq("period_label", period).order("fetched_at", { ascending: false }),
  ])

  return {
    summary,
    campaignRows: dedupRowsBy(campaignRows || [], "campaign_id"),
    flowRows: dedupRowsBy(flowRows || [], "flow_id"),
    fetchedAt: summary.fetched_at as string,
  }
}

/** Dedup rows por chave, preservando a primeira (DB ja ordenou por
 *  fetched_at desc → mantem a mais recente). Cobre o caso de duplicatas
 *  historicas em omnisend_campaign_metrics / omnisend_flow_metrics antes
 *  do cleanup automatico ter sido aplicado. */
function dedupRowsBy<T extends Record<string, unknown>>(rows: T[], key: string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const id = String(r[key] ?? "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}

/** Le currency da source-of-truth (client_stores.currency), nao do
 *  cache de revenue. Antes pegavamos de store_revenue_summary, mas
 *  syncs antigos (pre-currency-per-store) deixavam EUR cacheado mesmo
 *  para lojas BRL. Ler da client_stores garante consistencia imediata. */
async function getStoreCurrency(storeId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("client_stores")
      .select("currency")
      .eq("id", storeId)
      .maybeSingle()
    return (data?.currency as string) || "BRL"
  } catch {
    return "BRL"
  }
}

/**
 * Gera o response a partir dos dados em cache.
 */
async function buildFromCache(
  store: StoreContext,
  period: string,
  dateRange: { startDateStr: string; endDateStr: string },
  cache: NonNullable<Awaited<ReturnType<typeof readFromCache>>>
): Promise<OmnisendReportResponse> {
  const s = cache.summary as Record<string, unknown>
  const currency = await getStoreCurrency(store.storeId)

  const campaignRevenue = Number(s.omnisend_campaign_revenue) || 0
  const flowRevenue = Number(s.omnisend_flow_revenue) || 0
  const storeRevenue = Number(s.store_total_revenue) || 0
  const storeOrders = Number(s.store_orders) || 0
  // omnisend_total_revenue e a fonte autoritativa (attributedRevenue da
  // Statistics API). Fallback para soma campaign+flow so para linhas legadas.
  const attributedRevenue = Number(s.omnisend_total_revenue) || (campaignRevenue + flowRevenue)
  const attributedOrders = Number(s.omnisend_total_orders) || 0

  // Aggregate email perf from campaign + flow rows
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let totalConversions = 0
  let bounceRateSum = 0
  let unsubRateSum = 0
  let rateCount = 0

  // Janela do periodo para filtrar campanhas (status=sent E send_time dentro).
  // O sync persiste TODAS as campanhas (nao apenas da janela) para alimentar
  // o calendario; o filtro do periodo acontece aqui no report-builder.
  const dateFromMs = new Date(`${dateRange.startDateStr}T00:00:00`).getTime()
  const dateToMs = new Date(`${dateRange.endDateStr}T23:59:59.999`).getTime()
  const isInPeriod = (sendTime: string | null): boolean => {
    if (!sendTime) return false
    const t = new Date(sendTime).getTime()
    return !Number.isNaN(t) && t >= dateFromMs && t <= dateToMs
  }

  const campaignsArrAll = cache.campaignRows.map((c: Record<string, unknown>) => {
    const delivered = Number(c.delivered) || 0
    const opened = Number(c.opened) || 0
    const clicked = Number(c.clicked) || 0
    const conversions = Number(c.conversions) || 0

    return {
      campaignId: c.campaign_id as string,
      name: (c.campaign_name as string) || "Untitled",
      revenue: Number(c.conversion_value) || 0,
      conversions,
      delivered,
      opens: opened,
      clicks: clicked,
      openRate: Number(c.open_rate) || 0,
      clickRate: Number(c.click_rate) || 0,
      bounceRate: Number(c.bounce_rate) || 0,
      unsubscribeRate: Number(c.unsubscribe_rate) || 0,
      sendTime: (c.send_time as string) || null,
      status: (c.campaign_status as string) || "sent",
    }
  })

  const campaignsArr = campaignsArrAll.filter(
    (c) => c.status === "sent" && isInPeriod(c.sendTime)
  )

  for (const c of campaignsArr) {
    totalDelivered += c.delivered
    totalOpens += c.opens
    totalClicks += c.clicks
    totalConversions += c.conversions
    if (c.delivered > 0) {
      bounceRateSum += c.bounceRate
      unsubRateSum += c.unsubscribeRate
      rateCount++
    }
  }

  const flowsArr = cache.flowRows.map((f: Record<string, unknown>) => {
    const delivered = Number(f.delivered) || 0
    const opened = Number(f.opened) || 0
    const clicked = Number(f.clicked) || 0
    const conversions = Number(f.conversions) || 0

    totalDelivered += delivered
    totalOpens += opened
    totalClicks += clicked
    totalConversions += conversions
    if (delivered > 0) {
      bounceRateSum += Number(f.bounce_rate) || 0
      unsubRateSum += Number(f.unsubscribe_rate) || 0
      rateCount++
    }

    return {
      flowId: f.flow_id as string,
      name: (f.flow_name as string) || "Untitled",
      status: (f.flow_status as string) || "live",
      triggerType: (f.trigger_type as string) || "custom",
      revenue: Number(f.conversion_value) || 0,
      conversions,
      delivered,
      opens: opened,
      clicks: clicked,
      openRate: Number(f.open_rate) || 0,
      clickRate: Number(f.click_rate) || 0,
      bounceRate: Number(f.bounce_rate) || 0,
      unsubscribeRate: Number(f.unsubscribe_rate) || 0,
    }
  })

  const avgBounceRate = rateCount > 0 ? bounceRateSum / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? unsubRateSum / rateCount : 0
  const openRate = totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0
  const clickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0
  const clickToOpenRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0

  const campaignDelivered = campaignsArr.reduce((sum, c) => sum + c.delivered, 0)
  const campaignOpens = campaignsArr.reduce((sum, c) => sum + c.opens, 0)
  const campaignClicks = campaignsArr.reduce((sum, c) => sum + c.clicks, 0)
  const flowDelivered = flowsArr.reduce((sum, f) => sum + f.delivered, 0)
  const flowOpens = flowsArr.reduce((sum, f) => sum + f.opens, 0)
  const flowClicks = flowsArr.reduce((sum, f) => sum + f.clicks, 0)

  const sentCampaignsCount = campaignsArr.length
  const liveFlowsCount = flowsArr.filter((f) => f.status === "live" || f.status === "enabled").length

  // TOTAL DE LEADS e ENGAJADOS 90D vem das colunas total_leads/engaged_leads
  // (nao total_subscribers/engaged_profiles, que nao existem na tabela).
  const totalSubscribers = Number(s.total_leads) || 0
  const engagedProfiles = Number(s.engaged_leads) || 0
  const engagementRate = Number(s.engagement_rate) || 0

  log.info("[ReportBuilder] summary (cache)", {
    storeId: store.storeId,
    faturamentoTotal: storeRevenue,
    totalOrders: storeOrders,
    receitaAtribuida: attributedRevenue,
    pedidosAtribuidos: attributedOrders,
    totalLeads: totalSubscribers,
    engajados90d: engagedProfiles,
  })

  return {
    success: true,
    connected: true,
    platform: "omnisend",
    storeName: store.storeName,
    generatedAt: new Date().toISOString(),
    period,
    dateRange: { start: dateRange.startDateStr, end: dateRange.endDateStr },
    account: {
      currency,
      currencySymbol: getCurrencySymbol(currency),
      locale: "pt-BR",
    },
    revenue: {
      storeRevenue,
      storeOrders,
      // FATURAMENTO TOTAL card le `revenue.storeRevenue ?? revenue.totalRevenue`.
      // Mantemos totalRevenue=attributedRevenue por compat, mas storeRevenue
      // tem prioridade e sera sempre usado quando disponivel.
      totalRevenue: attributedRevenue,
      klaviyoAttributedRevenue: attributedRevenue,
      campaignRevenue,
      flowRevenue,
      // TOTAL DE PEDIDOS = pedidos totais da loja (nao conversions de email)
      totalOrders: storeOrders,
      klaviyoAttributedOrders: attributedOrders || totalConversions,
      // TICKET MEDIO baseado na receita/pedidos TOTAIS da loja (nao atribuidos)
      averageOrderValue: storeOrders > 0 ? storeRevenue / storeOrders : 0,
      recoveryRate: storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0,
    },
    emailPerformance: {
      delivered: totalDelivered,
      opened: totalOpens,
      clicked: totalClicks,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate,
      openRate,
      clickRate,
      clickToOpenRate,
    },
    overview: {
      totalSubscribers,
      totalLists: 0,
      totalSegments: 0,
      totalFlows: flowsArr.length,
      liveFlows: liveFlowsCount,
      totalCampaigns: sentCampaignsCount,
      sentCampaigns: sentCampaignsCount,
      campaignsInPeriod: sentCampaignsCount,
      totalTemplates: 0,
    },
    engagement: {
      engagedProfiles,
      engagementRate: engagementRate > 0 ? engagementRate.toFixed(1) : "0",
      engaged90dSegmentName: null,
    },
    automation: {
      totalFlows: flowsArr.length,
      liveFlows: liveFlowsCount,
      draftFlows: flowsArr.length - liveFlowsCount,
      automationCoverage: flowsArr.length > 0
        ? ((liveFlowsCount / flowsArr.length) * 100).toFixed(0)
        : "0",
    },
    growth: {
      campaignsLast30Days: sentCampaignsCount,
    },
    campaignPerformance: {
      totalRevenue: campaignRevenue,
      totalConversions: campaignsArr.reduce((sum, c) => sum + c.conversions, 0),
      totalDelivered: campaignDelivered,
      avgOpenRate: campaignDelivered > 0 ? (campaignOpens / campaignDelivered) * 100 : 0,
      avgClickRate: campaignDelivered > 0 ? (campaignClicks / campaignDelivered) * 100 : 0,
      campaigns: campaignsArr
        .map(({ status: _status, ...rest }) => rest)
        .sort((a, b) => b.revenue - a.revenue),
    },
    flowPerformance: {
      totalRevenue: flowRevenue,
      totalConversions: flowsArr.reduce((sum, f) => sum + f.conversions, 0),
      totalDelivered: flowDelivered,
      avgOpenRate: flowDelivered > 0 ? (flowOpens / flowDelivered) * 100 : 0,
      avgClickRate: flowDelivered > 0 ? (flowClicks / flowDelivered) * 100 : 0,
      flows: flowsArr
        .map(({ triggerType: _t, ...rest }) => rest)
        .sort((a, b) => b.revenue - a.revenue),
    },
    lists: [],
    segments: [],
    flows: flowsArr.map((f) => ({
      id: f.flowId,
      name: f.name,
      status: f.status,
      triggerType: f.triggerType,
    })),
    campaigns: {
      total: sentCampaignsCount,
      sent: sentCampaignsCount,
      scheduled: 0,
      drafts: 0,
      recentCampaigns: campaignsArr
        .map((c) => ({
          id: c.campaignId,
          name: c.name,
          status: c.status,
          sendTime: c.sendTime,
          revenue: c.revenue,
          delivered: c.delivered,
          opens: c.opens,
          clicks: c.clicks,
          openRate: c.openRate,
          clickRate: c.clickRate,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      allInPeriod: campaignsArr.map((c) => ({
        id: c.campaignId,
        name: c.name,
        status: c.status,
        sendTime: c.sendTime,
      })),
    },
    integrations: { hasEcommerce: true },
    fromCache: true,
    fetchedAt: cache.fetchedAt,
  }
}

/**
 * Gera o response a partir de uma chamada live (syncOmnisendForStore).
 */
async function buildFromLiveFetch(
  store: StoreContext,
  period: string,
  dateRange: { startDateStr: string; endDateStr: string },
  days: number,
  apiKey: string
): Promise<OmnisendReportResponse> {
  const result = await syncOmnisendForStore({
    storeId: store.storeId,
    orgId: store.orgId,
    apiKey,
    periodDays: days,
    // Alinha com calendar para coincidir com dashboard Omnisend (00:00 do
    // primeiro dia ate 23:59:59.999 do ultimo). dateRangeForPeriod ja entrega
    // strings YYYY-MM-DD; aqui so anexamos a parte horaria em UTC.
    startDate: `${dateRange.startDateStr}T00:00:00.000Z`,
    endDate: `${dateRange.endDateStr}T23:59:59.999Z`,
  })

  if (!result.ok || !result.data) {
    // Re-lanca a classe de erro original para a camada acima conseguir
    // detectar rate limit e servir cache stale ou resposta graciosa.
    if (result.errorType === "rate_limit") {
      throw new OmnisendRateLimitError(result.retryAfterMs ?? 60_000)
    }
    throw new Error(result.error || "Falha ao buscar dados Omnisend")
  }

  // Persiste os dados vivos em store_revenue_summary +
  // omnisend_campaign_metrics + omnisend_flow_metrics, mesma rotina do cron.
  // Antes, apenas o cron persistia; a aba Reports fazia live-fetch mas nao
  // escrevia no DB — resultado: overview mostrava 0 campanhas / 0 flows
  // ate o proximo cron. Falhas aqui nao bloqueiam o render do report.
  try {
    const admin = createAdminClient()
    await upsertOmnisendSyncResults(
      admin,
      { id: store.storeId, org_id: store.orgId },
      result.data,
      period,
    )
  } catch (persistErr) {
    log.warn("[Omnisend Report] Live-fetch persistence failed (non-fatal)", {
      storeId: store.storeId,
      period,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    })
  }

  const d = result.data
  const campaignRevenue = d.totalCampaignRevenue
  const flowRevenue = d.totalAutomationRevenue
  // Prefer attributedRevenue direto da Statistics API (fonte autoritativa).
  // Fallback: soma campaign+flow (caminho legado).
  const attributedRevenue = d.totalAttributedRevenue > 0
    ? d.totalAttributedRevenue
    : (campaignRevenue + flowRevenue)
  const attributedOrders = d.totalAttributedOrders
  const storeRevenue = d.totalStoreRevenue
  const storeOrders = d.totalOrders
  const currency = d.currency || "BRL"

  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let totalConversions = 0
  let bounceRateSum = 0
  let unsubRateSum = 0
  let rateCount = 0

  const dateFromMs = new Date(`${dateRange.startDateStr}T00:00:00`).getTime()
  const dateToMs = new Date(`${dateRange.endDateStr}T23:59:59.999`).getTime()
  const isInPeriod = (sendTime: string | null): boolean => {
    if (!sendTime) return false
    const t = new Date(sendTime).getTime()
    return !Number.isNaN(t) && t >= dateFromMs && t <= dateToMs
  }

  const campaignsArrAll = d.campaignRows.map((c) => ({
    campaignId: c.campaign_id,
    name: c.campaign_name,
    status: c.campaign_status,
    revenue: c.conversion_value,
    conversions: c.conversions,
    delivered: c.delivered,
    opens: c.opened,
    clicks: c.clicked,
    openRate: c.open_rate,
    clickRate: c.click_rate,
    bounceRate: c.bounce_rate,
    unsubscribeRate: c.unsubscribe_rate,
    sendTime: c.send_time,
  }))

  const campaignsArr = campaignsArrAll.filter(
    (c) => c.status === "sent" && isInPeriod(c.sendTime)
  )

  for (const c of campaignsArr) {
    totalDelivered += c.delivered
    totalOpens += c.opens
    totalClicks += c.clicks
    totalConversions += c.conversions
    if (c.delivered > 0) {
      bounceRateSum += c.bounceRate
      unsubRateSum += c.unsubscribeRate
      rateCount++
    }
  }

  const flowsArr = d.automationRows.map((f) => {
    totalDelivered += f.delivered
    totalOpens += f.opened
    totalClicks += f.clicked
    totalConversions += f.conversions
    if (f.delivered > 0) {
      bounceRateSum += f.bounce_rate
      unsubRateSum += f.unsubscribe_rate
      rateCount++
    }
    return {
      flowId: f.automation_id,
      name: f.automation_name,
      status: f.automation_status,
      triggerType: f.trigger_type || "custom",
      revenue: f.conversion_value,
      conversions: f.conversions,
      delivered: f.delivered,
      opens: f.opened,
      clicks: f.clicked,
      openRate: f.open_rate,
      clickRate: f.click_rate,
      bounceRate: f.bounce_rate,
      unsubscribeRate: f.unsubscribe_rate,
    }
  })

  const avgBounceRate = rateCount > 0 ? bounceRateSum / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? unsubRateSum / rateCount : 0
  const openRate = totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0
  const clickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0
  const clickToOpenRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0

  const campaignDelivered = campaignsArr.reduce((sum, c) => sum + c.delivered, 0)
  const campaignOpens = campaignsArr.reduce((sum, c) => sum + c.opens, 0)
  const campaignClicks = campaignsArr.reduce((sum, c) => sum + c.clicks, 0)
  const flowDelivered = flowsArr.reduce((sum, f) => sum + f.delivered, 0)
  const flowOpens = flowsArr.reduce((sum, f) => sum + f.opens, 0)
  const flowClicks = flowsArr.reduce((sum, f) => sum + f.clicks, 0)

  const sentCampaignsCount = campaignsArr.length
  const liveFlowsCount = flowsArr.filter((f) => f.status === "enabled" || f.status === "active" || f.status === "live").length
  // TOTAL DE LEADS vem dos contatos TOTAIS (nao apenas subscribed).
  // Subscribed (4290) != total de leads (14094) != engajados 90d (3408).
  const totalSubscribers = d.totalContacts
  const engagedProfiles = d.engagedContacts
  const engagementRateLive = d.totalContacts > 0
    ? Math.round((engagedProfiles / d.totalContacts) * 10000) / 100
    : 0

  log.info("[ReportBuilder] summary (live)", {
    storeId: store.storeId,
    faturamentoTotal: storeRevenue,
    totalOrders: storeOrders,
    receitaAtribuida: attributedRevenue,
    pedidosAtribuidos: attributedOrders,
    totalLeads: totalSubscribers,
    engajados90d: engagedProfiles,
    campaignsSent: sentCampaignsCount,
    flowsLive: liveFlowsCount,
  })

  return {
    success: true,
    connected: true,
    platform: "omnisend",
    storeName: store.storeName,
    generatedAt: new Date().toISOString(),
    period,
    dateRange: { start: dateRange.startDateStr, end: dateRange.endDateStr },
    account: {
      currency,
      currencySymbol: getCurrencySymbol(currency),
      locale: "pt-BR",
    },
    revenue: {
      storeRevenue,
      storeOrders,
      totalRevenue: attributedRevenue,
      klaviyoAttributedRevenue: attributedRevenue,
      campaignRevenue,
      flowRevenue,
      totalOrders: storeOrders,
      klaviyoAttributedOrders: attributedOrders || totalConversions,
      averageOrderValue: storeOrders > 0 ? storeRevenue / storeOrders : 0,
      recoveryRate: storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0,
    },
    emailPerformance: {
      delivered: totalDelivered,
      opened: totalOpens,
      clicked: totalClicks,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate,
      openRate,
      clickRate,
      clickToOpenRate,
    },
    overview: {
      totalSubscribers,
      totalLists: 0,
      totalSegments: d.segments.length,
      totalFlows: flowsArr.length,
      liveFlows: liveFlowsCount,
      totalCampaigns: sentCampaignsCount,
      sentCampaigns: sentCampaignsCount,
      campaignsInPeriod: sentCampaignsCount,
      totalTemplates: 0,
    },
    engagement: {
      // engagedProfiles = contagem real do segmento "Engajados 90d" (~3408),
      // NAO subscribedContacts (~4290). O /new page mapeia este campo para
      // overview.engagedSegmentSize, que alimenta o card "Engajados (90d)".
      engagedProfiles,
      engagementRate: engagementRateLive > 0 ? engagementRateLive.toFixed(1) : "0",
      engaged90dSegmentName: null,
    },
    automation: {
      totalFlows: flowsArr.length,
      liveFlows: liveFlowsCount,
      draftFlows: flowsArr.length - liveFlowsCount,
      automationCoverage: flowsArr.length > 0
        ? ((liveFlowsCount / flowsArr.length) * 100).toFixed(0)
        : "0",
    },
    growth: {
      campaignsLast30Days: sentCampaignsCount,
    },
    campaignPerformance: {
      totalRevenue: campaignRevenue,
      totalConversions: campaignsArr.reduce((sum, c) => sum + c.conversions, 0),
      totalDelivered: campaignDelivered,
      avgOpenRate: campaignDelivered > 0 ? (campaignOpens / campaignDelivered) * 100 : 0,
      avgClickRate: campaignDelivered > 0 ? (campaignClicks / campaignDelivered) * 100 : 0,
      campaigns: campaignsArr
        .map(({ status: _status, ...rest }) => rest)
        .sort((a, b) => b.revenue - a.revenue),
    },
    flowPerformance: {
      totalRevenue: flowRevenue,
      totalConversions: flowsArr.reduce((sum, f) => sum + f.conversions, 0),
      totalDelivered: flowDelivered,
      avgOpenRate: flowDelivered > 0 ? (flowOpens / flowDelivered) * 100 : 0,
      avgClickRate: flowDelivered > 0 ? (flowClicks / flowDelivered) * 100 : 0,
      flows: flowsArr
        .map(({ triggerType: _t, ...rest }) => rest)
        .sort((a, b) => b.revenue - a.revenue),
    },
    lists: [],
    segments: d.segments.map((seg) => ({
      id: seg.segmentID,
      name: seg.name,
      profileCount: seg.contactsCount,
      isActive: true,
      isStarred: false,
      created: seg.createdAt || "",
    })),
    flows: flowsArr.map((f) => ({
      id: f.flowId,
      name: f.name,
      status: f.status,
      triggerType: f.triggerType,
    })),
    campaigns: {
      total: sentCampaignsCount,
      sent: sentCampaignsCount,
      scheduled: 0,
      drafts: 0,
      recentCampaigns: campaignsArr
        .map((c) => ({
          id: c.campaignId,
          name: c.name,
          status: c.status,
          sendTime: c.sendTime,
          revenue: c.revenue,
          delivered: c.delivered,
          opens: c.opens,
          clicks: c.clicks,
          openRate: c.openRate,
          clickRate: c.clickRate,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      allInPeriod: campaignsArr.map((c) => ({
        id: c.campaignId,
        name: c.name,
        status: c.status,
        sendTime: c.sendTime,
      })),
    },
    integrations: { hasEcommerce: true },
    fromCache: false,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Constroi o report Omnisend completo.
 *
 * Estrategia:
 *   1. Cache fresco (< 35min) → serve imediatamente
 *   2. Cache stale (> 35min) → guarda como fallback, tenta live-fetch
 *   3. Live-fetch sucesso → serve dados frescos
 *   4. Live-fetch falha (rate limit, erro) → serve cache stale se disponivel
 *   5. Tudo falha → retorna response com rateLimited ou erro
 */
export async function buildOmnisendReport(
  store: StoreContext,
  rawPeriod: string,
  customStartDate?: string | null,
  customEndDate?: string | null
): Promise<OmnisendReportResponse> {
  // Normaliza period_label para o que a constraint do DB aceita.
  //   "today"/"yesterday" → "1d"
  //   "1y"                → "12m"
  //   "custom" + datas    → "custom:YYYY-MM-DD:YYYY-MM-DD"
  // Sem isso, todas as queries de cache (read + write) falham e o
  // report fica zerado.
  const period = normalizePeriodLabel(rawPeriod, customStartDate, customEndDate)
  const dateRange = dateRangeForPeriod(rawPeriod, customStartDate, customEndDate)

  // 1) Tenta cache fresco
  let staleCache: NonNullable<Awaited<ReturnType<typeof readFromCache>>> | null = null
  try {
    const cached = await readFromCache(store.storeId, period)
    if (cached) {
      log.info("[Omnisend Report] Serving from fresh cache", { storeId: store.storeId, period })
      return await buildFromCache(store, period, dateRange, cached)
    }
  } catch (err) {
    log.warn("[Omnisend Report] Cache read failed", { error: err })
  }

  // 2) Tenta cache stale (ate 24h) como fallback
  try {
    staleCache = await readFromCacheStale(store.storeId, period)
  } catch { /* ignore */ }

  // 3) Live fetch
  const credentials = await getStoreCredentials(store.storeId, store.orgId)
  const apiKey = credentials.omnisend_api_key
  if (!apiKey) {
    // Sem API key e sem cache → erro
    if (staleCache) {
      log.info("[Omnisend Report] No API key, serving stale cache", { storeId: store.storeId })
      return await buildFromCache(store, period, dateRange, staleCache)
    }
    throw new Error("API Key Omnisend não configurada para esta loja")
  }

  // daysForPeriod precisa do rawPeriod ("today" = 1, "yesterday" = 1)
  const days = daysForPeriod(rawPeriod, customStartDate, customEndDate)
  try {
    log.info("[Omnisend Report] Cache miss, live-fetching", { storeId: store.storeId, period, rawPeriod, days })
    return await buildFromLiveFetch(store, period, dateRange, days, apiKey)
  } catch (err) {
    // Rate limited ou erro → serve cache stale se disponivel
    if (staleCache) {
      log.warn("[Omnisend Report] Live-fetch failed, serving stale cache", {
        storeId: store.storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      const response = await buildFromCache(store, period, dateRange, staleCache)
      response.rateLimited = err instanceof OmnisendRateLimitError
      response.fromCache = true
      return response
    }

    // Sem cache e sem live → retorna response com rateLimited
    if (err instanceof OmnisendRateLimitError) {
      log.warn("[Omnisend Report] Rate limited, no cache available", { storeId: store.storeId })
      return {
        success: true,
        connected: true,
        platform: "omnisend",
        rateLimited: true,
        storeName: store.storeName,
        generatedAt: new Date().toISOString(),
        period,
        dateRange: { start: dateRange.startDateStr, end: dateRange.endDateStr },
        account: { currency: "BRL", currencySymbol: "R$", locale: "pt-BR" },
        revenue: { storeRevenue: 0, storeOrders: 0, totalRevenue: 0, klaviyoAttributedRevenue: 0, campaignRevenue: 0, flowRevenue: 0, totalOrders: 0, klaviyoAttributedOrders: 0, averageOrderValue: 0, recoveryRate: 0 },
        emailPerformance: { delivered: 0, opened: 0, clicked: 0, bounceRate: 0, unsubscribeRate: 0, openRate: 0, clickRate: 0, clickToOpenRate: 0 },
        overview: { totalSubscribers: 0, totalLists: 0, totalSegments: 0, totalFlows: 0, liveFlows: 0, totalCampaigns: 0, sentCampaigns: 0, campaignsInPeriod: 0, totalTemplates: 0 },
        engagement: { engagedProfiles: 0, engagementRate: "0", engaged90dSegmentName: null },
        automation: { totalFlows: 0, liveFlows: 0, draftFlows: 0, automationCoverage: "0" },
        growth: { campaignsLast30Days: 0 },
        campaignPerformance: { totalRevenue: 0, totalConversions: 0, totalDelivered: 0, avgOpenRate: 0, avgClickRate: 0, campaigns: [] },
        flowPerformance: { totalRevenue: 0, totalConversions: 0, totalDelivered: 0, avgOpenRate: 0, avgClickRate: 0, flows: [] },
        lists: [], segments: [], flows: [],
        campaigns: { total: 0, sent: 0, scheduled: 0, drafts: 0, recentCampaigns: [], allInPeriod: [] },
        integrations: { hasEcommerce: true },
        fromCache: false,
        fetchedAt: new Date().toISOString(),
      } as OmnisendReportResponse
    }

    throw err
  }
}
