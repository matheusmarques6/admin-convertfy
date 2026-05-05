/**
 * Omnisend Campaigns/Flows Builder
 *
 * Produz respostas nos mesmos formatos de:
 *   - /api/integrations/klaviyo/campaigns
 *   - /api/integrations/klaviyo/flows
 *
 * A partir das tabelas omnisend_campaign_metrics e omnisend_flow_metrics
 * (com fallback para live-fetch via syncOmnisendForStore).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { syncOmnisendForStore, type OmnisendSyncData } from "@/lib/services/omnisend-sync.service"
import { upsertOmnisendSyncResults, normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { OmnisendRateLimitError } from "@/lib/integrations/omnisend/client"
import { logger } from "@/lib/logger"

/** Persiste os dados do sync vivo nas tabelas omnisend_*_metrics +
 *  store_revenue_summary. Chamado pelos builders de campaigns/flows apos
 *  um live-fetch bem-sucedido, garantindo que o overview e os reports
 *  futuros servidos via cache vejam os mesmos numeros. Falhas nao
 *  bloqueiam a resposta do endpoint. */
async function persistLiveFetch(storeId: string, orgId: string, period: string, data: OmnisendSyncData) {
  try {
    const admin = createAdminClient()
    await upsertOmnisendSyncResults(admin, { id: storeId, org_id: orgId }, data, period)
  } catch (err) {
    log.warn("[Omnisend Builder] Live-fetch persistence failed (non-fatal)", {
      storeId, period, error: err instanceof Error ? err.message : String(err),
    })
  }
}

const log = logger.child("OmnisendCampaignsFlowsBuilder")
const CACHE_FRESH_MS = 35 * 60 * 1000
const STALE_CACHE_MAX_MS = 24 * 60 * 60 * 1000

/** Le currency da source-of-truth (client_stores.currency). Antes
 *  pegavamos de store_revenue_summary, que ficava preso em "EUR" depois
 *  de syncs antigos antes da migration de currency-per-store. Ler da
 *  client_stores garante que mudancas de moeda na config aparecem na
 *  hora, sem esperar o cache do summary expirar. */
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

const PERIOD_DAYS: Record<string, number> = {
  today: 1, yesterday: 1, "1d": 1, "7d": 7, "15d": 15,
  "30d": 30, "90d": 90, "12m": 365,
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
  // "Last 30 days" igual Omnisend: inclui hoje (05/05 com 30d → 06/04 a
  // 05/05, total 30 dias). Subtrair days inteiros gerava 31 dias.
  const start = customStart
    ? new Date(customStart)
    : new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)

  const pad = (n: number) => String(n).padStart(2, "0")
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { startDateStr: toStr(start), endDateStr: toStr(end) }
}

interface StoreCtx {
  storeId: string
  storeName: string
  orgId: string
}

interface CampaignResponseRow {
  id: string
  name: string
  status: string
  sendTime: string | null
  createdAt: string
  channel: string
  subject: string | null
  recipients: number
  delivered: number
  deliveryRate: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  clickToOpenRate: number
  conversions: number
  conversionRate: number
  conversionValue: number
  revenuePerRecipient: number
  averageOrderValue: number
  bounced: number
  bounceRate: number
  unsubscribed: number
  unsubscribeRate: number
  revenue: number
}

interface FlowResponseRow {
  id: string
  name: string
  status: string
  triggerType: string
  created: string
  archived: boolean
  recipients: number
  delivered: number
  deliveryRate: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  clickToOpenRate: number
  conversions: number
  conversionRate: number
  conversionValue: number
  revenuePerRecipient: number
  averageOrderValue: number
  bounced: number
  bounceRate: number
  unsubscribed: number
  unsubscribeRate: number
  revenue: number
}

