import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { getCache, setCache, getStaleCache } from "@/lib/cache"
import { parseDateRange, formatDateStr, withConcurrencyLimit } from "@/lib/integrations/klaviyo"
import { getShopifyReportForStore } from "@/lib/integrations/shopify/report"
import { decryptStoreCredentials } from "@/lib/crypto"
import {
  fetchKlaviyoPerformance,
  type KlaviyoPerformanceData,
} from "@/lib/services/klaviyo-performance.service"

const log = logger.child("ClientPerformance")

export const maxDuration = 120
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
    const forceRefresh = searchParams.get("force_refresh") === "true"

    // Validate period
    const validPeriods = ["today", "yesterday", "7d", "15d", "30d", "custom"]
    if (!validPeriods.includes(period)) {
      throw new AppError(`Período inválido: ${period}. Use: ${validPeriods.join(", ")}`, 400)
    }

    // Verify user has access to this client (RLS or portal user)
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
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

    // Check cache first
    if (!forceRefresh) {
      const cacheperiod = period === "custom" && customStartDate ? `${period}:${customStartDate}:${customEndDate}` : period
      const cached = await getCache(adminClient, clientId, "client_performance", cacheperiod)
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

      // Fetch Klaviyo data via shared service
      if (hasKlaviyo) {
        try {
          const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
          if (apiKey) {
            klaviyoData = await fetchKlaviyoPerformance(apiKey, period, undefined, customStartDate, customEndDate)

            // If fetch returned data that looks incomplete (e.g., storeRevenue > 0 but
            // no campaigns/flows — likely partial API failure), try stale cache for better data
            if (klaviyoData) {
              const hasRevenue = klaviyoData.storeRevenue > 0 || klaviyoData.attributedRevenue > 0
              const hasCampaignOrFlowData = klaviyoData.recentCampaigns.length > 0 || klaviyoData.topFlows.length > 0 || klaviyoData.attributedRevenue > 0
              if (!hasRevenue || !hasCampaignOrFlowData) {
                const stale = await getStaleCache<KlaviyoPerformanceData>(adminClient, store.id, "klaviyo_perf", period)
                if (stale) {
                  log.info(`[ClientPerf] Using stale cache for store ${store.id} (fresh fetch returned incomplete: revenue=${hasRevenue}, campaigns/flows=${hasCampaignOrFlowData})`)
                  klaviyoData = stale.data
                }
              }
            }
          }
        } catch (err) {
          // On error, try stale cache as fallback before reporting error
          const stale = await getStaleCache<KlaviyoPerformanceData>(adminClient, store.id, "klaviyo_perf", period)
          if (stale) {
            log.info(`[ClientPerf] Using stale cache for store ${store.id} after error`)
            klaviyoData = stale.data
          } else {
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

    // Save to cache only if we have meaningful data (avoid caching incomplete results)
    const hasKlaviyoData = totals.klaviyoRevenue > 0 || totals.campaignRevenue > 0 || totals.flowRevenue > 0
    const hasShopifyData = totals.shopifyRevenue > 0
    if (hasKlaviyoData || hasShopifyData) {
      const cachePeriodKey = period === "custom" && customStartDate ? `${period}:${customStartDate}:${customEndDate}` : period
      setCache(adminClient, clientId, "client_performance", cachePeriodKey, responseData as unknown as Record<string, unknown>).catch(() => {})
    } else {
      log.info("[ClientPerformance] Skipping cache save — no meaningful data (klaviyo or shopify)")
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
