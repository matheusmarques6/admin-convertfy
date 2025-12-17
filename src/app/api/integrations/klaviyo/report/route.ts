import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Vercel serverless function configuration
// Extended timeout to allow fetching all Klaviyo data
export const maxDuration = 300 // 5 minutes (Pro plan limit)
export const dynamic = 'force-dynamic'

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

// Get account info including timezone
async function getAccountInfo(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        preferred_currency: string
        locale: string
        timezone: string
        test_account: boolean
        contact_information: { organization_name: string }
      }
    }>
  }>(apiKey, "/accounts/")

  if (!response?.data?.[0]) {
    return { currency: "BRL", locale: "pt-BR", orgName: "", timezone: "America/Sao_Paulo" }
  }

  const attrs = response.data[0].attributes
  console.log(`[Klaviyo] Account timezone: ${attrs.timezone}`)

  return {
    currency: attrs.preferred_currency || "BRL",
    locale: attrs.locale || "pt-BR",
    orgName: attrs.contact_information?.organization_name || "",
    timezone: attrs.timezone || "America/Sao_Paulo"
  }
}

// Convert timezone to UTC offset string (e.g., "America/Sao_Paulo" -> "-03:00")
function getTimezoneOffset(timezone: string): string {
  try {
    // Create a date and format it with the timezone to get the offset
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    })
    const parts = formatter.formatToParts(now)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')

    if (offsetPart?.value) {
      // Convert "GMT-3" to "-03:00" format
      const match = offsetPart.value.match(/GMT([+-])(\d+)/)
      if (match) {
        const sign = match[1]
        const hours = match[2].padStart(2, '0')
        return `${sign}${hours}:00`
      }
    }
  } catch {
    console.log(`[Klaviyo] Error parsing timezone ${timezone}, using UTC`)
  }
  return "+00:00"
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

// Types for paginated responses
type ListsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; profile_count: number; created: string }
  }>
  links?: { next?: string }
}

type FlowsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; status: string; created: string; trigger_type: string }
  }>
  links?: { next?: string }
}

type CampaignsResponse = {
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
  links?: { next?: string }
}