function aggregateCampaignSummary(campaigns: CampaignResponseRow[]) {
  const totals = campaigns.reduce(
    (acc, c) => ({
      totalCampaigns: acc.totalCampaigns + 1,
      sentCampaigns: acc.sentCampaigns + (c.status === "sent" ? 1 : 0),
      scheduledCampaigns: acc.scheduledCampaigns + (c.status === "scheduled" ? 1 : 0),
      draftCampaigns: acc.draftCampaigns + (c.status === "draft" ? 1 : 0),
      cancelledCampaigns: acc.cancelledCampaigns + (c.status === "cancelled" ? 1 : 0),
      emailCampaigns: acc.emailCampaigns + (c.channel === "email" ? 1 : 0),
      smsCampaigns: acc.smsCampaigns + (c.channel === "sms" ? 1 : 0),
      totalRecipients: acc.totalRecipients + c.recipients,
      totalDelivered: acc.totalDelivered + c.delivered,
      totalOpened: acc.totalOpened + c.opened,
      totalClicked: acc.totalClicked + c.clicked,
      totalConversions: acc.totalConversions + c.conversions,
      totalRevenue: acc.totalRevenue + c.conversionValue,
      totalBounced: acc.totalBounced + c.bounced,
      totalUnsubscribed: acc.totalUnsubscribed + c.unsubscribed,
    }),
    {
      totalCampaigns: 0, sentCampaigns: 0, scheduledCampaigns: 0,
      draftCampaigns: 0, cancelledCampaigns: 0, emailCampaigns: 0,
      smsCampaigns: 0, totalRecipients: 0, totalDelivered: 0,
      totalOpened: 0, totalClicked: 0, totalConversions: 0,
      totalRevenue: 0, totalBounced: 0, totalUnsubscribed: 0,
    }
  )

  const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
  const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
  const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0
  const avgBounceRate = totals.totalRecipients > 0 ? (totals.totalBounced / totals.totalRecipients) * 100 : 0

  return {
    ...totals,
    avgOpenRate: Math.round(avgOpenRate * 100) / 100,
    avgClickRate: Math.round(avgClickRate * 100) / 100,
    avgConversionRate: Math.round(avgConversionRate * 100) / 100,
    avgBounceRate: Math.round(avgBounceRate * 100) / 100,
    revenuePerRecipient: totals.totalRecipients > 0
      ? Math.round((totals.totalRevenue / totals.totalRecipients) * 100) / 100
      : 0,
  }
}

function aggregateFlowSummary(flows: FlowResponseRow[]) {
  const totals = flows.reduce(
    (acc, f) => ({
      totalFlows: acc.totalFlows + 1,
      liveFlows: acc.liveFlows + (f.status === "live" || f.status === "enabled" ? 1 : 0),
      draftFlows: acc.draftFlows + (f.status === "draft" ? 1 : 0),
      totalRecipients: acc.totalRecipients + f.recipients,
      totalDelivered: acc.totalDelivered + f.delivered,
      totalOpened: acc.totalOpened + f.opened,
      totalClicked: acc.totalClicked + f.clicked,
      totalConversions: acc.totalConversions + f.conversions,
      totalRevenue: acc.totalRevenue + f.conversionValue,
      totalBounced: acc.totalBounced + f.bounced,
      totalUnsubscribed: acc.totalUnsubscribed + f.unsubscribed,
    }),
    {
      totalFlows: 0, liveFlows: 0, draftFlows: 0,
      totalRecipients: 0, totalDelivered: 0, totalOpened: 0,
      totalClicked: 0, totalConversions: 0, totalRevenue: 0,
      totalBounced: 0, totalUnsubscribed: 0,
    }
  )

  const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
  const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
  const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0

  return {
    ...totals,
    avgOpenRate: Math.round(avgOpenRate * 100) / 100,
    avgClickRate: Math.round(avgClickRate * 100) / 100,
    avgConversionRate: Math.round(avgConversionRate * 100) / 100,
    revenuePerRecipient: totals.totalRecipients > 0
      ? Math.round((totals.totalRevenue / totals.totalRecipients) * 100) / 100
      : 0,
  }
}

/**
 * Constroi resposta de /api/integrations/klaviyo/campaigns a partir de Omnisend.
 */
