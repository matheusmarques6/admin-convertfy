import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Latest stable API revision per Klaviyo documentation
// https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy
const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"

// Rate limits per Klaviyo docs:
// - Burst: 1/s for reporting endpoints
// - Steady: 2/m
// https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Klaviyo API request with retry logic for rate limiting
// Based on: https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
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
  const maxRetries = 5

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Wait before request (rate limiting)
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 16000)
      console.log(`[Klaviyo] Retry ${attempt}/${maxRetries} - waiting ${backoff}ms`)
      await sleep(backoff)
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

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000
        console.log(`[Klaviyo] Rate limited. Waiting ${waitTime}ms`)

        if (attempt < maxRetries) {
          await sleep(waitTime)
          continue
        }
        console.error("[Klaviyo] Max retries reached for rate limiting")
        return null
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`[Klaviyo] Server error ${response.status}, retrying...`)
        continue
      }

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`[Klaviyo] API error ${response.status}:`, responseText.substring(0, 300))
        return null
      }

      return JSON.parse(responseText) as T
    } catch (error) {
      console.error(`[Klaviyo] Request error:`, error)
      if (attempt < maxRetries) continue
      return null
    }
  }

  return null
}

// Currency symbols
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    "USD": "$", "EUR": "€", "GBP": "£", "BRL": "R$",
    "AUD": "A$", "CAD": "C$", "JPY": "¥", "MXN": "MX$",
  }
  return symbols[currency] || currency
}

// Get account info
async function getAccountInfo(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        preferred_currency: string
        locale: string
        test_account: boolean
        contact_information: { organization_name: string }
      }
    }>
  }>(apiKey, "/accounts/")

  if (!response?.data?.[0]) {
    return { currency: "BRL", locale: "pt-BR", orgName: "" }
  }

  return {
    currency: response.data[0].attributes.preferred_currency || "BRL",
    locale: response.data[0].attributes.locale || "pt-BR",
    orgName: response.data[0].attributes.contact_information?.organization_name || ""
  }
}

// Get all metrics to find Placed Order metric ID
async function findPlacedOrderMetric(apiKey: string): Promise<string | null> {
  console.log("[Klaviyo] Fetching metrics...")

  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; integration?: { name: string } }
    }>
  }>(apiKey, "/metrics")

  if (!response?.data) return null

  const metrics = response.data
  console.log(`[Klaviyo] Total metrics: ${metrics.length}`)

  // List all metrics for debugging
  metrics.forEach(m => {
    console.log(`[Klaviyo] Metric: ${m.attributes.name} (${m.id}) - Integration: ${m.attributes.integration?.name || 'none'}`)
  })

  // Find "Placed Order" metric - exact match first
  let placedOrderMetric = metrics.find(m => m.attributes.name === "Placed Order")

  // Try variations if not found
  if (!placedOrderMetric) {
    placedOrderMetric = metrics.find(m =>
      m.attributes.name.toLowerCase() === "placed order" ||
      m.attributes.name.toLowerCase() === "order placed" ||
      m.attributes.name.toLowerCase().includes("placed order")
    )
  }

  if (placedOrderMetric) {
    console.log(`[Klaviyo] Using metric: ${placedOrderMetric.attributes.name} (${placedOrderMetric.id})`)
    return placedOrderMetric.id
  }

  console.log("[Klaviyo] No Placed Order metric found")
  return null
}

// Get lists with profile counts
async function getLists(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; profile_count: number; created: string }
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
      profileCount: l.attributes.profile_count || 0,
      created: l.attributes.created
    })).sort((a, b) => b.profileCount - a.profileCount)
  }
}

// Get flows
async function getFlows(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; status: string; created: string; trigger_type: string }
    }>
  }>(apiKey, "/flows")

  if (!response?.data) return []

  return response.data.map(f => ({
    id: f.id,
    name: f.attributes.name,
    status: f.attributes.status,
    triggerType: f.attributes.trigger_type,
    created: f.attributes.created
  }))
}

