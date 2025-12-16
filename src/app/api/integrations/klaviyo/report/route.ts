import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// Helper function to make Klaviyo API requests - BASED ON N8N LOGIC
async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: "GET" | "POST"
    body?: Record<string, unknown>
  }
): Promise<T | null> {
  const { method = "GET", body } = options || {}

  const url = `${KLAVIYO_API_URL}${endpoint}`

  console.log(`[Klaviyo] ${method} ${url}`)
  if (body) {
    console.log(`[Klaviyo] Body:`, JSON.stringify(body, null, 2))
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "revision": KLAVIYO_REVISION,
      },
      ...(body && { body: JSON.stringify(body) }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error(`[Klaviyo] API error ${response.status}:`, responseText)
      return null
    }

    const data = JSON.parse(responseText)
    console.log(`[Klaviyo] Response:`, JSON.stringify(data).substring(0, 500))
    return data
  } catch (error) {
    console.error(`[Klaviyo] Request error:`, error)
    return null
  }
}

// Sleep helper for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Get all metrics to find Placed Order metric ID - BASED ON N8N
async function findPlacedOrderMetric(apiKey: string, startDate: string, endDate: string) {
  console.log("[Klaviyo] Searching for Placed Order metric...")

  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; integration?: { name: string } }
    }>
  }>(apiKey, "/metrics")

  if (!response?.data) {
    console.log("[Klaviyo] No metrics found")
    return null
  }

  const metrics = response.data
  console.log(`[Klaviyo] Total metrics: ${metrics.length}`)

  // Find all "Placed Order" metrics
  const placedOrderMetrics = metrics.filter(m =>
    m.attributes.name === "Placed Order"
  )

  console.log(`[Klaviyo] Found ${placedOrderMetrics.length} Placed Order metrics`)

  if (placedOrderMetrics.length === 0) {
    // Try broader search
    const orderMetric = metrics.find(m =>
      m.attributes.name.toLowerCase().includes("order") ||
      m.attributes.name.toLowerCase().includes("purchase")
    )
    if (orderMetric) {
      console.log(`[Klaviyo] Using fallback metric: ${orderMetric.attributes.name} (${orderMetric.id})`)
      return orderMetric.id
    }
    return null
  }

  if (placedOrderMetrics.length === 1) {
    console.log(`[Klaviyo] Using metric: ${placedOrderMetrics[0].attributes.name} (${placedOrderMetrics[0].id})`)
    return placedOrderMetrics[0].id
  }

  // Multiple metrics - test which one has data (like n8n does)
  console.log("[Klaviyo] Multiple Placed Order metrics found, testing which has data...")

  let bestMetric = placedOrderMetrics[0]
  let maxRevenue = 0

  for (const metric of placedOrderMetrics.slice(0, 3)) {
    const testBody = {
      data: {
        type: "flow-values-report",
        attributes: {
          timeframe: {
            start: `${startDate}T00:00:00Z`,
            end: `${endDate}T23:59:59Z`
          },
          conversion_metric_id: metric.id,
          statistics: ["conversion_value"]
        }
      }
    }

    const testRes = await klaviyoRequest<{
      data: { attributes: { results: Array<{ statistics: { conversion_value?: number } }> } }
    }>(apiKey, "/flow-values-reports/", { method: "POST", body: testBody })

    let total = 0
    if (testRes?.data?.attributes?.results) {
      for (const r of testRes.data.attributes.results) {
        total += r.statistics?.conversion_value || 0
      }
    }

    console.log(`[Klaviyo] Metric ${metric.id} has revenue: ${total}`)

    if (total > maxRevenue) {
      maxRevenue = total
      bestMetric = metric
    }

    await sleep(100)
  }

  console.log(`[Klaviyo] Selected metric with highest revenue: ${bestMetric.id}`)
  return bestMetric.id
}

