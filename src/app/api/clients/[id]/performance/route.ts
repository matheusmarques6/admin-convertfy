import { NextRequest } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { parseDateRange, formatDateStr, withConcurrencyLimit } from "@/lib/integrations/klaviyo"
import { getShopifyReportForStore } from "@/lib/integrations/shopify/report"
import { decryptStoreCredentials } from "@/lib/crypto"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import type { KlaviyoPerformanceData } from "@/lib/services/klaviyo-performance.service"

const log = logger.child("ClientPerformance")

export const maxDuration = 30
export const dynamic = "force-dynamic"

interface StorePerformance {
  storeId: string
  storeName: string
  hasKlaviyo: boolean
  hasShopify: boolean
  klaviyo: KlaviyoPerformanceData | null
  shopify: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalCustomers: number
    recurringCustomerRate: number
  } | null
  errors: Array<{ integration: string; message: string; code?: string }>
}

// ─── Cache-First Helper ─────────────────────────────────────────────────────

/**
 * Read Klaviyo data from cron-populated cache tables and map to KlaviyoPerformanceData.
 * Only works for CACHED_PERIODS (7d, 15d, 30d, 90d) — returns null for other periods.
 */
async function readKlaviyoFromCacheTables(
  adminClient: SupabaseClient,
  storeId: string,
  period: string,
): Promise<KlaviyoPerformanceData | null> {
  if (!(CACHED_PERIODS as readonly string[]).includes(period)) return null

  const { data: summary } = await adminClient
    .from("store_revenue_summary")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .single()

  if (!summary || summary.sync_status === "error") return null

  const [{ data: campaigns }, { data: flows }] = await Promise.all([
    adminClient
      .from("klaviyo_campaign_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_label", period),
    adminClient
      .from("klaviyo_flow_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("period_label", period),
  ])

  const campList = campaigns || []
  const flowList = flows || []

  // Aggregate email metrics across all campaigns + flows
  let totalDelivered = 0, totalOpens = 0, totalClicks = 0
  let bounceRateSum = 0, unsubRateSum = 0, rateCount = 0

  for (const c of campList) {
    totalDelivered += c.delivered || 0
    totalOpens += c.opened || 0
    totalClicks += c.clicked || 0
    if (c.delivered > 0) {
      bounceRateSum += Number(c.bounce_rate) || 0
      unsubRateSum += Number(c.unsubscribe_rate) || 0
      rateCount++
    }
  }
  for (const f of flowList) {
    totalDelivered += f.delivered || 0
    totalOpens += f.opened || 0
    totalClicks += f.clicked || 0
    if (f.delivered > 0) {
      bounceRateSum += Number(f.bounce_rate) || 0
      unsubRateSum += Number(f.unsubscribe_rate) || 0
      rateCount++
    }
  }

  const avgOpenRate = totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0
  const avgClickRate = totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0
  const bounceRate = rateCount > 0 ? bounceRateSum / rateCount : 0
  const unsubscribeRate = rateCount > 0 ? unsubRateSum / rateCount : 0

  const attributedRevenue = Number(summary.klaviyo_total_revenue) || 0
  const storeRevenue = Number(summary.store_total_revenue) || 0

  return {
    storeRevenue,
    storeOrders: summary.store_orders || 0,
    attributedRevenue,
    campaignRevenue: Number(summary.klaviyo_campaign_revenue) || 0,
    flowRevenue: Number(summary.klaviyo_flow_revenue) || 0,
    recoveryRate: storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0,
    sentCampaigns: campList.length,
    totalFlows: flowList.length,
    liveFlows: flowList.filter(f => f.flow_status === "live").length,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgOpenRate,
    avgClickRate,
    bounceRate,
    unsubscribeRate,
    totalLeads: summary.total_leads || 0,
    engagedLeads: summary.engaged_leads || 0,
    engagementRate: Number(summary.engagement_rate) || 0,
    recentCampaigns: campList.map(c => ({
      campaignId: c.campaign_id,
      name: c.campaign_name || "Unknown",
      sendTime: c.send_time || "",
      recipients: c.recipients || 0,
      delivered: c.delivered || 0,
      opened: c.opened || 0,
      clicked: c.clicked || 0,
      conversions: c.conversions || 0,
      openRate: Number(c.open_rate) || 0,
      clickRate: Number(c.click_rate) || 0,
      revenue: Number(c.conversion_value) || 0,
    })),
    topFlows: flowList.map(f => ({
      flowId: f.flow_id,
      name: f.flow_name || "Unknown",
      status: f.flow_status || "unknown",
      delivered: f.delivered || 0,
      revenue: Number(f.conversion_value) || 0,
      openRate: Number(f.open_rate) || 0,
      clickRate: Number(f.click_rate) || 0,
    })),
  }
}

/**
 * GET /api/clients/[id]/performance
 *
 * Aggregates performance data across all stores for a client.
 * Accepts period: today, yesterday, 7d, 15d, 30d (default: 30d)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const user = await requireAuth(supabase)

    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    // Validate period
    const validPeriods = ["today", "yesterday", "7d", "15d", "30d", "90d", "custom"]
    if (!validPeriods.includes(period)) {
      throw new AppError(`Período inválido: ${period}. Use: ${validPeriods.join(", ")}`, 400)
    }

    // Verify user has access to this client (RLS or portal user)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, org_id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      // Fallback: check if user is a portal user for this client
      const { data: portalUser } = await adminClient
        .from("client_portal_users")
        .select("client_id")
        .eq("auth_user_id", user.id)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .single()

      if (!portalUser) {
        throw new AppError("Cliente não encontrado ou acesso negado", 404)
      }
    }

    // Get client stores and decrypt credentials
    const { data: rawStores, error: storesError } = await adminClient
      .from("client_stores")
      .select("id, store_name, org_id, klaviyo_api_key, klaviyo_private_key, shopify_store_domain, shopify_access_token")
      .eq("client_id", clientId)
      .eq("is_active", true)

    if (storesError) throw storesError
    const stores = (rawStores || []).map(s => decryptStoreCredentials(s))
    if (!stores || stores.length === 0) {
      return successResponse(request, {
        period,
        stores: [],
        totals: emptyTotals(),
        billing: { totalPaid: 0, totalPending: 0, totalOverdue: 0 },
      })
    }

    // Calculate date range
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Fetch performance data for stores with limited concurrency (max 2 at a time)
    // This prevents overwhelming the Klaviyo API with concurrent requests
    const fetchStorePerformance = async (store: typeof stores[0]): Promise<StorePerformance> => {
      const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key)
      const hasShopify = !!(store.shopify_store_domain && store.shopify_access_token)

      let klaviyoData: KlaviyoPerformanceData | null = null
      let shopifyData: StorePerformance["shopify"] = null
      const errors: StorePerformance["errors"] = []

      // Klaviyo: pure cache read — no live API calls
      if (hasKlaviyo) {
        klaviyoData = await readKlaviyoFromCacheTables(adminClient, store.id, period)
        if (klaviyoData) {
          log.info(`[ClientPerf] Cache HIT for store ${store.id}/${period}`)
        } else {
          log.info(`[ClientPerf] Cache MISS for store ${store.id}/${period}`)
        }
      }

      // Fetch Shopify data via direct module call
      if (hasShopify) {
        try {
          const report = await getShopifyReportForStore(store.id, period, customStartDate, customEndDate)
          if (report.connected && report.summary) {
            shopifyData = {
              totalRevenue: report.summary.totalRevenue || 0,
              totalOrders: report.summary.totalOrders || 0,
              averageOrderValue: report.summary.averageOrderValue || 0,
              totalCustomers: report.summary.totalCustomers || 0,
              recurringCustomerRate: report.summary.recurringCustomerRate || 0,
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erro desconhecido ao buscar dados do Shopify"
          log.warn("Failed to fetch Shopify data for store", { storeId: store.id, error: err })
          errors.push({ integration: "shopify", message })
        }
      }

      return {
        storeId: store.id,
        storeName: store.store_name,
        hasKlaviyo,
        hasShopify,
        klaviyo: klaviyoData,
        shopify: shopifyData,
        errors,
      }
    }

    const storeResults = await withConcurrencyLimit(stores, 2, fetchStorePerformance)

    // Aggregate billing data
    const billing = await fetchBillingData(adminClient, clientId, startDate, endDate)

    // Calculate totals across all stores
    const totals = aggregateTotals(storeResults)

    const responseData = {
      period,
      dateRange: { start: startDateStr, end: endDateStr },
      stores: storeResults,
      totals,
      billing,
      storeErrors: storeResults.filter(s => s.errors.length > 0).map(s => ({
        storeName: s.storeName,
        errors: s.errors,
      })),
    }

    return successResponse(request, responseData)
  } catch (error) {
    log.error("Error fetching client performance", error)
    return errorResponse(request, error, "ClientPerformance")
  }
}

async function fetchBillingData(
  adminClient: ReturnType<typeof createAdminClient>,
  clientId: string,
  startDate: Date,
  endDate: Date
) {
  const startStr = startDate.toISOString().split("T")[0]
  const endStr = endDate.toISOString().split("T")[0]

  const [invoicesRes, chargesRes] = await Promise.all([
    adminClient
      .from("invoices")
      .select("amount, status")
      .eq("client_id", clientId)
      .gte("due_date", startStr)
      .lte("due_date", endStr),
    adminClient
      .from("client_charges")
      .select("value, status")
      .eq("client_id", clientId)
      .gte("due_date", startStr)
      .lte("due_date", endStr),
  ])

  const invoices = invoicesRes.data || []
  const charges = chargesRes.data || []

  const totalPaid =
    invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0) +
    charges.filter(c => c.status === "paid").reduce((s, c) => s + Number(c.value), 0)

  const totalPending =
    invoices.filter(i => i.status === "pending").reduce((s, i) => s + Number(i.amount), 0) +
    charges.filter(c => c.status === "pending").reduce((s, c) => s + Number(c.value), 0)

  const totalOverdue =
    invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0) +
    charges.filter(c => c.status === "overdue").reduce((s, c) => s + Number(c.value), 0)

  return { totalPaid, totalPending, totalOverdue }
}

function aggregateTotals(stores: StorePerformance[]) {
  let storeRevenue = 0
  let storeOrders = 0
  let attributedRevenue = 0
  let campaignRevenue = 0
  let flowRevenue = 0
  let totalCampaigns = 0
  let totalFlows = 0
  let shopifyRevenue = 0
  let shopifyOrders = 0
  let shopifyCustomers = 0
  let openRateSum = 0
  let clickRateSum = 0
  let rateCount = 0

  for (const store of stores) {
    if (store.klaviyo) {
      storeRevenue += store.klaviyo.storeRevenue
      storeOrders += store.klaviyo.storeOrders
      attributedRevenue += store.klaviyo.attributedRevenue
      campaignRevenue += store.klaviyo.campaignRevenue
      flowRevenue += store.klaviyo.flowRevenue
      totalCampaigns += store.klaviyo.sentCampaigns
      totalFlows += store.klaviyo.liveFlows
      if (store.klaviyo.avgOpenRate > 0) {
        openRateSum += store.klaviyo.avgOpenRate
        clickRateSum += store.klaviyo.avgClickRate
        rateCount++
      }
    }
    if (store.shopify) {
      shopifyRevenue += store.shopify.totalRevenue
      shopifyOrders += store.shopify.totalOrders
      shopifyCustomers += store.shopify.totalCustomers
    }
  }

  const recoveryRate = storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0

  return {
    storeRevenue,
    storeOrders,
    attributedRevenue,
    klaviyoRevenue: attributedRevenue, // backwards compat
    campaignRevenue,
    flowRevenue,
    recoveryRate,
    shopifyRevenue,
    shopifyOrders,
    shopifyCustomers,
    totalCampaigns,
    totalFlows,
    avgOpenRate: rateCount > 0 ? openRateSum / rateCount : 0,
    avgClickRate: rateCount > 0 ? clickRateSum / rateCount : 0,
  }
}

function emptyTotals() {
  return {
    storeRevenue: 0,
    storeOrders: 0,
    attributedRevenue: 0,
    klaviyoRevenue: 0,
    campaignRevenue: 0,
    flowRevenue: 0,
    recoveryRate: 0,
    shopifyRevenue: 0,
    shopifyOrders: 0,
    shopifyCustomers: 0,
    totalCampaigns: 0,
    totalFlows: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
  }
}
