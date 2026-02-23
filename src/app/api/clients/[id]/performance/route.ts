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
  sleep,
  MIN_REQUEST_INTERVAL,
  KLAVIYO_API_URL,
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
    storeRevenue: number
    storeOrders: number
    attributedRevenue: number
    campaignRevenue: number
    flowRevenue: number
    recoveryRate: number
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
    _debugMetricAgg?: unknown
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
    // Skip cache if data has zero revenue (likely stale from API fix)
    if (!forceRefresh) {
      const cached = await getCache(adminClient, clientId, "client_performance", period)
      if (cached) {
        const cachedTotals = (cached.data as Record<string, unknown>).totals as Record<string, number> | undefined
        const hasData = cachedTotals && (cachedTotals.klaviyoRevenue > 0 || cachedTotals.shopifyRevenue > 0)
        if (hasData) {
          return successResponse(request, { ...cached.data, fromCache: true, cachedAt: cached.cachedAt })
        }
        log.info("[ClientPerformance] Skipping zero-data cache, fetching fresh data")
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

  // Find Placed Order metric for revenue (required by Klaviyo Reporting API)
  const placedOrderMetric = await findPlacedOrderMetric(apiKey)

  if (!placedOrderMetric) {
    log.warn("No Placed Order metric found - cannot fetch conversion/revenue data")
    return {
      storeRevenue: 0,
      storeOrders: 0,
      attributedRevenue: 0,
      campaignRevenue: 0,
      flowRevenue: 0,
      recoveryRate: 0,
      totalCampaigns: 0,
      sentCampaigns: 0,
      totalFlows: 0,
      liveFlows: 0,
      avgOpenRate: 0,
      avgClickRate: 0,
      recentCampaigns: [],
      topFlows: [],
    }
  }

  const reportStats = [
    "recipients", "delivered", "opens_unique", "click_rate",
    "click_to_open_rate", "conversion_rate", "conversion_value", "revenue_per_recipient",
  ]

  // Fetch campaign report (sequential to avoid rate limiting)
  await sleep(MIN_REQUEST_INTERVAL)
  const campaignReport = await klaviyoRequest<KlaviyoCampaignReport>(apiKey, "/campaign-values-reports/", {
    method: "POST",
    logTag: "PerfCampaignReport",
    body: {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          conversion_metric_id: placedOrderMetric,
        },
      },
    },
  })

  // Fetch flow report
  await sleep(MIN_REQUEST_INTERVAL)
  const flowReport = await klaviyoRequest<KlaviyoFlowReport>(apiKey, "/flow-values-reports/", {
    method: "POST",
    logTag: "PerfFlowReport",
    body: {
      data: {
        type: "flow-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          conversion_metric_id: placedOrderMetric,
        },
      },
    },
  })

  // Fetch total store revenue via metric-aggregates (all Placed Orders, not just email-attributed)
  await sleep(MIN_REQUEST_INTERVAL)
  const metricAgg = await klaviyoRequest<KlaviyoMetricAggregate>(apiKey, "/metric-aggregates/", {
    method: "POST",
    logTag: "PerfMetricAgg",
    body: {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: placedOrderMetric,
          measurements: ["value", "count"],
          filter: [
            `greater-or-equal(datetime,${startISO})`,
            `less-than(datetime,${endISO})`,
          ],
          timezone: timezone,
        },
      },
    },
  })

  // If campaign+flow both failed, throw so the error surfaces in storeErrors
  // metric-aggregates failure is non-fatal (storeRevenue will be 0)
  if (!campaignReport && !flowReport) {
    throw new Error("Falha ao conectar com a API do Klaviyo. Verifique as credenciais.")
  }

  // Parse store-wide revenue from metric-aggregates
  log.info("[MetricAgg] Raw response:", JSON.stringify(metricAgg ?? "null").slice(0, 500))
  const aggData = metricAgg?.data?.attributes?.data || []
  let storeRevenue = 0
  let storeOrders = 0
  for (const row of aggData) {
    const measurements = row.measurements || {}
    // measurements.value may be an array [total] or a number
    const val = Array.isArray(measurements.value) ? measurements.value[0] : measurements.value
    const cnt = Array.isArray(measurements.count) ? measurements.count[0] : measurements.count
    storeRevenue += Number(val) || 0
    storeOrders += Number(cnt) || 0
  }

  // Parse campaign results - aggregate by campaign_id (API returns per-message rows)
  const campaignResults = campaignReport?.data?.attributes?.results || []
  const flowResults = flowReport?.data?.attributes?.results || []

  // Aggregate campaign metrics by campaign_id
  const campAgg = new Map<string, { recipients: number; delivered: number; opensUnique: number; clickRate: number; conversionValue: number }>()
  for (const r of campaignResults) {
    const cid = r.groupings?.campaign_id
    if (!cid) continue
    const stats = r.statistics || {}
    const ex = campAgg.get(cid) || { recipients: 0, delivered: 0, opensUnique: 0, clickRate: 0, conversionValue: 0 }
    campAgg.set(cid, {
      recipients: ex.recipients + (Number(stats.recipients) || 0),
      delivered: ex.delivered + (Number(stats.delivered) || 0),
      opensUnique: ex.opensUnique + (Number(stats.opens_unique) || 0),
      clickRate: Number(stats.click_rate) || ex.clickRate,
      conversionValue: ex.conversionValue + (Number(stats.conversion_value) || 0),
    })
  }

  // Aggregate flow metrics by flow_id
  const flowAgg = new Map<string, { recipients: number; delivered: number; opensUnique: number; clickRate: number; conversionValue: number }>()
  for (const r of flowResults) {
    const fid = r.groupings?.flow_id
    if (!fid) continue
    const stats = r.statistics || {}
    const ex = flowAgg.get(fid) || { recipients: 0, delivered: 0, opensUnique: 0, clickRate: 0, conversionValue: 0 }
    flowAgg.set(fid, {
      recipients: ex.recipients + (Number(stats.recipients) || 0),
      delivered: ex.delivered + (Number(stats.delivered) || 0),
      opensUnique: ex.opensUnique + (Number(stats.opens_unique) || 0),
      clickRate: Number(stats.click_rate) || ex.clickRate,
      conversionValue: ex.conversionValue + (Number(stats.conversion_value) || 0),
    })
  }

  // Fetch campaign names from Klaviyo API
  type NameListResp = { data: Array<{ id: string; attributes: { name: string; status?: string; send_time?: string | null } }>; links?: { next?: string } }
  const campNames = new Map<string, { name: string; sendTime: string }>()
  if (campAgg.size > 0) {
    await sleep(MIN_REQUEST_INTERVAL)
    let campPage: string | null = "/campaigns/"
    while (campPage) {
      const resp: NameListResp | null = await klaviyoRequest<NameListResp>(apiKey, campPage)
      if (!resp?.data) break
      for (const c of resp.data) {
        campNames.set(c.id, { name: c.attributes.name, sendTime: c.attributes.send_time || "" })
      }
      campPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (campPage) await sleep(500)
    }
  }

  // Fetch flow names from Klaviyo API
  const flowNames = new Map<string, { name: string; status: string }>()
  if (flowAgg.size > 0) {
    await sleep(MIN_REQUEST_INTERVAL)
    let flowPage: string | null = "/flows/"
    while (flowPage) {
      const resp: NameListResp | null = await klaviyoRequest<NameListResp>(apiKey, flowPage)
      if (!resp?.data) break
      for (const f of resp.data) {
        flowNames.set(f.id, { name: f.attributes.name, status: f.attributes.status || "unknown" })
      }
      flowPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (flowPage) await sleep(500)
    }
  }

  // Build campaign list with names
  let campaignRevenue = 0
  let campaignOpenRateSum = 0
  let campaignClickRateSum = 0
  let campaignCount = 0
  const recentCampaigns: NonNullable<StorePerformance["klaviyo"]>["recentCampaigns"] = []

  for (const [cid, m] of campAgg) {
    campaignRevenue += m.conversionValue
    const openRate = m.delivered > 0 ? (m.opensUnique / m.delivered) * 100 : 0
    if (openRate > 0) { campaignOpenRateSum += openRate; campaignCount++ }
    if (m.clickRate > 0) { campaignClickRateSum += m.clickRate; campaignCount++ }
    const info = campNames.get(cid)
    recentCampaigns.push({
      name: info?.name || `Campaign ${cid.slice(0, 6)}`,
      sendTime: info?.sendTime || "",
      recipients: m.recipients,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: m.clickRate,
      revenue: m.conversionValue,
    })
  }

  recentCampaigns.sort((a, b) => b.revenue - a.revenue)
  const topCampaigns = recentCampaigns.slice(0, 5)

  // Build flow list with names
  let flowRevenue = 0
  const topFlows: NonNullable<StorePerformance["klaviyo"]>["topFlows"] = []

  for (const [fid, m] of flowAgg) {
    flowRevenue += m.conversionValue
    const openRate = m.delivered > 0 ? (m.opensUnique / m.delivered) * 100 : 0
    const info = flowNames.get(fid)
    topFlows.push({
      name: info?.name || `Flow ${fid.slice(0, 6)}`,
      status: info?.status || "live",
      revenue: m.conversionValue,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: m.clickRate,
    })
  }

  topFlows.sort((a, b) => b.revenue - a.revenue)

  const avgOpenRate = campaignCount > 0 ? campaignOpenRateSum / campaignCount : 0
  const avgClickRate = campaignCount > 0 ? campaignClickRateSum / campaignCount : 0

  const attributedRevenue = campaignRevenue + flowRevenue
  const recoveryRate = storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0

  return {
    storeRevenue,
    storeOrders,
    attributedRevenue,
    campaignRevenue,
    flowRevenue,
    recoveryRate,
    totalCampaigns: campaignResults.length,
    sentCampaigns: campaignResults.length,
    totalFlows: flowResults.length,
    liveFlows: flowResults.length,
    avgOpenRate,
    avgClickRate,
    recentCampaigns: topCampaigns,
    topFlows: topFlows.slice(0, 5),
    // TEMP DEBUG - remove after verifying metric-aggregates
    _debugMetricAgg: metricAgg?.data?.attributes || null,
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

interface KlaviyoMetricAggregate {
  data?: {
    attributes?: Record<string, unknown> & {
      data?: Array<{
        measurements?: Record<string, number | number[]>
      }>
    }
  }
}
