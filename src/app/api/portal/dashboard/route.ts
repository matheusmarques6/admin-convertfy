import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { decryptStoreCredentials } from "@/lib/crypto"
import { CACHE_VERSION } from "@/lib/cache"
import { parseDateRangeInTimezone, getTimezoneOffset } from "@/lib/integrations/klaviyo"
import { isCachedPeriod } from "@/lib/shared/data-status"
import type { DataStatus } from "@/lib/shared/data-status"
import { syncShopifyForStore } from "@/lib/services/shopify-sync.service"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  type KlaviyoSyncData,
} from "@/lib/services/klaviyo-sync.service"
import { tryAcquireLiveFetch, releaseLiveFetch, getFetchKey } from "@/lib/services/fetch-cooldown.service"
import { upsertSyncResults } from "@/lib/services/sync-persistence.service"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
} from "@/lib/integrations/klaviyo/cached-metadata"

const log = logger.child("PortalDashboard")

const PORTAL_LIVE_FETCH_TIMEOUT_MS = 15_000

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Cache TTL in minutes based on period (used for Shopify dashboard_cache only)
const CACHE_TTL: Record<string, number> = {
  "1d": 60,
  "7d": 120,
  "15d": 180,
  "30d": 240,
  "90d": 360,
  "12m": 360,
}

// ─── Cached Klaviyo data types ──────────────────────────────────────────────