// Get campaigns in period - BASED ON N8N
async function getCampaignsInPeriod(
  apiKey: string,
  startDate: string,
  endDate: string
) {
  console.log("[Klaviyo] Fetching email campaigns...")

  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        name: string
        status: string
        send_time: string | null
      }
    }>
  }>(apiKey, '/campaigns?filter=equals(messages.channel,"email")')

  if (!response?.data) {
    return []
  }

  const allCampaigns = response.data
  console.log(`[Klaviyo] Total campaigns: ${allCampaigns.length}`)

  const inicio = new Date(startDate)
  const fim = new Date(endDate)
  fim.setHours(23, 59, 59, 999)

  // Filter campaigns by send_time in period
  const campanhasDoPeriodo = allCampaigns.filter(camp => {
    const sendTime = camp.attributes.send_time
    if (!sendTime) return false
    const dataCamp = new Date(sendTime)
    return dataCamp >= inicio && dataCamp <= fim
  })

  console.log(`[Klaviyo] Campaigns in period: ${campanhasDoPeriodo.length}`)

  return campanhasDoPeriodo.map(camp => ({
    id: camp.id,
    name: camp.attributes.name,
    status: camp.attributes.status,
    sendTime: camp.attributes.send_time,
    revenue: 0,
    conversions: 0
  }))
}

// Get revenue for each campaign - BASED ON N8N
async function getCampaignRevenue(
  apiKey: string,
  campaigns: Array<{ id: string; name: string; revenue: number; conversions: number }>,
  metricId: string,
  startDate: string,
  endDate: string
) {
  console.log(`[Klaviyo] Getting revenue for ${campaigns.length} campaigns...`)

  let totalRevenue = 0
  let totalConversions = 0

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i]

    // N8N style request - one campaign at a time
    const valuesBody = {
      data: {
        type: "campaign-values-report",
        attributes: {
          timeframe: {
            start: `${startDate}T00:00:00Z`,
            end: `${endDate}T23:59:59Z`
          },
          conversion_metric_id: metricId,
          filter: `equals(campaign_id,"${campaign.id}")`,
          statistics: ["conversion_value", "conversions"]
        }
      }
    }

    const valuesRes = await klaviyoRequest<{
      data: { attributes: { results: Array<{ statistics: { conversion_value?: number; conversions?: number } }> } }
    }>(apiKey, "/campaign-values-reports/", { method: "POST", body: valuesBody })

    if (valuesRes?.data?.attributes?.results?.[0]) {
      const stats = valuesRes.data.attributes.results[0].statistics
      campaign.revenue = stats.conversion_value || 0
      campaign.conversions = stats.conversions || 0
      totalRevenue += campaign.revenue
      totalConversions += campaign.conversions

      if (campaign.revenue > 0) {
        console.log(`[Klaviyo] Campaign "${campaign.name}": R$ ${campaign.revenue.toFixed(2)} (${campaign.conversions} conv)`)
      }
    }

    // Rate limiting
    if (i < campaigns.length - 1) {
      await sleep(100)
    }
  }

  console.log(`[Klaviyo] Total campaign revenue: R$ ${totalRevenue.toFixed(2)}`)
  return { campaigns, totalRevenue, totalConversions }
}

// Get flows - BASED ON N8N
async function getFlows(apiKey: string) {
  console.log("[Klaviyo] Fetching flows...")

  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        name: string
        status: string
        created: string
      }
    }>
  }>(apiKey, "/flows")

  if (!response?.data) {
    return []
  }

  const flows = response.data
    .filter(f => f.attributes.status === "live" || f.attributes.status === "manual")
    .map(f => ({
      id: f.id,
      name: f.attributes.name,
      status: f.attributes.status,
      revenue: 0,
      conversions: 0
    }))

  console.log(`[Klaviyo] Active flows: ${flows.length}`)
  return flows
}