export async function buildOmnisendCampaignsResponse(
  store: StoreCtx,
  rawPeriod: string,
  customStartDate?: string | null,
  customEndDate?: string | null,
  statusFilter?: string | null
) {
  // Normaliza period_label antes de qualquer query:
  //   "today"/"yesterday" → "1d"
  //   "1y"                → "12m"
  //   "custom" + datas    → "custom:YYYY-MM-DD:YYYY-MM-DD"
  // Sem isso, a constraint do DB rejeita o upsert.
  const period = normalizePeriodLabel(rawPeriod, customStartDate, customEndDate)
  const { startDateStr, endDateStr } = dateRangeForPeriod(rawPeriod, customStartDate, customEndDate)
  const admin = createAdminClient()

  // 1) Cache
  try {
    const { data: cached } = await admin
      .from("omnisend_campaign_metrics")
      .select("*")
      .eq("store_id", store.storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false })

    if (cached && cached.length > 0) {
      const latestFetchedAt = new Date(cached[0].fetched_at as string)
      if (Date.now() - latestFetchedAt.getTime() < CACHE_FRESH_MS) {
        const campaigns = dedupCampaigns(cached.map((r: Record<string, unknown>) => mapCachedCampaign(r)))
        const filtered = statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns
        filtered.sort(sortCampaigns)

        const currency = await getStoreCurrency(store.storeId)

        log.info("[Omnisend Campaigns] Serving from cache", { storeId: store.storeId, period })
        return {
          success: true,
          period: { start: startDateStr, end: endDateStr, label: period },
          fromCache: true,
          fetchedAt: cached[0].fetched_at as string,
          currency,
          summary: aggregateCampaignSummary(filtered),
          campaigns: filtered,
          platform: "omnisend",
        }
      }
    }
  } catch (err) {
    log.warn("[Omnisend Campaigns] Cache read failed, falling through", { error: err })
  }

  // 2) Tenta cache stale como fallback (ate 24h)
  let staleCache: { data: Record<string, unknown>[]; currency: string; fetchedAt: string } | null = null
  try {
    const { data: staleCached } = await admin
      .from("omnisend_campaign_metrics")
      .select("*")
      .eq("store_id", store.storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false })

    if (staleCached && staleCached.length > 0) {
      const latestFetchedAt = new Date(staleCached[0].fetched_at as string)
      if (Date.now() - latestFetchedAt.getTime() < STALE_CACHE_MAX_MS) {
        staleCache = {
          data: staleCached,
          currency: await getStoreCurrency(store.storeId),
          fetchedAt: staleCached[0].fetched_at as string,
        }
      }
    }
  } catch { /* ignore */ }

  // 3) Live fetch
  const credentials = await getStoreCredentials(store.storeId, store.orgId)
  const apiKey = credentials.omnisend_api_key
  if (!apiKey) {
    if (staleCache) {
      return buildCampaignsFromStaleCache(staleCache, startDateStr, endDateStr, period, statusFilter)
    }
    throw new Error("API Key Omnisend não configurada")
  }

  // daysForPeriod precisa do rawPeriod (today=1, yesterday=1)
  const days = daysForPeriod(rawPeriod, customStartDate, customEndDate)
  try {
    const result = await syncOmnisendForStore({
      storeId: store.storeId,
      orgId: store.orgId,
      apiKey,
      periodDays: days,
      startDate: `${startDateStr}T00:00:00.000Z`,
      endDate: `${endDateStr}T23:59:59.999Z`,
    })

    if (!result.ok || !result.data) {
      if (staleCache) {
        log.warn("[Omnisend Campaigns] Sync failed, serving stale cache", { storeId: store.storeId, error: result.error })
        const resp = buildCampaignsFromStaleCache(staleCache, startDateStr, endDateStr, period, statusFilter)
        resp.rateLimited = result.errorType === "rate_limit"
        return resp
      }
      throw new Error(result.error || "Falha ao sincronizar Omnisend")
    }

    // Persiste o sync vivo (idempotente com o cron)
    await persistLiveFetch(store.storeId, store.orgId, period, result.data)

    const campaigns: CampaignResponseRow[] = result.data.campaignRows.map((c) => ({
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.campaign_status,
      sendTime: c.send_time,
      createdAt: c.send_time || "",
      channel: c.channel,
      subject: c.subject,
      recipients: c.recipients,
      delivered: c.delivered,
      deliveryRate: c.delivery_rate,
      opened: c.opened,
      openRate: c.open_rate,
      clicked: c.clicked,
      clickRate: c.click_rate,
      clickToOpenRate: c.delivered > 0 && c.opened > 0 ? (c.clicked / c.opened) * 100 : 0,
      conversions: c.conversions,
      conversionRate: c.conversion_rate,
      conversionValue: c.conversion_value,
      revenuePerRecipient: c.revenue_per_recipient,
      averageOrderValue: c.conversions > 0 ? c.conversion_value / c.conversions : 0,
      bounced: c.bounced,
      bounceRate: c.bounce_rate,
      unsubscribed: c.unsubscribed,
      unsubscribeRate: c.unsubscribe_rate,
      revenue: c.conversion_value,
    }))

    const filtered = statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns
    filtered.sort(sortCampaigns)

    return {
      success: true,
      period: { start: startDateStr, end: endDateStr, label: period },
      fromCache: false,
      fetchedAt: new Date().toISOString(),
      currency: result.data.currency || "BRL",
      summary: aggregateCampaignSummary(filtered),
      campaigns: filtered,
      platform: "omnisend",
    }
  } catch (err) {
    if (staleCache) {
      log.warn("[Omnisend Campaigns] Live-fetch failed, serving stale cache", {
        storeId: store.storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      const resp = buildCampaignsFromStaleCache(staleCache, startDateStr, endDateStr, period, statusFilter)
      resp.rateLimited = err instanceof OmnisendRateLimitError
      return resp
    }
    throw err
  }
}

function buildCampaignsFromStaleCache(
  cache: { data: Record<string, unknown>[]; currency: string; fetchedAt: string },
  startDateStr: string, endDateStr: string, period: string, statusFilter?: string | null
) {
  const campaigns = dedupCampaigns(cache.data.map((r) => mapCachedCampaign(r)))
  const filtered = statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns
  filtered.sort(sortCampaigns)

  return {
    success: true as const,
    period: { start: startDateStr, end: endDateStr, label: period },
    fromCache: true,
    fetchedAt: cache.fetchedAt,
    currency: cache.currency,
    summary: aggregateCampaignSummary(filtered),
    campaigns: filtered,
    platform: "omnisend" as const,
    rateLimited: false,
  }
}

/**
 * Constroi resposta de /api/integrations/klaviyo/flows a partir de Omnisend (automations).
 */
export async function buildOmnisendFlowsResponse(
  store: StoreCtx,
  rawPeriod: string,
  customStartDate?: string | null,
  customEndDate?: string | null
) {
  // Idem buildOmnisendCampaignsResponse: normaliza period antes de tudo.
  const period = normalizePeriodLabel(rawPeriod)
  const { startDateStr, endDateStr } = dateRangeForPeriod(rawPeriod, customStartDate, customEndDate)
  const admin = createAdminClient()

  // 1) Cache
  try {
    const { data: cached } = await admin
      .from("omnisend_flow_metrics")
      .select("*")
      .eq("store_id", store.storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false })

    if (cached && cached.length > 0) {
      const latestFetchedAt = new Date(cached[0].fetched_at as string)
      if (Date.now() - latestFetchedAt.getTime() < CACHE_FRESH_MS) {
        const flows = dedupFlows(cached.map((r: Record<string, unknown>) => mapCachedFlow(r)))
        flows.sort((a, b) => b.conversionValue - a.conversionValue)

        const currency = await getStoreCurrency(store.storeId)

        log.info("[Omnisend Flows] Serving from cache", { storeId: store.storeId, period })
        return {
          success: true,
          period: { start: startDateStr, end: endDateStr, label: period },
          fromCache: true,
          fetchedAt: cached[0].fetched_at as string,
          currency,
          summary: aggregateFlowSummary(flows),
          flows,
          platform: "omnisend",
        }
      }
    }
  } catch (err) {
    log.warn("[Omnisend Flows] Cache read failed, falling through", { error: err })
  }

  // 2) Tenta cache stale como fallback (ate 24h)
  let staleFlowCache: { data: Record<string, unknown>[]; currency: string; fetchedAt: string } | null = null
  try {
    const { data: staleCached } = await admin
      .from("omnisend_flow_metrics")
      .select("*")
      .eq("store_id", store.storeId)
      .eq("period_label", period)
      .order("fetched_at", { ascending: false })

    if (staleCached && staleCached.length > 0) {
      const latestFetchedAt = new Date(staleCached[0].fetched_at as string)
      if (Date.now() - latestFetchedAt.getTime() < STALE_CACHE_MAX_MS) {
        staleFlowCache = {
          data: staleCached,
          currency: await getStoreCurrency(store.storeId),
          fetchedAt: staleCached[0].fetched_at as string,
        }
      }
    }
  } catch { /* ignore */ }

  // 3) Live fetch
  const credentials = await getStoreCredentials(store.storeId, store.orgId)
  const apiKey = credentials.omnisend_api_key
  if (!apiKey) {
    if (staleFlowCache) {
      return buildFlowsFromStaleCache(staleFlowCache, startDateStr, endDateStr, period)
    }
    throw new Error("API Key Omnisend não configurada")
  }

  // daysForPeriod precisa do rawPeriod (today=1, yesterday=1)
  const days = daysForPeriod(rawPeriod, customStartDate, customEndDate)
  try {
    const result = await syncOmnisendForStore({
      storeId: store.storeId,
      orgId: store.orgId,
      apiKey,
      periodDays: days,
      startDate: `${startDateStr}T00:00:00.000Z`,
      endDate: `${endDateStr}T23:59:59.999Z`,
    })

    if (!result.ok || !result.data) {
      if (staleFlowCache) {
        log.warn("[Omnisend Flows] Sync failed, serving stale cache", { storeId: store.storeId, error: result.error })
        const resp = buildFlowsFromStaleCache(staleFlowCache, startDateStr, endDateStr, period)
        resp.rateLimited = result.errorType === "rate_limit"
        return resp
      }
      throw new Error(result.error || "Falha ao sincronizar Omnisend")
    }

    await persistLiveFetch(store.storeId, store.orgId, period, result.data)

    const flows: FlowResponseRow[] = result.data.automationRows.map((f) => ({
      id: f.automation_id,
      name: f.automation_name,
      status: f.automation_status,
      triggerType: f.trigger_type || "custom",
      created: "",
      archived: false,
      recipients: f.recipients,
      delivered: f.delivered,
      deliveryRate: f.delivery_rate,
      opened: f.opened,
      openRate: f.open_rate,
      clicked: f.clicked,
      clickRate: f.click_rate,
      clickToOpenRate: f.opened > 0 ? (f.clicked / f.opened) * 100 : 0,
      conversions: f.conversions,
      conversionRate: f.conversion_rate,
      conversionValue: f.conversion_value,
      revenuePerRecipient: f.revenue_per_recipient,
      averageOrderValue: f.conversions > 0 ? f.conversion_value / f.conversions : 0,
      bounced: f.bounced,
      bounceRate: f.bounce_rate,
      unsubscribed: f.unsubscribed,
      unsubscribeRate: f.unsubscribe_rate,
      revenue: f.conversion_value,
    }))

    flows.sort((a, b) => b.conversionValue - a.conversionValue)

    return {
      success: true,
      period: { start: startDateStr, end: endDateStr, label: period },
      fromCache: false,
      fetchedAt: new Date().toISOString(),
      currency: result.data.currency || "BRL",
      summary: aggregateFlowSummary(flows),
      flows,
      platform: "omnisend",
    }
  } catch (err) {
    if (staleFlowCache) {
      log.warn("[Omnisend Flows] Live-fetch failed, serving stale cache", {
        storeId: store.storeId,
        error: err instanceof Error ? err.message : String(err),
      })
      const resp = buildFlowsFromStaleCache(staleFlowCache, startDateStr, endDateStr, period)
      resp.rateLimited = err instanceof OmnisendRateLimitError
      return resp
    }
    throw err
  }
}