// Get ALL lists with profile counts and pagination
async function getLists(apiKey: string) {
  const allLists: Array<{
    id: string
    name: string
    profileCount: number
    created: string
  }> = []

  let nextPage: string | null = "/lists/?page[size]=100"

  while (nextPage) {
    const response: ListsResponse | null = await klaviyoRequest<ListsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const l of response.data) {
      allLists.push({
        id: l.id,
        name: l.attributes.name,
        profileCount: l.attributes.profile_count || 0,
        created: l.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  const totalSubscribers = allLists.reduce((sum, l) => sum + l.profileCount, 0)

  console.log(`[Klaviyo] Fetched ${allLists.length} total lists with ${totalSubscribers} subscribers`)

  return {
    totalLists: allLists.length,
    totalSubscribers,
    lists: allLists.sort((a, b) => b.profileCount - a.profileCount)
  }
}

// Get ALL flows with pagination
async function getFlows(apiKey: string) {
  const allFlows: Array<{
    id: string
    name: string
    status: string
    triggerType: string
    created: string
  }> = []

  let nextPage: string | null = "/flows?page[size]=100"

  while (nextPage) {
    const response: FlowsResponse | null = await klaviyoRequest<FlowsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const f of response.data) {
      allFlows.push({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  console.log(`[Klaviyo] Fetched ${allFlows.length} total flows`)
  return allFlows
}

// Get ALL segments with profile counts
type SegmentsResponse = {
  data: Array<{
    id: string
    attributes: { name: string; profile_count: number; created: string; is_active: boolean; is_starred: boolean }
  }>
  links?: { next?: string }
}

async function getSegments(apiKey: string) {
  const allSegments: Array<{
    id: string
    name: string
    profileCount: number
    isActive: boolean
    isStarred: boolean
    created: string
  }> = []

  let nextPage: string | null = "/segments/?page[size]=100"

  while (nextPage) {
    const response: SegmentsResponse | null = await klaviyoRequest<SegmentsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const s of response.data) {
      allSegments.push({
        id: s.id,
        name: s.attributes.name,
        profileCount: s.attributes.profile_count || 0,
        isActive: s.attributes.is_active,
        isStarred: s.attributes.is_starred,
        created: s.attributes.created
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  console.log(`[Klaviyo] Fetched ${allSegments.length} total segments`)

  // Find engaged 90d segment (common naming patterns)
  const engaged90dSegment = allSegments.find(s => {
    const nameLower = s.name.toLowerCase()
    return nameLower.includes('engajado') ||
           nameLower.includes('engaged') ||
           nameLower.includes('90d') ||
           nameLower.includes('90 dias') ||
           nameLower.includes('ativos')
  })

  return {
    totalSegments: allSegments.length,
    segments: allSegments.sort((a, b) => b.profileCount - a.profileCount),
    engaged90dProfiles: engaged90dSegment?.profileCount || 0,
    engaged90dSegmentName: engaged90dSegment?.name || null
  }
}

// Get ALL campaigns with pagination - filter by email channel
async function getCampaigns(apiKey: string) {
  const allCampaigns: Array<{
    id: string
    name: string
    status: string
    sendTime: string | null
    createdAt: string
    archived: boolean
  }> = []

  // Per Klaviyo docs: filter by email channel with pagination
  let nextPage: string | null = '/campaigns?filter=equals(messages.channel,"email")&page[size]=100'

  while (nextPage) {
    const response: CampaignsResponse | null = await klaviyoRequest<CampaignsResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const c of response.data) {
      allCampaigns.push({
        id: c.id,
        name: c.attributes.name,
        status: c.attributes.status,
        sendTime: c.attributes.send_time,
        createdAt: c.attributes.created_at,
        archived: c.attributes.archived
      })
    }

    // Get next page URL if exists
    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null

    // Rate limit between pages
    if (nextPage) await sleep(500)
  }

  console.log(`[Klaviyo] Fetched ${allCampaigns.length} total campaigns`)
  return allCampaigns
}

// Query Flow Values Report - per Klaviyo Reporting API docs
// https://developers.klaviyo.com/en/reference/reporting_api_overview
async function getFlowValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = "+00:00"
) {
  console.log(`[Klaviyo] Getting flow values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

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
  // Use account timezone to match Klaviyo dashboard
  // https://developers.klaviyo.com/en/reference/query_flow_values
  const body = {
    data: {
      type: "flow-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
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
// Query ALL campaigns at once (like flows) for better accuracy
async function getCampaignValuesReport(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string = "+00:00"
) {
  console.log(`[Klaviyo] Getting campaign values report: ${startDate} to ${endDate} (timezone: ${timezoneOffset})`)

  // Use same statistics as flows for consistency
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

  // Query ALL campaigns at once (no filter) - same approach as flows
  // Use account timezone to match Klaviyo dashboard
  const body = {
    data: {
      type: "campaign-values-report",
      attributes: {
        timeframe: {
          start: `${startDate}T00:00:00${timezoneOffset}`,
          end: `${endDate}T23:59:59${timezoneOffset}`
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
            campaign_id: string
            send_channel: string
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
  }>(apiKey, "/campaign-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    console.log("[Klaviyo] No campaign results returned")
    return { totalRevenue: 0, totalConversions: 0, campaigns: [], stats: {} }
  }

  const results = response.data.attributes.results
  console.log(`[Klaviyo] Campaign results: ${results.length} entries`)

  // Aggregate by campaign_id
  const campaignMap = new Map<string, {
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
    const campaignId = r.groupings.campaign_id
    const stats = r.statistics

    console.log(`[Klaviyo] Campaign ${campaignId}: conversion_value=${stats.conversion_value}, delivered=${stats.delivered}`)

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

    const existing = campaignMap.get(campaignId) || {
      revenue: 0, conversions: 0, delivered: 0, opens: 0, clicks: 0,
      openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0
    }

    campaignMap.set(campaignId, {
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
    campaigns: Array.from(campaignMap.entries()).map(([campaignId, stats]) => ({
      campaignId,
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
      const [listMetrics, segmentMetrics, allFlows, allCampaigns] = await Promise.all([
        getLists(apiKey),
        getSegments(apiKey),
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
          totalSegments: segmentMetrics.totalSegments,
          totalFlows: allFlows.length,
          liveFlows: allFlows.filter(f => f.status === "live").length,
          totalCampaigns: allCampaigns.length,
          sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
          totalTemplates: 0,
        },
        engagement: {
          engagedProfiles: segmentMetrics.engaged90dProfiles,
          engagementRate: listMetrics.totalSubscribers > 0
            ? ((segmentMetrics.engaged90dProfiles / listMetrics.totalSubscribers) * 100).toFixed(1)
            : "0",
          engaged90dSegmentName: segmentMetrics.engaged90dSegmentName,
        },
        automation: {
          totalFlows: allFlows.length,
          liveFlows: allFlows.filter(f => f.status === "live").length,
          draftFlows: allFlows.filter(f => f.status === "draft").length,
          automationCoverage: allFlows.length > 0
            ? ((allFlows.filter(f => f.status === "live").length / allFlows.length) * 100).toFixed(0)
            : "0",
        },
        lists: listMetrics.lists, // ALL lists
        segments: segmentMetrics.segments, // ALL segments
        flows: allFlows, // ALL flows
        campaigns: allCampaigns.filter(c => c.status === "sent"), // ALL sent campaigns
        integrations: { hasEcommerce: false }
      }, { headers: corsHeaders() })
    }

    // Get all data
    const [listMetrics, segmentMetrics, allFlows, allCampaigns] = await Promise.all([
      getLists(apiKey),
      getSegments(apiKey),
      getFlows(apiKey),
      getCampaigns(apiKey)
    ])

    // Filter campaigns by send_time in period
    const inicio = new Date(startDateStr)
    const fim = new Date(endDateStr)
    fim.setHours(23, 59, 59, 999)

    console.log(`[Klaviyo] Total campaigns fetched: ${allCampaigns.length}`)
    console.log(`[Klaviyo] Filtering for period: ${inicio.toISOString()} to ${fim.toISOString()}`)

    // Log all campaigns with send times for debugging
    const sentCampaigns = allCampaigns.filter(c => c.status === "sent")
    console.log(`[Klaviyo] Sent campaigns: ${sentCampaigns.length}`)
    sentCampaigns.forEach(c => {
      console.log(`[Klaviyo] Campaign: ${c.name} | sendTime: ${c.sendTime} | status: ${c.status}`)
    })

    const campaignsInPeriod = allCampaigns.filter(c => {
      if (!c.sendTime) {
        console.log(`[Klaviyo] Campaign "${c.name}" has no sendTime, skipping`)
        return false
      }
      const sendDate = new Date(c.sendTime)
      const isInPeriod = sendDate >= inicio && sendDate <= fim
      if (!isInPeriod) {
        console.log(`[Klaviyo] Campaign "${c.name}" sendTime ${c.sendTime} is outside period`)
      }
      return isInPeriod
    })

    console.log(`[Klaviyo] Campaigns in period: ${campaignsInPeriod.length} of ${allCampaigns.length} total`)
    campaignsInPeriod.forEach(c => {
      console.log(`[Klaviyo] -> Campaign in period: ${c.name} (${c.id}) | sendTime: ${c.sendTime}`)
    })

    // Get timezone offset from account settings to match Klaviyo dashboard
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    console.log(`[Klaviyo] Using timezone offset: ${timezoneOffset} (from ${accountInfo.timezone})`)

    // Get reporting data - query ALL flows and campaigns at once (no filtering)
    // This matches Klaviyo dashboard behavior for the selected period
    const [flowReport, campaignReport] = await Promise.all([
      getFlowValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset),
      getCampaignValuesReport(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
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

    // Merge campaign data with names (search ALL campaigns, not just filtered)
    const campaignsWithNames = campaignReport.campaigns.map(cr => {
      const campInfo = allCampaigns.find(c => c.id === cr.campaignId)
      return {
        ...cr,
        name: campInfo?.name || "Unknown Campaign",
        sendTime: campInfo?.sendTime
      }
    }).filter(c => c.revenue > 0 || c.delivered > 0)

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
        totalSegments: segmentMetrics.totalSegments,
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === "live").length,
        totalCampaigns: allCampaigns.length,
        sentCampaigns: allCampaigns.filter(c => c.status === "sent").length,
        campaignsInPeriod: campaignsInPeriod.length,
        totalTemplates: 0, // Templates not fetched currently
      },

      // Engagement data - uses segment data for accurate counts
      engagement: {
        engagedProfiles: segmentMetrics.engaged90dProfiles,
        engagementRate: listMetrics.totalSubscribers > 0
          ? ((segmentMetrics.engaged90dProfiles / listMetrics.totalSubscribers) * 100).toFixed(1)
          : "0",
        engaged90dSegmentName: segmentMetrics.engaged90dSegmentName,
      },

      // Automation data
      automation: {
        totalFlows: allFlows.length,
        liveFlows: allFlows.filter(f => f.status === "live").length,
        draftFlows: allFlows.filter(f => f.status === "draft").length,
        automationCoverage: allFlows.length > 0
          ? ((allFlows.filter(f => f.status === "live").length / allFlows.length) * 100).toFixed(0)
          : "0",
      },

      // Growth metrics
      growth: {
        campaignsLast30Days: campaignsInPeriod.length,
      },

      campaignPerformance: {
        totalRevenue: campaignReport.totalRevenue,
        totalConversions: campaignReport.totalConversions,
        totalDelivered: campaignReport.totalDelivered,
        avgOpenRate: campaignReport.stats.openRate || 0,
        avgClickRate: campaignReport.stats.clickRate || 0,
        campaigns: campaignsWithNames.sort((a, b) => b.revenue - a.revenue), // ALL campaigns
      },

      flowPerformance: {
        totalRevenue: flowReport.totalRevenue,
        totalConversions: flowReport.totalConversions,
        totalDelivered: flowReport.totalDelivered,
        avgOpenRate: flowReport.stats.openRate || 0,
        avgClickRate: flowReport.stats.clickRate || 0,
        flows: flowsWithNames.sort((a, b) => b.revenue - a.revenue), // ALL flows
      },

      lists: listMetrics.lists, // ALL lists

      // ALL segments with profile counts
      segments: segmentMetrics.segments,

      // Flows with counts and details for frontend
      flows: allFlows.map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        triggerType: f.triggerType
      })),

      // Campaigns with counts and details for frontend (structure expected by UI)
      campaigns: {
        total: allCampaigns.length,
        sent: allCampaigns.filter(c => c.status === "sent").length,
        scheduled: allCampaigns.filter(c => c.status === "scheduled").length,
        drafts: allCampaigns.filter(c => c.status === "draft").length,
        // Recent campaigns with performance data (sorted by revenue, includes all with data)
        recentCampaigns: campaignsWithNames.map(c => ({
          id: c.campaignId,
          name: c.name,
          status: "sent",
          sendTime: c.sendTime,
          revenue: c.revenue,
          delivered: c.delivered,
          opens: c.opens,
          clicks: c.clicks,
          openRate: c.openRate,
          clickRate: c.clickRate
        })).sort((a, b) => b.revenue - a.revenue),
        // Also include campaigns in period without revenue data
        allInPeriod: campaignsInPeriod.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status,
          sendTime: c.sendTime
        }))
      },

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