interface CachedCampaignRow {
  campaign_id: string
  campaign_name: string
  campaign_status: string
  send_time: string | null
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

interface CachedFlowRow {
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
}

interface CachedRevenueSummary {
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

interface CachedKlaviyoData {
  summary: CachedRevenueSummary
  campaigns: CachedCampaignRow[]
  flows: CachedFlowRow[]
}

// ─── fetchKlaviyoFromCache: reads from 3 cached tables (with stale detection) ─

interface KlaviyoCacheResult {
  data: CachedKlaviyoData | null
  isStale: boolean
  fetchedAt: string | null
}

async function fetchKlaviyoFromCache(
  storeId: string,
  period: string,
  supabase: SupabaseClient,
): Promise<KlaviyoCacheResult> {
  // 1. Get revenue summary (no expires_at filter — we want stale data too)
  const { data: summary, error: summaryError } = await supabase
    .from("store_revenue_summary")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .single()

  if (summaryError || !summary) {
    log.debug(`[CacheRead] No revenue summary for store ${storeId} period ${period}`)
    return { data: null, isStale: false, fetchedAt: null }
  }

  const isStale = new Date(summary.expires_at) < new Date()

  // 2. Get campaign + flow detail in parallel using the same period window
  const [campaignsResult, flowsResult] = await Promise.all([
    supabase
      .from("klaviyo_campaign_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_start", summary.period_start)
      .eq("period_end", summary.period_end)
      .order("conversion_value", { ascending: false }),
    supabase
      .from("klaviyo_flow_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_start", summary.period_start)
      .eq("period_end", summary.period_end)
      .order("conversion_value", { ascending: false }),
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

// ─── mapCacheToPortalKlaviyo: converts cached data to portal response format ─

function mapCacheToPortalKlaviyo(cached: CachedKlaviyoData) {
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
    smsRevenue: 0,
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

interface PortalStoreInfo {
  id: string
  org_id?: string | null
  store_name?: string
  klaviyo_private_key?: string | null
  klaviyo_api_key?: string | null
  shopify_access_token?: string | null
  shopify_store_domain?: string | null
}

// ─── buildCachedKlaviyoData: convert sync data to CachedKlaviyoData format ──

function buildCachedKlaviyoData(
  syncData: KlaviyoSyncData,
  _storeId: string,
  _period: string,
): CachedKlaviyoData {
  return {
    summary: {
      klaviyo_total_revenue: syncData.campaignRevenue + syncData.flowRevenue,
      klaviyo_campaign_revenue: syncData.campaignRevenue,
      klaviyo_flow_revenue: syncData.flowRevenue,
      store_total_revenue: syncData.storeRevenue,
      store_orders: syncData.storeOrders,
      total_leads: 0,
      engaged_leads: 0,
      engagement_rate: 0,
      period_start: syncData.startDateStr,
      period_end: syncData.endDateStr,
      fetched_at: new Date().toISOString(),
      sync_status: "ok",
    },
    campaigns: syncData.campRows.map(row => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      campaign_status: row.campaign_status,
      send_time: row.send_time,
      recipients: row.recipients,
      delivered: row.delivered,
      opened: row.opened,
      open_rate: row.open_rate,
      clicked: row.clicked,
      click_rate: row.click_rate,
      click_to_open_rate: row.click_to_open_rate,
      conversions: row.conversions,
      conversion_rate: row.conversion_rate,
      conversion_value: row.conversion_value,
      bounce_rate: row.bounce_rate,
      bounced: row.bounced,
      unsubscribe_rate: row.unsubscribe_rate,
      unsubscribed: row.unsubscribed,
    })),
    flows: syncData.flowRows.map(row => ({
      flow_id: row.flow_id,
      flow_name: row.flow_name,
      flow_status: row.flow_status,
      recipients: row.recipients,
      delivered: row.delivered,
      opened: row.opened,
      open_rate: row.open_rate,
      clicked: row.clicked,
      click_rate: row.click_rate,
      click_to_open_rate: row.click_to_open_rate,
      conversions: row.conversions,
      conversion_rate: row.conversion_rate,
      conversion_value: row.conversion_value,
      bounce_rate: row.bounce_rate,
      bounced: row.bounced,
      unsubscribe_rate: row.unsubscribe_rate,
      unsubscribed: row.unsubscribed,
    })),
  }
}

// ─── liveFetchKlaviyoForPortal: auto-fallback with cooldown ─────────────────

async function liveFetchKlaviyoForPortal(
  store: PortalStoreInfo,
  period: string,
  supabase: SupabaseClient,
): Promise<CachedKlaviyoData | null> {
  const fetchKey = getFetchKey(period)
  const canFetch = await tryAcquireLiveFetch(supabase, store.id, fetchKey, "portal-fallback")

  if (!canFetch) {
    return null
  }

  try {
    const credentials = await getStoreCredentials(store.id)
    const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (!apiKey) {
      await releaseLiveFetch(supabase, store.id, fetchKey, "failed")
      return null
    }

    const accountInfo = await getCachedAccountInfo(apiKey)
    const metricId = await getCachedPlacedOrderMetric(apiKey)
    if (!metricId) {
      log.warn(`[Portal LiveFetch] No Placed Order metric found for store ${store.id} — skipping live fetch. Check Klaviyo API key validity.`)
      await releaseLiveFetch(supabase, store.id, fetchKey, "failed")
      return null
    }

    const [flowNames, campNames] = await Promise.all([
      fetchFlowNames(apiKey),
      fetchCampaignNames(apiKey),
    ])

    const syncResult = await syncKlaviyoForPeriod({
      storeId: store.id,
      orgId: store.org_id || null,
      apiKey,
      timezone: accountInfo.timezone,
      timezoneOffset: getTimezoneOffset(accountInfo.timezone),
      metricId,
      period,
      flowNames,
      campNames,
    })

    if (syncResult.success && syncResult.data) {
      await upsertSyncResults(supabase, store, syncResult.data, period)
      await releaseLiveFetch(supabase, store.id, fetchKey, "completed")
      // Re-read from cache after upsert to include audience data populated by cron
      // (buildCachedKlaviyoData would return total_leads=0 since live fetch skips audience)
      const freshCache = await fetchKlaviyoFromCache(store.id, period, supabase)
      return freshCache.data || buildCachedKlaviyoData(syncResult.data, store.id, period)
    }

    await releaseLiveFetch(supabase, store.id, fetchKey, "failed")
    return null
  } catch (err) {
    await releaseLiveFetch(supabase, store.id, fetchKey, "failed")
    log.error(`[Portal LiveFetch] Error for store ${store.id}:`, err)
    return null
  }
}

// ─── withTimeout: wrap a promise with a timeout ─────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs)
  })
  // Note: Promise.race does not cancel the losing promise.
  // On Vercel serverless, the in-flight work continues until the platform kills the function.
  return Promise.race([promise, timeoutPromise])
}

// GET - Get portal dashboard data
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const user = await requireAuth(supabase)

    // Get portal user using admin client to bypass RLS
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*, client:clients(*)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const clientId = portalUser.client_id
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"
    const storeId = searchParams.get("store_id")

