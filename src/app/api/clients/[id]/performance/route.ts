import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { getCache, setCache } from "@/lib/cache"
import {
  parseDateRange,
  formatDateStr,
  klaviyoRequest,
  getAccountInfo,
  findPlacedOrderMetric,
  getTimezoneOffset,
} from "@/lib/integrations/klaviyo"
import { getShopifyReportForStore } from "@/lib/integrations/shopify/report"
import { decryptStoreCredentials } from "@/lib/crypto"

const log = logger.child("ClientPerformance")

export const maxDuration = 120
export const dynamic = "force-dynamic"

interface StorePerformance {
  storeId: string
  storeName: string
  hasKlaviyo: boolean
  hasShopify: boolean
  klaviyo: {
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalCampaigns: number
    sentCampaigns: number
    totalFlows: number
    liveFlows: number
    avgOpenRate: number
    avgClickRate: number
    recentCampaigns: Array<{
      name: string
      sendTime: string
      recipients: number
      openRate: number
      clickRate: number
      revenue: number
    }>
    topFlows: Array<{
      name: string
      status: string
      revenue: number
      openRate: number
      clickRate: number
    }>
  } | null
  shopify: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalCustomers: number
    recurringCustomerRate: number
  } | null
  errors: Array<{ integration: string; message: string; code?: string }>
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
    await requireAuth(supabase)

    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30d"
    const forceRefresh = searchParams.get("force_refresh") === "true"

    // Validate period
    const validPeriods = ["today", "yesterday", "7d", "15d", "30d"]
    if (!validPeriods.includes(period)) {
      throw new AppError(`Período inválido: ${period}. Use: ${validPeriods.join(", ")}`, 400)
    }

    // Verify user has access to this client (RLS enforced)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .single()

    if (clientError || !client) {
      throw new AppError("Cliente não encontrado ou acesso negado", 404)
    }

    // Check cache first (using clientId as storeId key)
    if (!forceRefresh) {
      const cached = await getCache(adminClient, clientId, "client_performance", period)
      if (cached) {
        return successResponse(request, { ...cached.data, fromCache: true, cachedAt: cached.cachedAt })
      }
    }

    // Get client stores and decrypt credentials
    const { data: rawStores, error: storesError } = await adminClient
      .from("client_stores")
      .select("id, store_name, klaviyo_api_key, klaviyo_private_key, shopify_store_domain, shopify_access_token")
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
    const { startDate, endDate } = parseDateRange(period)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Fetch performance data for each store in parallel
    const storePromises = stores.map(async (store): Promise<StorePerformance> => {
      const hasKlaviyo = !!(store.klaviyo_private_key || store.klaviyo_api_key)
      const hasShopify = !!(store.shopify_store_domain && store.shopify_access_token)

      let klaviyoData: StorePerformance["klaviyo"] = null
      let shopifyData: StorePerformance["shopify"] = null
      const errors: StorePerformance["errors"] = []

      // Fetch Klaviyo data
      if (hasKlaviyo) {
        try {
          const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
          if (apiKey) {
            klaviyoData = await fetchKlaviyoPerformance(apiKey, startDateStr, endDateStr)
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : String(err)
          let message = rawMsg
          let code: string | undefined

          if (rawMsg.includes("401") || rawMsg.includes("403") || rawMsg.toLowerCase().includes("unauthorized")) {
            message = "API Key sem permissão para métricas. Verifique os scopes da chave Klaviyo."
            code = "AUTH_ERROR"
          } else if (rawMsg.includes("429")) {
            message = "Limite de requisições Klaviyo excedido. Tente novamente em alguns minutos."
            code = "RATE_LIMIT"
          } else if (rawMsg.includes("Falha ao conectar")) {
            message = "Falha ao conectar com a API do Klaviyo. Verifique as credenciais."
            code = "CONNECTION_ERROR"
          }

          log.warn("Failed to fetch Klaviyo data for store", { storeId: store.id, error: err })
          errors.push({ integration: "klaviyo", message, code })
        }
      }

      // Fetch Shopify data via direct module call (no HTTP self-fetch)
      if (hasShopify) {
        try {
          const report = await getShopifyReportForStore(store.id, period)
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
    })

    const storeResults = await Promise.all(storePromises)

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

    // Save to cache (fire-and-forget)
    setCache(adminClient, clientId, "client_performance", period, responseData as unknown as Record<string, unknown>).catch(() => {})

    return successResponse(request, responseData)
  } catch (error) {
    log.error("Error fetching client performance", error)
    return errorResponse(request, error, "ClientPerformance")
  }
}

async function fetchKlaviyoPerformance(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<StorePerformance["klaviyo"]> {
  // Get account info for timezone
  const accountInfo = await getAccountInfo(apiKey)
  const timezone = accountInfo?.timezone || "America/Sao_Paulo"
  const tzOffset = getTimezoneOffset(timezone)

  const startISO = `${startDate}T00:00:00${tzOffset}`
  const endISO = `${endDate}T23:59:59${tzOffset}`

  // Find Placed Order metric for revenue
  const placedOrderMetric = await findPlacedOrderMetric(apiKey)

  // Fetch campaign and flow reports in parallel
  const [campaignReport, flowReport] = await Promise.all([
    klaviyoRequest<KlaviyoCampaignReport>(apiKey, "campaign-values-reports/", {
      method: "POST",
      logTag: "CampaignReport",
      body: {
        data: {
          type: "campaign-values-report",
          attributes: {
            statistics: [
              "recipients", "delivered", "open_rate", "click_rate",
              "conversion_rate", "conversion_value", "revenue_per_recipient",
            ],
            timeframe: { start: startISO, end: endISO },
            ...(placedOrderMetric ? { conversion_metric_id: placedOrderMetric } : {}),
          },
        },
      },
    }),
    klaviyoRequest<KlaviyoFlowReport>(apiKey, "flow-values-reports/", {
      method: "POST",
      logTag: "FlowReport",
      body: {
        data: {
          type: "flow-values-report",
          attributes: {
            statistics: [
              "recipients", "delivered", "open_rate", "click_rate",
              "conversion_rate", "conversion_value", "revenue_per_recipient",
            ],
            timeframe: { start: startISO, end: endISO },
            ...(placedOrderMetric ? { conversion_metric_id: placedOrderMetric } : {}),
          },
        },
      },
    }),
  ])

  // If both API calls failed (returned null), throw so the error surfaces in storeErrors
  if (!campaignReport && !flowReport) {
    throw new Error("Falha ao conectar com a API do Klaviyo. Verifique as credenciais.")
  }

  // Parse campaign results
  const campaignResults = campaignReport?.data?.attributes?.results || []
  const flowResults = flowReport?.data?.attributes?.results || []

  let campaignRevenue = 0
  let flowRevenue = 0
  let totalCampaignRecipients = 0
  let totalFlowRecipients = 0
  let campaignOpenRateSum = 0
  let campaignClickRateSum = 0
  let campaignCount = 0

  const recentCampaigns: StorePerformance["klaviyo"] extends null ? never : NonNullable<StorePerformance["klaviyo"]>["recentCampaigns"] = []

  for (const r of campaignResults) {
    const stats = r.statistics || {}
    const rev = Number(stats.conversion_value) || 0
    const recip = Number(stats.recipients) || 0
    campaignRevenue += rev
    totalCampaignRecipients += recip
    if (stats.open_rate) { campaignOpenRateSum += Number(stats.open_rate); campaignCount++ }
    if (stats.click_rate) { campaignClickRateSum += Number(stats.click_rate); campaignCount++ }

    recentCampaigns.push({
      name: r.groupings?.campaign_name || r.groupings?.["campaign_name"] || "Campaign",
      sendTime: r.groupings?.send_time || "",
      recipients: recip,
      openRate: Number(stats.open_rate) || 0,
      clickRate: Number(stats.click_rate) || 0,
      revenue: rev,
    })
  }

  // Sort campaigns by revenue desc, take top 5
  recentCampaigns.sort((a, b) => b.revenue - a.revenue)
  const topCampaigns = recentCampaigns.slice(0, 5)

  const topFlows: NonNullable<StorePerformance["klaviyo"]>["topFlows"] = []
  for (const r of flowResults) {
    const stats = r.statistics || {}
    const rev = Number(stats.conversion_value) || 0
    const recip = Number(stats.recipients) || 0
    flowRevenue += rev
    totalFlowRecipients += recip

    topFlows.push({
      name: r.groupings?.flow_name || r.groupings?.["flow_name"] || "Flow",
      status: "live",
      revenue: rev,
      openRate: Number(stats.open_rate) || 0,
      clickRate: Number(stats.click_rate) || 0,
    })
  }

  topFlows.sort((a, b) => b.revenue - a.revenue)

  const avgOpenRate = campaignCount > 0 ? campaignOpenRateSum / campaignCount : 0
  const avgClickRate = campaignCount > 0 ? campaignClickRateSum / campaignCount : 0

  return {
    totalRevenue: campaignRevenue + flowRevenue,
    campaignRevenue,
    flowRevenue,
    totalCampaigns: campaignResults.length,
    sentCampaigns: campaignResults.length,
    totalFlows: flowResults.length,
    liveFlows: flowResults.length,
    avgOpenRate,
    avgClickRate,
    recentCampaigns: topCampaigns,
    topFlows: topFlows.slice(0, 5),
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

  // Fetch invoices and local charges in parallel
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
  let klaviyoRevenue = 0
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
      klaviyoRevenue += store.klaviyo.totalRevenue
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

  return {
    klaviyoRevenue,
    campaignRevenue,
    flowRevenue,
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
    klaviyoRevenue: 0,
    campaignRevenue: 0,
    flowRevenue: 0,
    shopifyRevenue: 0,
    shopifyOrders: 0,
    shopifyCustomers: 0,
    totalCampaigns: 0,
    totalFlows: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
  }
}

// Klaviyo report response types
interface KlaviyoReportResult {
  groupings?: Record<string, string>
  statistics?: Record<string, number | string>
}

interface KlaviyoCampaignReport {
  data?: {
    attributes?: {
      results?: KlaviyoReportResult[]
    }
  }
}

interface KlaviyoFlowReport {
  data?: {
    attributes?: {
      results?: KlaviyoReportResult[]
    }
  }
}