// Get campaigns - filter by email channel
async function getCampaigns(apiKey: string) {
  // Per Klaviyo docs: filter by email channel
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        name: string
        status: string
        send_time: string | null
        created_at: string
        archived: boolean
      }
    }>
  }>(apiKey, '/campaigns?filter=equals(messages.channel,"email")')

  if (!response?.data) return []

  return response.data.map(c => ({
    id: c.id,
    name: c.attributes.name,
    status: c.attributes.status,
    sendTime: c.attributes.send_time,
    createdAt: c.attributes.created_at,
    archived: c.attributes.archived
  }))
}

// Query Flow Values Report - per Klaviyo Reporting API docs
// https://developers.klaviyo.com/en/reference/reporting_api_overview
async function getFlowValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string
) {
  console.log(`[Klaviyo] Getting flow values report: ${startDate} to ${endDate}`)

  // Valid statistics per Klaviyo Reporting API
  // Note: bounces, unsubscribes, spam_complaints are NOT valid for flow-values-reports
  const statistics = [
    "average_order_value",
    "bounce_rate",
    "click_rate",
    "click_to_open_rate",
    "clicks",
    "clicks_unique",
    "conversion_rate",
    "conversion_uniques",
    "conversion_value",
    "conversions",
    "delivered",
    "delivery_rate",
    "open_rate",
    "opens",
    "opens_unique",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate"
  ]

  // Timeframe format per docs: ISO 8601 with timezone
  // https://developers.klaviyo.com/en/reference/query_flow_values
  const body = {
    data: {
      type: "flow-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00+00:00`,
          end: `${endDate}T23:59:59+00:00`
        },
        conversion_metric_id: metricId,
        statistics
      }
    }
  }

  await sleep(MIN_REQUEST_INTERVAL)

  const response = await klaviyoRequest<{
    data: {
      attributes: {
        results: Array<{
          groupings: {
            flow_id: string
            send_channel: string
            flow_message_id: string
          }
          statistics: {
            delivered?: number
            opens?: number
            opens_unique?: number
            clicks?: number
            clicks_unique?: number
            conversion_value?: number
            conversions?: number
            conversion_uniques?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            open_rate?: number
            click_rate?: number
            unsubscribe_rate?: number
            click_to_open_rate?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/flow-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    console.log("[Klaviyo] No flow results returned")
    return { totalRevenue: 0, totalConversions: 0, flows: [], stats: {} }
  }

  const results = response.data.attributes.results
  console.log(`[Klaviyo] Flow results: ${results.length} entries`)

  // Aggregate by flow_id
  const flowMap = new Map<string, {
    revenue: number
    conversions: number
    delivered: number
    opens: number
    clicks: number
    openRate: number
    clickRate: number
    bounceRate: number
    unsubscribeRate: number
  }>()

  let totalRevenue = 0
  let totalConversions = 0
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let sumBounceRate = 0
  let sumUnsubscribeRate = 0
  let rateCount = 0

  for (const r of results) {
    const flowId = r.groupings.flow_id
    const stats = r.statistics

    totalRevenue += stats.conversion_value || 0
    totalConversions += stats.conversions || 0
    totalDelivered += stats.delivered || 0
    totalOpens += stats.opens_unique || 0
    totalClicks += stats.clicks_unique || 0

    if (stats.bounce_rate !== undefined) {
      sumBounceRate += stats.bounce_rate
      rateCount++
    }
    if (stats.unsubscribe_rate !== undefined) {
      sumUnsubscribeRate += stats.unsubscribe_rate
    }

    const existing = flowMap.get(flowId) || {
      revenue: 0, conversions: 0, delivered: 0, opens: 0, clicks: 0,
      openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0
    }

    flowMap.set(flowId, {
      revenue: existing.revenue + (stats.conversion_value || 0),
      conversions: existing.conversions + (stats.conversions || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      opens: existing.opens + (stats.opens_unique || 0),
      clicks: existing.clicks + (stats.clicks_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clickRate: stats.click_rate || existing.clickRate,
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  console.log(`[Klaviyo] Flow totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

  const avgBounceRate = rateCount > 0 ? sumBounceRate / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? sumUnsubscribeRate / rateCount : 0

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgBounceRate,
    avgUnsubscribeRate,
    flows: Array.from(flowMap.entries()).map(([flowId, stats]) => ({
      flowId,
      ...stats
    })),
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate
    }
  }
}

// Query Campaign Values Report - per Klaviyo Reporting API docs
// https://developers.klaviyo.com/en/reference/query_campaign_values
// Process campaigns individually (any() filter doesn't work for campaign-values-reports)
async function getCampaignValuesReport(
  apiKey: string,
  campaignIds: string[],
  metricId: string,
  startDate: string,
  endDate: string
) {
  if (campaignIds.length === 0) {
    return { totalRevenue: 0, totalConversions: 0, campaigns: [], stats: {} }
  }

  // Limit campaigns to avoid rate limiting - get most recent ones
  const MAX_CAMPAIGNS = 20
  const limitedCampaigns = campaignIds.slice(0, MAX_CAMPAIGNS)

  console.log(`[Klaviyo] Getting campaign values report for ${limitedCampaigns.length} campaigns (limited from ${campaignIds.length})`)

  // Valid statistics per Klaviyo Reporting API
  const statistics = [
    "average_order_value",
    "bounce_rate",
    "click_rate",
    "click_to_open_rate",
    "clicks",
    "clicks_unique",
    "conversion_rate",
    "conversion_uniques",
    "conversion_value",
    "conversions",
    "delivered",
    "delivery_rate",
    "open_rate",
    "opens",
    "opens_unique",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate"
  ]

  let totalRevenue = 0
  let totalConversions = 0
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0
  let sumBounceRate = 0
  let sumUnsubscribeRate = 0
  let rateCount = 0
  const campaignResults: Array<{
    campaignId: string
    revenue: number
    conversions: number
    delivered: number
    opens: number
    clicks: number
    openRate: number
    clickRate: number
  }> = []

  // Process campaigns one at a time with proper rate limiting
  for (let i = 0; i < limitedCampaigns.length; i++) {
    const campaignId = limitedCampaigns[i]

    // Wait between requests to respect rate limits (500ms between each)
    if (i > 0) {
      await sleep(500)
    }

    const body = {
      data: {
        type: "campaign-values-report",
        attributes: {
          timeframe: {
            start: `${startDate}T00:00:00+00:00`,
            end: `${endDate}T23:59:59+00:00`
          },
          conversion_metric_id: metricId,
          filter: `equals(campaign_id,"${campaignId}")`,
          statistics
        }
      }
    }

    const response = await klaviyoRequest<{
      data: {
        attributes: {
          results: Array<{
            groupings?: {
              campaign_id?: string
            }
            statistics: {
              delivered?: number
              opens_unique?: number
              clicks_unique?: number
              conversion_value?: number
              conversions?: number
              bounce_rate?: number
              unsubscribe_rate?: number
              open_rate?: number
              click_rate?: number
            }
          }>
        }
      }
    }>(apiKey, "/campaign-values-reports/", { method: "POST", body })

    if (response?.data?.attributes?.results?.[0]) {
      const stats = response.data.attributes.results[0].statistics
      const revenue = stats.conversion_value || 0
      const conversions = stats.conversions || 0

      totalRevenue += revenue
      totalConversions += conversions
      totalDelivered += stats.delivered || 0
      totalOpens += stats.opens_unique || 0
      totalClicks += stats.clicks_unique || 0

      if (stats.bounce_rate !== undefined) {
        sumBounceRate += stats.bounce_rate
        rateCount++
      }
      if (stats.unsubscribe_rate !== undefined) {
        sumUnsubscribeRate += stats.unsubscribe_rate
      }

      if (revenue > 0 || conversions > 0 || (stats.delivered && stats.delivered > 0)) {
        campaignResults.push({
          campaignId,
          revenue,
          conversions,
          delivered: stats.delivered || 0,
          opens: stats.opens_unique || 0,
          clicks: stats.clicks_unique || 0,
          openRate: stats.open_rate || 0,
          clickRate: stats.click_rate || 0
        })
        console.log(`[Klaviyo] Campaign ${campaignId}: Revenue=${revenue.toFixed(2)}, Conversions=${conversions}`)
      }
    }
  }

  console.log(`[Klaviyo] Campaign totals - Revenue: ${totalRevenue.toFixed(2)}, Conversions: ${totalConversions}`)

  const avgBounceRate = rateCount > 0 ? sumBounceRate / rateCount : 0
  const avgUnsubscribeRate = rateCount > 0 ? sumUnsubscribeRate / rateCount : 0

  return {
    totalRevenue,
    totalConversions,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgBounceRate,
    avgUnsubscribeRate,
    campaigns: campaignResults,
    stats: {
      openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
      clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
      bounceRate: avgBounceRate,
      unsubscribeRate: avgUnsubscribeRate
    }
  }
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
    console.log("[Klaviyo] Period:", period)

    // Calculate date range based on period
    const now = new Date()
    let startDate: Date
    let endDate: Date = new Date(now)

    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
    } else {
      // Set end date to today at end of day
      endDate.setHours(23, 59, 59, 999)

      switch (period) {
        case "7d":
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 7)
          break
        case "30d":
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 30)
          break
        case "90d":
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 90)
          break
        case "12m":
        case "all":
          startDate = new Date(now)
          startDate.setFullYear(now.getFullYear() - 1)
          break
        default:
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 30)
      }
      startDate.setHours(0, 0, 0, 0)
    }

    // Format dates as YYYY-MM-DD (ISO format without time)
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const startDateStr = formatDate(startDate)
    const endDateStr = formatDate(endDate)

    console.log(`[Klaviyo] Date range: ${startDateStr} to ${endDateStr}`)

    // Get account info first
    const accountInfo = await getAccountInfo(apiKey)
    console.log("[Klaviyo] Account currency:", accountInfo.currency)

    // Find Placed Order metric
    const metricId = await findPlacedOrderMetric(apiKey)

    if (!metricId) {
      // Return basic data without revenue
      const [listMetrics, allFlows, allCampaigns] = await Promise.all([
        getLists(apiKey),
        getFlows(apiKey),
        getCampaigns(apiKey)
      ])

      return NextResponse.json({
        success: true,
        connected: true,
        storeName: store.store_name,
        generatedAt: new Date().toISOString(),
        period,
        dateRange: { start: startDateStr, end: endDateStr },
        warning: "Métrica 'Placed Order' não encontrada. Configure a integração de e-commerce no Klaviyo.",
        account: {
          currency: accountInfo.currency,
          currencySymbol: getCurrencySymbol(accountInfo.currency),
          locale: accountInfo.locale,
        },
        revenue: {
          totalRevenue: 0,
          klaviyoAttributedRevenue: 0,
          campaignRevenue: 0,
          flowRevenue: 0,
          totalOrders: 0,
        },
        overview: {
          totalSubscribers: listMetrics.totalSubscribers,
          totalLists: listMetrics.totalLists,
          totalFlows: allFlows.length,
          liveFlows: allFlows.filter(f => f.status === "live").length,
          totalCampaigns: allCampaigns.length,
          sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
        },
        lists: listMetrics.lists.slice(0, 10),
        flows: allFlows.slice(0, 10),
        campaigns: allCampaigns.filter(c => c.status === "sent").slice(0, 10),
        integrations: { hasEcommerce: false }
      }, { headers: corsHeaders() })
    }

    // Get all data
    const [listMetrics, allFlows, allCampaigns] = await Promise.all([
      getLists(apiKey),
      getFlows(apiKey),
      getCampaigns(apiKey)
    ])

    // Filter campaigns by send_time in period
    const inicio = new Date(startDateStr)
    const fim = new Date(endDateStr)
    fim.setHours(23, 59, 59, 999)

    const campaignsInPeriod = allCampaigns.filter(c => {
      if (!c.sendTime) return false
      const sendDate = new Date(c.sendTime)
      return sendDate >= inicio && sendDate <= fim
    })

    console.log(`[Klaviyo] Campaigns in period: ${campaignsInPeriod.length} of ${allCampaigns.length}`)

    // Get reporting data
    const [flowReport, campaignReport] = await Promise.all([
      getFlowValuesReport(apiKey, metricId, startDateStr, endDateStr),
      getCampaignValuesReport(apiKey, campaignsInPeriod.map(c => c.id), metricId, startDateStr, endDateStr)
    ])

    // Merge flow data with names
    const flowsWithNames = flowReport.flows.map(fr => {
      const flowInfo = allFlows.find(f => f.id === fr.flowId)
      return {
        ...fr,
        name: flowInfo?.name || "Unknown Flow",
        status: flowInfo?.status || "unknown"
      }
    }).filter(f => f.revenue > 0 || f.delivered > 0)

    // Merge campaign data with names
    const campaignsWithNames = campaignReport.campaigns.map(cr => {
      const campInfo = campaignsInPeriod.find(c => c.id === cr.campaignId)
      return {
        ...cr,
        name: campInfo?.name || "Unknown Campaign",
        sendTime: campInfo?.sendTime
      }
    })

    // Calculate totals
    const totalKlaviyoRevenue = flowReport.totalRevenue + campaignReport.totalRevenue
    const totalConversions = flowReport.totalConversions + campaignReport.totalConversions
    const totalDelivered = (flowReport.totalDelivered || 0) + (campaignReport.totalDelivered || 0)
    const totalOpens = (flowReport.totalOpens || 0) + (campaignReport.totalOpens || 0)
    const totalClicks = (flowReport.totalClicks || 0) + (campaignReport.totalClicks || 0)
    const avgBounceRate = ((flowReport.avgBounceRate || 0) + (campaignReport.avgBounceRate || 0)) / 2
    const avgUnsubscribeRate = ((flowReport.avgUnsubscribeRate || 0) + (campaignReport.avgUnsubscribeRate || 0)) / 2

    console.log("[Klaviyo] ========== FINAL SUMMARY ==========")
    console.log(`[Klaviyo] Total Klaviyo Revenue: ${accountInfo.currency} ${totalKlaviyoRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] - Campaigns: ${accountInfo.currency} ${campaignReport.totalRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] - Flows: ${accountInfo.currency} ${flowReport.totalRevenue.toFixed(2)}`)
    console.log(`[Klaviyo] Total Conversions: ${totalConversions}`)
    console.log(`[Klaviyo] Total Delivered: ${totalDelivered}`)
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
        campaignRevenue: campaignReport.totalRevenue,
        flowRevenue: flowReport.totalRevenue,
        totalOrders: totalConversions,
        klaviyoAttributedOrders: totalConversions,
        averageOrderValue: totalConversions > 0 ? totalKlaviyoRevenue / totalConversions : 0,
      },

      emailPerformance: {
        delivered: totalDelivered,
        opened: totalOpens,
        clicked: totalClicks,
        bounceRate: avgBounceRate,
        unsubscribeRate: avgUnsubscribeRate,
        openRate: totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0,
        clickRate: totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0,
        clickToOpenRate: totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0,
      },

      overview: {
        totalSubscribers: listMetrics.totalSubscribers,
        totalLists: listMetrics.totalLists,
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === "live").length,
        totalCampaigns: allCampaigns.length,
        sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
        campaignsInPeriod: campaignsInPeriod.length,
      },

      campaignPerformance: {
        totalRevenue: campaignReport.totalRevenue,
        totalConversions: campaignReport.totalConversions,
        totalDelivered: campaignReport.totalDelivered,
        avgOpenRate: campaignReport.stats.openRate || 0,
        avgClickRate: campaignReport.stats.clickRate || 0,
        campaigns: campaignsWithNames.sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      },

      flowPerformance: {
        totalRevenue: flowReport.totalRevenue,
        totalConversions: flowReport.totalConversions,
        totalDelivered: flowReport.totalDelivered,
        avgOpenRate: flowReport.stats.openRate || 0,
        avgClickRate: flowReport.stats.clickRate || 0,
        flows: flowsWithNames.sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      },

      lists: listMetrics.lists.slice(0, 10),

      flows: allFlows.map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        triggerType: f.triggerType
      })).slice(0, 20),

      campaigns: campaignsInPeriod.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        sendTime: c.sendTime
      })).slice(0, 20),

      integrations: {
        hasEcommerce: true,
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