// Get flow revenue - BASED ON N8N
async function getFlowRevenue(
  apiKey: string,
  flows: Array<{ id: string; name: string; revenue: number; conversions: number }>,
  metricId: string,
  startDate: string,
  endDate: string
) {
  console.log("[Klaviyo] Getting flow revenue...")

  // First get total flow revenue
  const bodyFlowsTotal = {
    data: {
      type: "flow-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00Z`,
          end: `${endDate}T23:59:59Z`
        },
        conversion_metric_id: metricId,
        statistics: ["conversion_value", "conversions", "conversion_uniques"]
      }
    }
  }

  const resFlowsTotal = await klaviyoRequest<{
    data: { attributes: { results: Array<{ statistics: { conversion_value?: number; conversions?: number } }> } }
  }>(apiKey, "/flow-values-reports/", { method: "POST", body: bodyFlowsTotal })

  let totalRevenue = 0
  let totalConversions = 0

  if (resFlowsTotal?.data?.attributes?.results) {
    for (const r of resFlowsTotal.data.attributes.results) {
      totalRevenue += r.statistics?.conversion_value || 0
      totalConversions += r.statistics?.conversions || 0
    }
  }

  console.log(`[Klaviyo] Total flow revenue from API: R$ ${totalRevenue.toFixed(2)} (${totalConversions} conv)`)

  // Get individual flow revenue
  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i]

    const bodyFlowRevenue = {
      data: {
        type: "flow-values-report",
        attributes: {
          timeframe: {
            start: `${startDate}T00:00:00Z`,
            end: `${endDate}T23:59:59Z`
          },
          conversion_metric_id: metricId,
          filter: `equals(flow_id,"${flow.id}")`,
          statistics: ["conversion_value", "conversions"]
        }
      }
    }

    const resFlowRevenue = await klaviyoRequest<{
      data: { attributes: { results: Array<{ statistics: { conversion_value?: number; conversions?: number } }> } }
    }>(apiKey, "/flow-values-reports/", { method: "POST", body: bodyFlowRevenue })

    if (resFlowRevenue?.data?.attributes?.results) {
      for (const r of resFlowRevenue.data.attributes.results) {
        flow.revenue += r.statistics?.conversion_value || 0
        flow.conversions += r.statistics?.conversions || 0
      }
    }

    if (flow.revenue > 0) {
      console.log(`[Klaviyo] Flow "${flow.name}": R$ ${flow.revenue.toFixed(2)} (${flow.conversions} conv)`)
    }

    if (i < flows.length - 1) {
      await sleep(100)
    }
  }

  return { flows, totalRevenue, totalConversions }
}

// Get lists
async function getLists(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; profile_count: number }
    }>
  }>(apiKey, "/lists/")

  if (!response?.data) return { totalLists: 0, totalSubscribers: 0, lists: [] }

  const lists = response.data
  const totalSubscribers = lists.reduce((sum, l) => sum + (l.attributes.profile_count || 0), 0)

  return {
    totalLists: lists.length,
    totalSubscribers,
    lists: lists.map(l => ({
      id: l.id,
      name: l.attributes.name,
      profileCount: l.attributes.profile_count
    })).sort((a, b) => b.profileCount - a.profileCount)
  }
}

// Get account info
async function getAccountInfo(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { preferred_currency: string; locale: string; test_account: boolean }
    }>
  }>(apiKey, "/accounts/")

  if (!response?.data?.[0]) {
    return { currency: "BRL", locale: "pt-BR" }
  }

  return {
    currency: response.data[0].attributes.preferred_currency || "BRL",
    locale: response.data[0].attributes.locale || "pt-BR"
  }
}

// Currency symbols
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    "USD": "$", "EUR": "€", "GBP": "£", "BRL": "R$",
    "AUD": "A$", "CAD": "C$", "JPY": "¥", "CNY": "¥",
  }
  return symbols[currency] || currency
}

