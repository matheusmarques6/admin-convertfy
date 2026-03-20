/**
 * Portal Klaviyo Cache Service
 *
 * Reads Klaviyo data from cron-cached tables (store_revenue_summary,
 * klaviyo_campaign_metrics, klaviyo_flow_metrics) and transforms it
 * into the portal dashboard response format.
 *
 * Extracted from portal/dashboard/route.ts — Story 54.6 (AC 54.6.1)
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("PortalKlaviyoCache")

/** Portal considers data stale after 45 minutes (1.5x cron interval of ~30min) */
const PORTAL_STALENESS_MS = 45 * 60 * 1000

// ─── Cached Klaviyo data types ──────────────────────────────────────────────

export interface CachedCampaignRow {
  campaign_id: string
  campaign_name: string
  campaign_status: string
  send_time: string | null
  channel?: string
  recipients: number
  delivered: number
  opened: number
  open_rate: number
  clicked: number
  click_rate: number
  click_to_open_rate: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  bounce_rate: number
  bounced: number
  unsubscribe_rate: number
  unsubscribed: number
}

export interface CachedFlowRow {
  flow_id: string
  flow_name: string
  flow_status: string
  recipients: number
  delivered: number
  opened: number
  open_rate: number
  clicked: number
  click_rate: number
  click_to_open_rate: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  bounce_rate: number
  bounced: number
  unsubscribe_rate: number
  unsubscribed: number
  sms_conversion_value?: number
}

export interface CachedRevenueSummary {
  klaviyo_total_revenue: number
  klaviyo_campaign_revenue: number
  klaviyo_flow_revenue: number
  store_total_revenue: number
  store_orders: number
  total_leads: number
  engaged_leads: number
  engagement_rate: number
  period_start: string
  period_end: string
  fetched_at: string
  sync_status: string
}

export interface CachedKlaviyoData {
  summary: CachedRevenueSummary
  campaigns: CachedCampaignRow[]
  flows: CachedFlowRow[]
}

export interface KlaviyoCacheResult {
  data: CachedKlaviyoData | null
  isStale: boolean
  fetchedAt: string | null
}

// ─── fetchKlaviyoFromCache: reads from 3 cached tables (with stale detection) ─