function buildFlowsFromStaleCache(
  cache: { data: Record<string, unknown>[]; currency: string; fetchedAt: string },
  startDateStr: string, endDateStr: string, period: string
) {
  const flows = dedupFlows(cache.data.map((r) => mapCachedFlow(r)))
  flows.sort((a, b) => b.conversionValue - a.conversionValue)

  return {
    success: true as const,
    period: { start: startDateStr, end: endDateStr, label: period },
    fromCache: true,
    fetchedAt: cache.fetchedAt,
    currency: cache.currency,
    summary: aggregateFlowSummary(flows),
    flows,
    platform: "omnisend" as const,
    rateLimited: false,
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Remove duplicatas de campaigns por `id`, preservando a com maior receita
 *  (ou primeira). Rede de seguranca contra rows duplicados em
 *  omnisend_campaign_metrics (ver cleanup em sync-persistence). Sem isso,
 *  "Ultimas Campanhas" no Overview mostrava a mesma campanha 5x. */
function dedupCampaigns(list: CampaignResponseRow[]): CampaignResponseRow[] {
  const byId = new Map<string, CampaignResponseRow>()
  for (const c of list) {
    const existing = byId.get(c.id)
    if (!existing || c.conversionValue > existing.conversionValue) {
      byId.set(c.id, c)
    }
  }
  return Array.from(byId.values())
}

/** Idem para flows. */
function dedupFlows(list: FlowResponseRow[]): FlowResponseRow[] {
  const byId = new Map<string, FlowResponseRow>()
  for (const f of list) {
    const existing = byId.get(f.id)
    if (!existing || f.conversionValue > existing.conversionValue) {
      byId.set(f.id, f)
    }
  }
  return Array.from(byId.values())
}

function mapCachedCampaign(r: Record<string, unknown>): CampaignResponseRow {
  const delivered = Number(r.delivered) || 0
  const opened = Number(r.opened) || 0
  const clicked = Number(r.clicked) || 0
  const conversions = Number(r.conversions) || 0
  const conversionValue = Number(r.conversion_value) || 0

  return {
    id: r.campaign_id as string,
    name: (r.campaign_name as string) || "Untitled",
    status: (r.campaign_status as string) || "sent",
    sendTime: (r.send_time as string) || null,
    createdAt: (r.send_time as string) || "",
    channel: (r.channel as string) || "email",
    subject: (r.subject as string) || null,
    recipients: Number(r.recipients) || 0,
    delivered,
    deliveryRate: Number(r.delivery_rate) || 0,
    opened,
    openRate: Number(r.open_rate) || 0,
    clicked,
    clickRate: Number(r.click_rate) || 0,
    clickToOpenRate: Number(r.click_to_open_rate) || (opened > 0 ? (clicked / opened) * 100 : 0),
    conversions,
    conversionRate: Number(r.conversion_rate) || 0,
    conversionValue,
    revenuePerRecipient: Number(r.revenue_per_recipient) || 0,
    averageOrderValue: Number(r.average_order_value) || (conversions > 0 ? conversionValue / conversions : 0),
    bounced: Number(r.bounced) || 0,
    bounceRate: Number(r.bounce_rate) || 0,
    unsubscribed: Number(r.unsubscribed) || 0,
    unsubscribeRate: Number(r.unsubscribe_rate) || 0,
    revenue: conversionValue,
  }
}

function mapCachedFlow(r: Record<string, unknown>): FlowResponseRow {
  const delivered = Number(r.delivered) || 0
  const opened = Number(r.opened) || 0
  const clicked = Number(r.clicked) || 0
  const conversions = Number(r.conversions) || 0
  const conversionValue = Number(r.conversion_value) || 0

  // Normaliza status legado: caches gravados antes do commit d5beab4 (22/04)
  // podiam ter "enabled" ou "active". aggregateFlowSummary ja aceita ambos,
  // mas a tabela `store-performance-tables.tsx` verifica `status === "live"`
  // estrito — sem essa normalizacao, flows ativos aparecem com badge "Inativo"
  // enquanto o Overview mostra "Flows Ativos: N" corretamente.
  const rawStatus = ((r.flow_status as string) || "").toLowerCase()
  const status = rawStatus === "enabled" || rawStatus === "active"
    ? "live"
    : rawStatus || "live"

  return {
    id: r.flow_id as string,
    name: (r.flow_name as string) || "Untitled",
    status,
    triggerType: (r.trigger_type as string) || "custom",
    created: "",
    archived: false,
    recipients: Number(r.recipients) || 0,
    delivered,
    deliveryRate: Number(r.delivery_rate) || 0,
    opened,
    openRate: Number(r.open_rate) || 0,
    clicked,
    clickRate: Number(r.click_rate) || 0,
    clickToOpenRate: Number(r.click_to_open_rate) || (opened > 0 ? (clicked / opened) * 100 : 0),
    conversions,
    conversionRate: Number(r.conversion_rate) || 0,
    conversionValue,
    revenuePerRecipient: Number(r.revenue_per_recipient) || 0,
    averageOrderValue: Number(r.average_order_value) || (conversions > 0 ? conversionValue / conversions : 0),
    bounced: Number(r.bounced) || 0,
    bounceRate: Number(r.bounce_rate) || 0,
    unsubscribed: Number(r.unsubscribed) || 0,
    unsubscribeRate: Number(r.unsubscribe_rate) || 0,
    revenue: conversionValue,
  }
}

function sortCampaigns(a: CampaignResponseRow, b: CampaignResponseRow) {
  if (a.sendTime && b.sendTime) {
    return new Date(b.sendTime).getTime() - new Date(a.sendTime).getTime()
  }
  return b.conversionValue - a.conversionValue
}