    // Calculate date range using timezone-aware function
    const dashboardTimezone = "America/Sao_Paulo"
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, dashboardTimezone)

    // Fetch all base data in parallel using admin client to bypass RLS
    const [
      clientData,
      rawStoresData,
      invoicesData,
      chargesData,
      meetingsData,
      upcomingCampaignsData,
    ] = await Promise.all([
      adminClient
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single(),

      adminClient
        .from("client_stores")
        .select("id, store_name, platform, store_url, is_active, org_id, klaviyo_private_key, klaviyo_api_key, shopify_access_token, shopify_store_domain")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("store_name"),

      adminClient
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: false })
        .limit(20),

      adminClient
        .from("client_charges")
        .select("value, status")
        .eq("client_id", clientId)
        .limit(200),

      adminClient
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .in("status", ["scheduled", "completed"])
        .order("scheduled_at", { ascending: false })
        .limit(10),

      adminClient
        .from("campaigns")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "scheduled")
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .order("scheduled_date")
        .limit(10),
    ])

    const client = clientData.data
    const rawStores = rawStoresData.data || []
    const stores = rawStores.map(s => decryptStoreCredentials(s))
    const invoices = invoicesData.data || []
    const charges = chargesData.data || []
    const meetings = meetingsData.data || []
    const upcomingCampaigns = upcomingCampaignsData.data || []

    // Calculate invoice + charges stats
    const pendingInvoices = invoices.filter((i) => i.status === "pending")
    const overdueInvoices = invoices.filter((i) => i.status === "overdue")
    const paidInvoices = invoices.filter((i) => i.status === "paid")

    const totalPending =
      pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0) +
      charges.filter(c => c.status === "pending").reduce((s, c) => s + Number(c.value), 0)
    const totalOverdue =
      overdueInvoices.reduce((sum, i) => sum + (i.amount || 0), 0) +
      charges.filter(c => c.status === "overdue").reduce((s, c) => s + Number(c.value), 0)
    const totalPaid =
      paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0) +
      charges.filter(c => c.status === "paid").reduce((s, c) => s + Number(c.value), 0)

    // Prepare the base response
    const response: Record<string, unknown> = {
      success: true,
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      client: {
        id: client?.id,
        name: client?.name,
        company: client?.company,
        status: client?.status,
        healthScore: client?.health_score,
      },

      stores: stores.map((s) => ({
        id: s.id,
        name: s.store_name,
        platform: s.platform,
        url: s.store_url,
        isActive: s.is_active,
      })),

      invoices: {
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length,
        totalPending,
        totalOverdue,
        totalPaid,
        recent: invoices.slice(0, 10).map((i) => ({
          id: i.id,
          amount: i.amount,
          dueDate: i.due_date,
          status: i.status,
          description: i.description,
        })),
      },

      upcomingCampaigns: upcomingCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        scheduledDate: c.scheduled_date,
      })),

      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduled_at,
        duration: m.duration_minutes,
        meetingUrl: m.meeting_url,
        status: m.status,
        completionNotes: m.completion_notes,
        completedAt: m.completed_at,
      })),

      lastUpdated: new Date().toISOString(),
    }

    // ─── Helper: Shopify Cache (dashboard_cache) ──────────────────────────────

    const getCachedShopifyData = async (shopifyStoreId: string) => {
      try {
        const { data } = await adminClient
          .from("dashboard_cache")
          .select("data, expires_at")
          .eq("store_id", shopifyStoreId)
          .eq("cache_type", "shopify")
          .eq("period", period)
          .single()

        if (data && new Date(data.expires_at) > new Date()) {
          const cached = data.data as Record<string, unknown>
          if ((cached._cacheVersion as number) !== CACHE_VERSION) {
            return null
          }
          return cached
        }
        return null
      } catch {
        return null
      }
    }

    const saveShopifyToCache = async (cacheStoreId: string, data: Record<string, unknown>) => {
      try {
        const ttlMinutes = CACHE_TTL[period] || 30
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

        await adminClient
          .from("dashboard_cache")
          .upsert({
            store_id: cacheStoreId,
            cache_type: "shopify",
            period,
            data: { ...data, _cacheVersion: CACHE_VERSION },
            expires_at: expiresAt,
          }, {
            onConflict: "store_id,cache_type,period"
          })
      } catch (error) {
        log.error(`[Cache ERROR] Failed to save shopify for store ${cacheStoreId}:`, error)
      }
    }

    // ─── Helper: Fetch Shopify data for a store ─────────────────────────────────

    const fetchShopifyData = async (store: typeof stores[0]): Promise<Record<string, unknown> | null> => {
      if (!(store.shopify_access_token && store.shopify_store_domain)) return null

      const cached = await getCachedShopifyData(store.id)
      if (cached) return cached

      // Use cooldown to prevent duplicate Shopify fetches
      const shopifyFetchKey = `shopify_${period}`
      const canFetch = await tryAcquireLiveFetch(adminClient, store.id, shopifyFetchKey, "portal-shopify")
      if (!canFetch) return null

      try {
        const result = await syncShopifyForStore(store.id, period)
        if (result.success && result.data) {
          saveShopifyToCache(store.id, result.data as unknown as Record<string, unknown>)
          await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "completed")
          return result.data as unknown as Record<string, unknown>
        }
        await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "failed")
      } catch (error) {
        await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "failed")
        log.error(`[Portal] Shopify error for store ${store.id}:`, error)
      }
      return null
    }

    // ─── Helper: Map Shopify data to dashboard format ───────────────────────────

    const mapShopifyData = (shopifyData: Record<string, unknown>) => {
      const orders = shopifyData.orders as Record<string, unknown> || {}
      const customers = shopifyData.customers as Record<string, unknown> || {}
      const coupons = orders.coupons as Record<string, unknown> || {}
      const utmConversions = orders.utmConversions as Record<string, unknown> || {}
      const topCustomers = (orders.topCustomers as Array<Record<string, unknown>>) || []

      return {
        totalRevenue: (orders.totalRevenue as number) || 0,
        totalOrders: (orders.totalOrders as number) || 0,
        paidOrders: (orders.paidOrders as number) || 0,
        averageOrderValue: (orders.averageOrderValue as number) || 0,
        totalCustomers: (customers.totalCustomers as number) || 0,
        newCustomers: (customers.newCustomersLast30Days as number) || 0,
        recurringCustomerRate: (orders.recurringCustomerRate as number) || 0,
        topProducts: ((shopifyData.bestSellingProducts as Array<Record<string, unknown>>) || []).slice(0, 10).map((p) => ({
          name: (p.title as string) || "Unknown Product",
          quantity: (p.quantitySold as number) || 0,
          revenue: (p.revenue as number) || 0,
        })),
        topCustomers: topCustomers.slice(0, 10).map((c) => ({
          email: (c.email as string) || "",
          name: (c.name as string) || "",
          ordersCount: (c.ordersCount as number) || 0,
          totalSpent: (c.totalSpent as number) || 0,
          averageOrderValue: (c.averageOrderValue as number) || 0,
          lastOrderDate: (c.lastOrderDate as string) || "",
        })),
        coupons: {
          totalOrdersWithCoupon: (coupons.totalOrdersWithCoupon as number) || 0,
          couponUsageRate: (coupons.couponUsageRate as number) || 0,
          topCoupons: (coupons.topCoupons as Array<Record<string, unknown>>) || [],
          totalDiscount: (coupons.totalDiscount as number) || 0,
        },
        utmConversions: {
          totalOrdersWithUtm: (utmConversions.totalOrdersWithUtm as number) || 0,
          utmTrackingRate: (utmConversions.utmTrackingRate as number) || 0,
          bySource: (utmConversions.bySource as Array<Record<string, unknown>>) || [],
          byMedium: (utmConversions.byMedium as Array<Record<string, unknown>>) || [],
          byCampaign: (utmConversions.byCampaign as Array<Record<string, unknown>>) || [],
        },
      }
    }

    // ─── Fetch data for stores ──────────────────────────────────────────────────

    // Determine which stores have Klaviyo credentials
    const storesWithKlaviyo = stores.filter(s => s.klaviyo_private_key || s.klaviyo_api_key)
    const hasKlaviyoStores = storesWithKlaviyo.length > 0

    if (storeId && storeId !== "all") {
      // ── Single store selected ──────────────────────────────────────────────
      const selectedStore = stores.find((s) => s.id === storeId)

      if (selectedStore) {
        response.selectedStore = {
          id: selectedStore.id,
          name: selectedStore.store_name,
          platform: selectedStore.platform,
        }

        // Shopify: keep HTTP call with dashboard_cache
        const shopifyData = await fetchShopifyData(selectedStore)
        if (shopifyData) {
          response.shopify = mapShopifyData(shopifyData)
        }

        // Klaviyo: read from cache tables, auto-fallback to live fetch if empty
        const hasKlaviyo = !!(selectedStore.klaviyo_private_key || selectedStore.klaviyo_api_key)
        if (hasKlaviyo) {
          const cacheResult = await fetchKlaviyoFromCache(selectedStore.id, period, adminClient)

          if (cacheResult.data) {
            // Cache HIT (fresh or stale)
            response.klaviyo = mapCacheToPortalKlaviyo(cacheResult.data)
            response.dataStatus = (cacheResult.isStale ? "stale" : "ready") satisfies DataStatus
            response.lastFetchedAt = cacheResult.fetchedAt
            response.isRefreshing = false
            response.source = cacheResult.isStale ? "stale-cache" : "cache"
          } else if (isCachedPeriod(period)) {
            // Cache MISS for a cached period — try live fallback with timeout
            const storeInfo: PortalStoreInfo = {
              id: selectedStore.id,
              org_id: (selectedStore as Record<string, unknown>).org_id as string | null ?? null,
              klaviyo_private_key: selectedStore.klaviyo_private_key,
              klaviyo_api_key: selectedStore.klaviyo_api_key,
            }
            const liveResult = await withTimeout(
              liveFetchKlaviyoForPortal(storeInfo, period, adminClient),
              PORTAL_LIVE_FETCH_TIMEOUT_MS,
            )
            if (liveResult) {
              response.klaviyo = mapCacheToPortalKlaviyo(liveResult)
              response.dataStatus = "ready" satisfies DataStatus
              response.source = "live"
              response.isRefreshing = false
              response.lastFetchedAt = new Date().toISOString()
            } else {
              // Live fetch failed/timed out — try stale cache as last resort
              const staleFallback = await fetchKlaviyoFromCache(selectedStore.id, period, adminClient)
              if (staleFallback.data) {
                log.info(`[Portal] Live fetch failed, using stale cache for store ${selectedStore.id} period ${period}`)
                response.klaviyo = mapCacheToPortalKlaviyo(staleFallback.data)
                response.dataStatus = "stale" satisfies DataStatus
                response.source = "stale-cache"
                response.isRefreshing = true
                response.lastFetchedAt = staleFallback.fetchedAt
              } else {
                response.dataStatus = "loading" satisfies DataStatus
                response.isRefreshing = true
                response.source = "cache"
                response.lastFetchedAt = null
              }
            }
          } else {
            // LIVE_ONLY period — always try live fetch
            const storeInfo: PortalStoreInfo = {
              id: selectedStore.id,
              org_id: (selectedStore as Record<string, unknown>).org_id as string | null ?? null,
              klaviyo_private_key: selectedStore.klaviyo_private_key,
              klaviyo_api_key: selectedStore.klaviyo_api_key,
            }
            const liveResult = await withTimeout(
              liveFetchKlaviyoForPortal(storeInfo, period, adminClient),
              PORTAL_LIVE_FETCH_TIMEOUT_MS,
            )
            if (liveResult) {
              response.klaviyo = mapCacheToPortalKlaviyo(liveResult)
              response.dataStatus = "ready" satisfies DataStatus
              response.source = "live"
              response.isRefreshing = false
              response.lastFetchedAt = new Date().toISOString()
            } else {
              response.dataStatus = "empty" satisfies DataStatus
              response.source = "live"
              response.isRefreshing = false
              response.lastFetchedAt = null
            }
          }
        }
      }
    } else {
      // ── "All stores" selected — aggregate across all stores ────────────────
      const storesWithIntegrations = stores.filter(
        (s) => (s.klaviyo_private_key || s.klaviyo_api_key) || (s.shopify_access_token && s.shopify_store_domain)
      )

      if (storesWithIntegrations.length > 0) {
        // Fetch Klaviyo cached data for all stores in parallel (DB reads, no rate limits)
        const klaviyoCachePromises = storesWithKlaviyo.map(store =>
          fetchKlaviyoFromCache(store.id, period, adminClient).then(result => ({ store, result }))
        )

        // Fetch Shopify data for all stores in parallel
        const shopifyStores = stores.filter(s => s.shopify_access_token && s.shopify_store_domain)
        const shopifyPromises = shopifyStores.map(store =>
          fetchShopifyData(store).then(data => ({ storeId: store.id, data }))
        )

        const [klaviyoCacheResults, shopifyResults] = await Promise.all([
          Promise.all(klaviyoCachePromises),
          Promise.all(shopifyPromises),
        ])

        // Separate stores with cache from stores without
        const withCache = klaviyoCacheResults.filter(r => r.result.data !== null)
        const withoutCache = klaviyoCacheResults.filter(r => r.result.data === null)

        // Live fetch for stores WITHOUT cache (max 5, sequential for rate limits)
        const liveFetchedData: CachedKlaviyoData[] = []
        if (withoutCache.length > 0 && withoutCache.length <= 5) {
          const liveFetchPromise = (async () => {
            for (const { store } of withoutCache) {
              const storeInfo: PortalStoreInfo = {
                id: store.id,
                org_id: (store as Record<string, unknown>).org_id as string | null ?? null,
                klaviyo_private_key: store.klaviyo_private_key,
                klaviyo_api_key: store.klaviyo_api_key,
              }
              const liveData = await liveFetchKlaviyoForPortal(storeInfo, period, adminClient)
              if (liveData) {
                liveFetchedData.push(liveData)
              }
            }
          })()

          await withTimeout(liveFetchPromise, PORTAL_LIVE_FETCH_TIMEOUT_MS)
        }

        // Merge cache + live data
        const klaviyoDataList = [
          ...withCache.map(r => mapCacheToPortalKlaviyo(r.result.data!)),
          ...liveFetchedData.map(d => mapCacheToPortalKlaviyo(d)),
        ]

        // Determine aggregate data status
        const hasStaleCache = withCache.some(r => r.result.isStale)
        const hasPartialLive = withoutCache.length > 0 && liveFetchedData.length < withoutCache.length

        if (klaviyoDataList.length > 0) {
          // Aggregate flows from all stores
          const allFlows: Array<Record<string, unknown>> = []
          klaviyoDataList.forEach((k) => {
            if (k.topFlows) allFlows.push(...(k.topFlows as Array<Record<string, unknown>>))
          })
          const topFlowsAggregated = allFlows
            .sort((a, b) => ((b.revenue as number) || 0) - ((a.revenue as number) || 0))
            .slice(0, 10)

          // Aggregate campaigns from all stores
          const allCampaigns: Array<Record<string, unknown>> = []
          klaviyoDataList.forEach((k) => {
            if (k.recentCampaigns) allCampaigns.push(...(k.recentCampaigns as Array<Record<string, unknown>>))
          })
          const recentCampaignsAggregated = allCampaigns
            .sort((a, b) => new Date((b.sentAt as string) || 0).getTime() - new Date((a.sentAt as string) || 0).getTime())
            .slice(0, 10)

          const totalDelivered = klaviyoDataList.reduce((sum, k) => sum + (k.delivered || 0), 0)
          const totalOpened = klaviyoDataList.reduce((sum, k) => sum + (k.opened || 0), 0)
          const totalClicked = klaviyoDataList.reduce((sum, k) => sum + (k.clicked || 0), 0)
          const aggTotalRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.totalRevenue || 0), 0)
          const aggCampaignRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.campaignRevenue || 0), 0)
          const aggFlowRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.flowRevenue || 0), 0)
          const aggStoreRevenue = klaviyoDataList.reduce((sum, k) => sum + (k.storeRevenue || 0), 0)
          const aggStoreOrders = klaviyoDataList.reduce((sum, k) => sum + (k.storeOrders || 0), 0)
          const aggConversions = klaviyoDataList.reduce((sum, k) => sum + (k.conversions || 0), 0)

          response.klaviyo = {
            storeRevenue: aggStoreRevenue,
            storeOrders: aggStoreOrders,
            recoveryRate: aggStoreRevenue > 0 ? (aggTotalRevenue / aggStoreRevenue) * 100 : 0,
            totalLeads: klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0),
            engagedLeads: klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0),
            engagementRate: (() => {
              const aggTotalLeads = klaviyoDataList.reduce((sum, k) => sum + (k.totalLeads || 0), 0)
              const aggEngagedLeads = klaviyoDataList.reduce((sum, k) => sum + (k.engagedLeads || 0), 0)
              return aggTotalLeads > 0 ? (aggEngagedLeads / aggTotalLeads) * 100 : 0
            })(),
            totalRevenue: aggTotalRevenue,
            campaignRevenue: aggCampaignRevenue,
            flowRevenue: aggFlowRevenue,
            smsRevenue: 0,
            emailsSent: totalDelivered,
            delivered: totalDelivered,
            opened: totalOpened,
            clicked: totalClicked,
            openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
            clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
            clickToOpenRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
            conversionRate: totalDelivered > 0 ? (aggConversions / totalDelivered) * 100 : 0,
            unsubscribeRate: klaviyoDataList.length > 0
              ? klaviyoDataList.reduce((sum, k) => sum + (k.unsubscribeRate || 0), 0) / klaviyoDataList.length
              : 0,
            bounceRate: klaviyoDataList.length > 0
              ? klaviyoDataList.reduce((sum, k) => sum + (k.bounceRate || 0), 0) / klaviyoDataList.length
              : 0,
            bounces: klaviyoDataList.reduce((sum, k) => sum + (k.bounces || 0), 0),
            campaignsCount: klaviyoDataList.reduce((sum, k) => sum + (k.campaignsCount || 0), 0),
            campaignDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.campaignDelivered || 0), 0),
            campaignRevenuePercent: aggTotalRevenue > 0 ? (aggCampaignRevenue / aggTotalRevenue) * 100 : 0,
            flowsCount: klaviyoDataList.reduce((sum, k) => sum + (k.flowsCount || 0), 0),
            activeFlows: klaviyoDataList.reduce((sum, k) => sum + (k.activeFlows || 0), 0),
            flowDelivered: klaviyoDataList.reduce((sum, k) => sum + (k.flowDelivered || 0), 0),
            flowRevenuePercent: aggTotalRevenue > 0 ? (aggFlowRevenue / aggTotalRevenue) * 100 : 0,
            recentCampaigns: recentCampaignsAggregated,
            topFlows: topFlowsAggregated,
          }

          if (hasStaleCache || hasPartialLive) {
            response.dataStatus = "stale" satisfies DataStatus
            response.source = hasStaleCache ? "stale-cache" : "live"
            response.isRefreshing = hasPartialLive
          } else {
            response.dataStatus = "ready" satisfies DataStatus
            response.source = liveFetchedData.length > 0 ? "live" : "cache"
            response.isRefreshing = false
          }
          // Use earliest fetchedAt from cache results
          response.lastFetchedAt = withCache.reduce<string | null>((oldest, r) => {
            if (!r.result.fetchedAt) return oldest
            if (!oldest) return r.result.fetchedAt
            return new Date(r.result.fetchedAt) < new Date(oldest) ? r.result.fetchedAt : oldest
          }, null)
        } else if (hasKlaviyoStores) {
          // Stores exist but all caches empty and no live results
          // fetchKlaviyoFromCache already reads without expires_at filter (stale allowed),
          // so if we got here, there is truly no data at all
          response.dataStatus = "loading" satisfies DataStatus
          response.isRefreshing = true
          response.source = "cache"
          response.lastFetchedAt = null
        }

        // Aggregate Shopify data
        const shopifyDataList = shopifyResults
          .filter(r => r.data !== null)
          .map(r => mapShopifyData(r.data!))

        if (shopifyDataList.length > 0) {
          // Aggregate all products
          const productMap = new Map<string, { name: string; quantity: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            (s.topProducts || []).forEach((p) => {
              const existing = productMap.get(p.name)
              if (existing) {
                existing.quantity += p.quantity
                existing.revenue += p.revenue
              } else {
                productMap.set(p.name, { ...p })
              }
            })
          })
          const topProductsAggregated = Array.from(productMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

          // Aggregate coupons
          const couponMap = new Map<string, { code: string; orders: number; revenue: number; discount: number }>()
          shopifyDataList.forEach((s) => {
            ((s.coupons?.topCoupons || []) as Array<Record<string, unknown>>).forEach((c) => {
              const code = (c.code as string) || ''
              const existing = couponMap.get(code)
              if (existing) {
                existing.orders += (c.orders as number) || 0
                existing.revenue += (c.revenue as number) || 0
                existing.discount += (c.discount as number) || 0
              } else {
                couponMap.set(code, {
                  code,
                  orders: (c.orders as number) || 0,
                  revenue: (c.revenue as number) || 0,
                  discount: (c.discount as number) || 0,
                })
              }
            })
          })
          const topCouponsAggregated = Array.from(couponMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20)

          // Aggregate UTM sources
          const utmSourceMap = new Map<string, { source: string; orders: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            ((s.utmConversions?.bySource || []) as Array<Record<string, unknown>>).forEach((u) => {
              const source = (u.source as string) || ''
              const existing = utmSourceMap.get(source)
              if (existing) {
                existing.orders += (u.orders as number) || 0
                existing.revenue += (u.revenue as number) || 0
              } else {
                utmSourceMap.set(source, {
                  source,
                  orders: (u.orders as number) || 0,
                  revenue: (u.revenue as number) || 0,
                })
              }
            })
          })

          // Aggregate UTM mediums
          const utmMediumMap = new Map<string, { medium: string; orders: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            ((s.utmConversions?.byMedium || []) as Array<Record<string, unknown>>).forEach((u) => {
              const medium = (u.medium as string) || ''
              const existing = utmMediumMap.get(medium)
              if (existing) {
                existing.orders += (u.orders as number) || 0
                existing.revenue += (u.revenue as number) || 0
              } else {
                utmMediumMap.set(medium, {
                  medium,
                  orders: (u.orders as number) || 0,
                  revenue: (u.revenue as number) || 0,
                })
              }
            })
          })

          // Aggregate UTM campaigns
          const utmCampaignMap = new Map<string, { campaign: string; orders: number; revenue: number }>()
          shopifyDataList.forEach((s) => {
            ((s.utmConversions?.byCampaign || []) as Array<Record<string, unknown>>).forEach((u) => {
              const campaign = (u.campaign as string) || ''
              const existing = utmCampaignMap.get(campaign)
              if (existing) {
                existing.orders += (u.orders as number) || 0
                existing.revenue += (u.revenue as number) || 0
              } else {
                utmCampaignMap.set(campaign, {
                  campaign,
                  orders: (u.orders as number) || 0,
                  revenue: (u.revenue as number) || 0,
                })
              }
            })
          })

          // Aggregate Top Customers
          const customerMap = new Map<string, {
            email: string
            name: string
            ordersCount: number
            totalSpent: number
            averageOrderValue: number
            lastOrderDate: string
          }>()
          shopifyDataList.forEach((s) => {
            (s.topCustomers || []).forEach((c) => {
              if (!c.email) return
              const email = c.email.toLowerCase()
              const existing = customerMap.get(email)
              if (existing) {
                existing.ordersCount += c.ordersCount
                existing.totalSpent += c.totalSpent
                existing.averageOrderValue = existing.ordersCount > 0
                  ? existing.totalSpent / existing.ordersCount
                  : 0
                if (c.lastOrderDate > existing.lastOrderDate) {
                  existing.lastOrderDate = c.lastOrderDate
                }
              } else {
                customerMap.set(email, { ...c, email })
              }
            })
          })
          const topCustomersAggregated = Array.from(customerMap.values())
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10)

          const totalOrders = shopifyDataList.reduce((sum, s) => sum + (s.totalOrders || 0), 0)
          const paidOrders = shopifyDataList.reduce((sum, s) => sum + (s.paidOrders || 0), 0)
          const totalRevenue = shopifyDataList.reduce((sum, s) => sum + (s.totalRevenue || 0), 0)
          const totalOrdersWithCoupon = shopifyDataList.reduce((sum, s) => sum + (s.coupons?.totalOrdersWithCoupon || 0), 0)
          const totalOrdersWithUtm = shopifyDataList.reduce((sum, s) => sum + (s.utmConversions?.totalOrdersWithUtm || 0), 0)

          response.shopify = {
            totalRevenue,
            totalOrders,
            paidOrders,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            totalCustomers: shopifyDataList.reduce((sum, s) => sum + (s.totalCustomers || 0), 0),
            newCustomers: shopifyDataList.reduce((sum, s) => sum + (s.newCustomers || 0), 0),
            recurringCustomerRate: shopifyDataList.length > 0
              ? shopifyDataList.reduce((sum, s) => sum + (s.recurringCustomerRate || 0), 0) / shopifyDataList.length
              : 0,
            topProducts: topProductsAggregated,
            topCustomers: topCustomersAggregated,
            coupons: {
              totalOrdersWithCoupon,
              couponUsageRate: paidOrders > 0 ? (totalOrdersWithCoupon / paidOrders) * 100 : 0,
              topCoupons: topCouponsAggregated,
              totalDiscount: shopifyDataList.reduce((sum, s) => sum + (s.coupons?.totalDiscount || 0), 0),
            },
            utmConversions: {
              totalOrdersWithUtm,
              utmTrackingRate: paidOrders > 0 ? (totalOrdersWithUtm / paidOrders) * 100 : 0,
              bySource: Array.from(utmSourceMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
              byMedium: Array.from(utmMediumMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
              byCampaign: Array.from(utmCampaignMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
            },
          }
        }

        response.selectedStore = {
          id: "all",
          name: "Todas as Lojas",
          platform: "aggregated",
        }
      }
    }

    // Structured observability logging
    log.info("[CacheStrategy]", {
      endpoint: "portal-dashboard",
      period,
      storesCount: stores.length,
      cacheHits: storeId && storeId !== "all"
        ? (response.source === "cache" || response.source === "stale-cache" ? 1 : 0)
        : (response.source === "cache" || response.source === "stale-cache" ? storesWithKlaviyo.length : 0),
      cacheMisses: storeId && storeId !== "all"
        ? (response.source === "live" || response.source === "loading" ? 1 : 0)
        : (response.source === "live" ? storesWithKlaviyo.length : 0),
      liveFetches: response.source === "live" ? 1 : 0,
      source: (response.source as string) || "unknown",
      elapsed: `${Date.now() - startTime}ms`,
    })

    // Log activity
    try {
      await adminClient.from("client_portal_activity").insert({
        portal_user_id: portalUser.id,
        client_id: clientId,
        action: "view_dashboard",
        metadata: { period, storeId },
      })
    } catch {
      // Ignore activity logging errors
    }

    return NextResponse.json(response, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "PortalDashboard")
  }
}