export async function fetchKlaviyoFromCache(
  storeId: string,
  period: string,
  supabase: SupabaseClient,
  orgId?: string,
): Promise<KlaviyoCacheResult> {
  // 1. Get revenue summary (no expires_at filter — we want stale data too)
  let summaryQuery = supabase
    .from("store_revenue_summary")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
  if (orgId) summaryQuery = summaryQuery.eq("org_id", orgId)
  const { data: summary, error: summaryError } = await summaryQuery.single()

  if (summaryError || !summary) {
    log.debug(`[CacheRead] No revenue summary for store ${storeId} period ${period}`)
    return { data: null, isStale: false, fetchedAt: null }
  }

  // CA4: If summary has sync_status="error", try to build synthetic summary from detail tables
  if (summary.sync_status === "error") {
    log.info(`[CacheRead] Summary has sync_status=error for store ${storeId}/${period}, attempting synthetic fallback`)
    return buildSyntheticFallback(storeId, period, summary, supabase, orgId)
  }

  const dataAgeMs = summary.fetched_at ? Date.now() - new Date(summary.fetched_at).getTime() : Infinity
  const isStale = dataAgeMs > PORTAL_STALENESS_MS

  // Touch pattern: renew fetched_at for valid "ok" rows accessed while stale
  // so next read within PORTAL_STALENESS_MS won't trigger another touch
  if (isStale && summary.sync_status === "ok") {
    void (async () => {
      try {
        const { error: touchErr } = await supabase
          .from("store_revenue_summary")
          .update({ fetched_at: new Date().toISOString() })
          .eq("store_id", storeId)
          .eq("period_label", period)
          .eq("sync_status", "ok")
        if (touchErr) log.warn(`[Touch] Failed to update fetched_at for ${storeId}/${period}: ${touchErr.message}`)
      } catch (err) {
        log.warn(`[Touch] Unexpected error for ${storeId}/${period}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }

  // 2. Get campaign + flow detail using period_label (not exact period dates)
  let campaignQuery = supabase
    .from("klaviyo_campaign_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .order("conversion_value", { ascending: false })
  if (orgId) campaignQuery = campaignQuery.eq("org_id", orgId)

  let flowQuery = supabase
    .from("klaviyo_flow_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .order("conversion_value", { ascending: false })
  if (orgId) flowQuery = flowQuery.eq("org_id", orgId)

  const [campaignsResult, flowsResult] = await Promise.all([
    campaignQuery,
    flowQuery,
  ])

  return {
    data: {
      summary: summary as CachedRevenueSummary,
      campaigns: (campaignsResult.data || []) as CachedCampaignRow[],
      flows: (flowsResult.data || []) as CachedFlowRow[],
    },
    isStale,
    fetchedAt: summary.fetched_at || null,
  }
}

// ─── Synthetic fallback when summary has sync_status="error" ────────────────

async function buildSyntheticFallback(
  storeId: string,
  period: string,
  summary: Record<string, unknown>,
  supabase: SupabaseClient,
  orgId?: string,
): Promise<KlaviyoCacheResult> {
  // CA5: Check if detail tables have real data from a previous successful sync
  let fallbackCampaignQuery = supabase
    .from("klaviyo_campaign_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .order("conversion_value", { ascending: false })
  if (orgId) fallbackCampaignQuery = fallbackCampaignQuery.eq("org_id", orgId)

  let fallbackFlowQuery = supabase
    .from("klaviyo_flow_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .order("conversion_value", { ascending: false })
  if (orgId) fallbackFlowQuery = fallbackFlowQuery.eq("org_id", orgId)

  const [campaignsResult, flowsResult] = await Promise.all([
    fallbackCampaignQuery,
    fallbackFlowQuery,
  ])

  const campaigns = (campaignsResult.data || []) as CachedCampaignRow[]
  const flows = (flowsResult.data || []) as CachedFlowRow[]

  if (campaigns.length > 0 || flows.length > 0) {
    // Build synthetic summary from detail data
    const campaignRevenue = campaigns.reduce((s, c) => s + (c.conversion_value || 0), 0)
    const flowRevenue = flows.reduce((s, f) => s + (f.conversion_value || 0), 0)
    const syntheticSummary: CachedRevenueSummary = {
      ...(summary as unknown as CachedRevenueSummary),
      klaviyo_campaign_revenue: campaignRevenue,
      klaviyo_flow_revenue: flowRevenue,
      klaviyo_total_revenue: campaignRevenue + flowRevenue,
      sync_status: "synthetic",
    }
    log.info(`[CacheRead] Built synthetic summary for ${storeId}/${period}: campaigns=${campaigns.length}, flows=${flows.length}, revenue=${campaignRevenue + flowRevenue}`)
    return {
      data: { summary: syntheticSummary, campaigns, flows },
      isStale: true, // Mark as stale so cron will refresh
      fetchedAt: (summary as Record<string, unknown>).fetched_at as string || null,
    }
  }

  // No detail data either — treat as cache miss
  log.info(`[CacheRead] No detail data for ${storeId}/${period}, treating error summary as cache miss`)
  return { data: null, isStale: false, fetchedAt: null }
}

// ─── mapCacheToPortalKlaviyo: converts cached data to portal response format ─

export function mapCacheToPortalKlaviyo(cached: CachedKlaviyoData) {
  const campaigns = cached.campaigns
  const flows = cached.flows

  const totalCampDelivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0)
  const totalFlowDelivered = flows.reduce((s, f) => s + (f.delivered || 0), 0)
  const totalDelivered = totalCampDelivered + totalFlowDelivered

  const totalCampOpened = campaigns.reduce((s, c) => s + (c.opened || 0), 0)
  const totalFlowOpened = flows.reduce((s, f) => s + (f.opened || 0), 0)
  const totalOpened = totalCampOpened + totalFlowOpened

  const totalCampClicked = campaigns.reduce((s, c) => s + (c.clicked || 0), 0)
  const totalFlowClicked = flows.reduce((s, f) => s + (f.clicked || 0), 0)
  const totalClicked = totalCampClicked + totalFlowClicked

  const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0)
    + flows.reduce((s, f) => s + (f.conversions || 0), 0)

  const totalCampBounced = campaigns.reduce((s, c) => s + (c.bounced || 0), 0)
  const totalFlowBounced = flows.reduce((s, f) => s + (f.bounced || 0), 0)
  const totalBounced = totalCampBounced + totalFlowBounced

  const totalRevenue = cached.summary.klaviyo_total_revenue
  const campaignRevenue = cached.summary.klaviyo_campaign_revenue
  const flowRevenue = cached.summary.klaviyo_flow_revenue

  // Calculate SMS revenue from campaign channel='sms' + flow sms_conversion_value
  const smsCampaignRevenue = campaigns
    .filter(c => c.channel === "sms")
    .reduce((s, c) => s + (c.conversion_value || 0), 0)
  const smsFlowRevenue = flows.reduce((s, f) => s + (f.sms_conversion_value || 0), 0)
  const smsRevenue = smsCampaignRevenue + smsFlowRevenue

  // Weighted average for bounce/unsubscribe rates
  const weightedBounceRate = totalDelivered > 0
    ? (
      campaigns.reduce((s, c) => s + (c.bounce_rate || 0) * (c.delivered || 0), 0) +
      flows.reduce((s, f) => s + (f.bounce_rate || 0) * (f.delivered || 0), 0)
    ) / totalDelivered
    : 0

  const weightedUnsubscribeRate = totalDelivered > 0
    ? (
      campaigns.reduce((s, c) => s + (c.unsubscribe_rate || 0) * (c.delivered || 0), 0) +
      flows.reduce((s, f) => s + (f.unsubscribe_rate || 0) * (f.delivered || 0), 0)
    ) / totalDelivered
    : 0

  // Sort campaigns by send_time desc for "recent" view
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const aTime = a.send_time ? new Date(a.send_time).getTime() : 0
    const bTime = b.send_time ? new Date(b.send_time).getTime() : 0
    return bTime - aTime
  })

  const storeRev = cached.summary.store_total_revenue || 0

  return {
    storeRevenue: storeRev,
    storeOrders: cached.summary.store_orders || 0,
    recoveryRate: storeRev > 0 ? (totalRevenue / storeRev) * 100 : 0,
    totalLeads: cached.summary.total_leads || 0,
    engagedLeads: cached.summary.engaged_leads || 0,
    engagementRate: cached.summary.engagement_rate || 0,
    totalRevenue,
    campaignRevenue,
    flowRevenue,
    smsRevenue,
    emailsSent: totalDelivered,
    delivered: totalDelivered,
    opened: totalOpened,
    clicked: totalClicked,
    openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
    clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
    clickToOpenRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
    conversions: totalConversions,
    conversionRate: totalDelivered > 0 ? (totalConversions / totalDelivered) * 100 : 0,
    unsubscribeRate: weightedUnsubscribeRate,
    bounceRate: weightedBounceRate,
    bounces: totalBounced,
    campaignsCount: campaigns.length,
    campaignDelivered: totalCampDelivered,
    campaignRevenuePercent: totalRevenue > 0 ? (campaignRevenue / totalRevenue) * 100 : 0,
    flowsCount: flows.length,
    activeFlows: flows.filter(f => f.flow_status === "live").length,
    flowDelivered: totalFlowDelivered,
    flowRevenuePercent: totalRevenue > 0 ? (flowRevenue / totalRevenue) * 100 : 0,
    recentCampaigns: sortedCampaigns.slice(0, 10).map(c => ({
      id: c.campaign_id,
      name: c.campaign_name,
      status: "sent",
      sentAt: c.send_time || new Date().toISOString(),
      recipients: c.recipients || 0,
      delivered: c.delivered || 0,
      opened: c.opened || 0,
      clicked: c.clicked || 0,
      revenue: c.conversion_value || 0,
      openRate: c.open_rate || 0,
      clickRate: c.click_rate || 0,
    })),
    topFlows: flows.slice(0, 10).map(f => ({
      id: f.flow_id,
      name: f.flow_name,
      revenue: f.conversion_value || 0,
      delivered: f.delivered || 0,
      openRate: f.open_rate || 0,
      clickRate: f.click_rate || 0,
    })),
  }
}

/** Return type of mapCacheToPortalKlaviyo for use in aggregation */
export type PortalKlaviyoData = ReturnType<typeof mapCacheToPortalKlaviyo>

// ─── Period comparison helpers ───────────────────────────────────────────────

/** Maps a period to a larger period for comparison calculations */
function getComparisonPeriod(period: string): string | null {
  switch (period) {
    case "7d": return "30d"
    case "15d": return "90d"
    case "30d": return "90d"
    default: return null
  }
}

/** Number of days in a period label */
function periodDays(period: string): number {
  switch (period) {
    case "7d": return 7
    case "15d": return 15
    case "30d": return 30
    case "90d": return 90
    default: return 30
  }
}

export interface PeriodComparison {
  storeRevenue: number
  storeOrders: number
  totalRevenue: number
  openRate: number
  clickRate: number
}

/**
 * Fetch comparison data by looking at a larger cached period and
 * estimating the "previous equivalent" period baseline.
 *
 * E.g., for "30d" we fetch the "90d" cache and compute:
 *   previous_30d_avg = (90d_total - 30d_total) / 2
 */
export async function fetchPeriodComparison(
  storeId: string,
  currentPeriod: string,
  supabase: SupabaseClient,
  orgId?: string,
): Promise<PeriodComparison | null> {
  const outerPeriod = getComparisonPeriod(currentPeriod)
  if (!outerPeriod) return null

  const outerResult = await fetchKlaviyoFromCache(storeId, outerPeriod, supabase, orgId)
  if (!outerResult.data) return null

  const currentResult = await fetchKlaviyoFromCache(storeId, currentPeriod, supabase, orgId)
  if (!currentResult.data) return null

  const outerData = mapCacheToPortalKlaviyo(outerResult.data)
  const currentData = mapCacheToPortalKlaviyo(currentResult.data)

  // Calculate how many "previous periods" fit in the remainder
  const currentDays = periodDays(currentPeriod)
  const outerDays = periodDays(outerPeriod)
  const remainderDays = outerDays - currentDays
  const factor = remainderDays / currentDays

  if (factor <= 0) return null

  // Previous period baseline = (outer total - current total) / factor
  return {
    storeRevenue: (outerData.storeRevenue - currentData.storeRevenue) / factor,
    storeOrders: (outerData.storeOrders - currentData.storeOrders) / factor,
    totalRevenue: (outerData.totalRevenue - currentData.totalRevenue) / factor,
    openRate: outerData.openRate, // Use outer period average as baseline for rates
    clickRate: outerData.clickRate,
  }
}