// Main GET handler
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400, headers: corsHeaders() })
    }

    // Get store
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("klaviyo_api_key, klaviyo_private_key, store_name, client_id")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        connected: false,
        error: "API Key não configurada",
      }, { headers: corsHeaders() })
    }

    console.log("[Klaviyo] ========== STARTING REPORT ==========")
    console.log("[Klaviyo] Store:", store.store_name)

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
    } else {
      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }
    }

    // Format dates like n8n does (YYYY-MM-DD)
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const startDateStr = formatDate(startDate)
    const endDateStr = formatDate(endDate)

    console.log(`[Klaviyo] Period: ${startDateStr} to ${endDateStr}`)

    // Get account info and lists in parallel
    const [accountInfo, listMetrics] = await Promise.all([
      getAccountInfo(apiKey),
      getLists(apiKey)
    ])

    // Find the correct Placed Order metric ID
    const metricId = await findPlacedOrderMetric(apiKey, startDateStr, endDateStr)

    if (!metricId) {
      console.log("[Klaviyo] No Placed Order metric found - returning empty revenue data")
      return NextResponse.json({
        success: true,
        connected: true,
        storeName: store.store_name,
        error: "Métrica 'Placed Order' não encontrada. Verifique se a integração de e-commerce está configurada no Klaviyo.",
        account: { currency: accountInfo.currency, currencySymbol: getCurrencySymbol(accountInfo.currency) },
        revenue: { totalRevenue: 0, klaviyoAttributedRevenue: 0, campaignRevenue: 0, flowRevenue: 0 },
        overview: { totalSubscribers: listMetrics.totalSubscribers, totalLists: listMetrics.totalLists }
      }, { headers: corsHeaders() })
    }

    // Get campaigns and flows
    const [campaigns, flows] = await Promise.all([
      getCampaignsInPeriod(apiKey, startDateStr, endDateStr),
      getFlows(apiKey)
    ])

    // Get revenue data
    const [campaignData, flowData] = await Promise.all([
      campaigns.length > 0
        ? getCampaignRevenue(apiKey, campaigns, metricId, startDateStr, endDateStr)
        : { campaigns: [], totalRevenue: 0, totalConversions: 0 },
      getFlowRevenue(apiKey, flows, metricId, startDateStr, endDateStr)
    ])

    // Calculate totals
    const totalKlaviyoRevenue = campaignData.totalRevenue + flowData.totalRevenue
    const totalConversions = campaignData.totalConversions + flowData.totalConversions

    console.log("[Klaviyo] ========== FINAL SUMMARY ==========")
    console.log(`[Klaviyo] Total Klaviyo Revenue: R$ ${totalKlaviyoRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] - Campaigns: R$ ${campaignData.totalRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] - Flows: R$ ${flowData.totalRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] Total Conversions: ${totalConversions}`)
    console.log("[Klaviyo] ========================================")

    const reportData = {
      success: true,
      connected: true,
      storeName: store.store_name,
      generatedAt: new Date().toISOString(),
      period,
      dateRange: { start: startDateStr, end: endDateStr },

      account: {
        currency: accountInfo.currency,
        currencySymbol: getCurrencySymbol(accountInfo.currency),
        locale: accountInfo.locale,
      },

      revenue: {
        totalRevenue: totalKlaviyoRevenue,
        klaviyoAttributedRevenue: totalKlaviyoRevenue,
        campaignRevenue: campaignData.totalRevenue,
        flowRevenue: flowData.totalRevenue,
        totalOrders: totalConversions,
        klaviyoAttributedOrders: totalConversions,
        averageOrderValue: totalConversions > 0 ? totalKlaviyoRevenue / totalConversions : 0,
      },

      overview: {
        totalSubscribers: listMetrics.totalSubscribers,
        totalLists: listMetrics.totalLists,
        totalFlows: flows.length,
        totalCampaigns: campaigns.length,
      },

      campaignPerformance: {
        totalRevenue: campaignData.totalRevenue,
        totalConversions: campaignData.totalConversions,
        campaigns: campaignData.campaigns.filter(c => c.revenue > 0).slice(0, 10),
      },

      flowPerformance: {
        totalRevenue: flowData.totalRevenue,
        totalConversions: flowData.totalConversions,
        flows: flowData.flows.filter(f => f.revenue > 0).slice(0, 10),
      },

      lists: listMetrics.lists.slice(0, 10),

      integrations: {
        hasEcommerce: !!metricId,
        placedOrderMetricId: metricId,
      },
    }

    return NextResponse.json(reportData, { headers: corsHeaders() })

  } catch (error) {
    console.error("[Klaviyo] Error generating report:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar relatório" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
