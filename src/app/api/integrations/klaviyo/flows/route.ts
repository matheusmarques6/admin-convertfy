import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
const KLAVIYO_REVISION = "2024-10-15"
const MIN_REQUEST_INTERVAL = 1000

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 16000)
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

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000
        if (attempt < maxRetries) {
          await sleep(waitTime)
          continue
        }
        return null
      }

      if (response.status >= 500 && attempt < maxRetries) {
        continue
      }

      const responseText = await response.text()
      if (!response.ok) {
        console.error(`[Klaviyo Flows] API ERROR ${response.status}:`, responseText.substring(0, 500))
        return null
      }

      return JSON.parse(responseText) as T
    } catch (error) {
      console.error(`[Klaviyo Flows] REQUEST ERROR:`, error)
      if (attempt < maxRetries) continue
      return null
    }
  }

  return null
}

// Get timezone offset string from timezone name
function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    })
    const parts = formatter.formatToParts(now)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')
    if (offsetPart && offsetPart.value.includes('GMT')) {
      const match = offsetPart.value.match(/GMT([+-]\d{2}):?(\d{2})?/)
      if (match) {
        const hours = match[1]
        const minutes = match[2] || '00'
        return `${hours}:${minutes}`
      }
    }
    return "-03:00" // Default to BRT
  } catch {
    return "-03:00"
  }
}

// Get account info
async function getAccountInfo(apiKey: string) {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        preferred_currency: string
        timezone: string
      }
    }>
  }>(apiKey, "/accounts/")

  if (!response?.data?.[0]) {
    return { currency: "BRL", timezone: "America/Sao_Paulo" }
  }

  const attrs = response.data[0].attributes
  return {
    currency: attrs.preferred_currency || "BRL",
    timezone: attrs.timezone || "America/Sao_Paulo"
  }
}

// Get Placed Order metric ID
async function getPlacedOrderMetricId(apiKey: string): Promise<string | null> {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: { name: string; integration?: { name: string } }
    }>
  }>(apiKey, "/metrics/?page[size]=100")

  if (!response?.data) return null

  const placedOrderMetric = response.data.find(m => {
    const name = m.attributes.name.toLowerCase()
    return name === "placed order" || name === "pedido realizado"
  })

  return placedOrderMetric?.id || null
}

// Get all flows with details
async function getAllFlows(apiKey: string) {
  const allFlows: Array<{
    id: string
    name: string
    status: string
    triggerType: string
    created: string
    archived: boolean
  }> = []

  interface FlowListResponse {
    data: Array<{
      id: string
      attributes: {
        name: string
        status: string
        trigger_type: string
        created: string
        archived: boolean
      }
    }>
    links?: { next?: string }
  }

  let nextPage: string | null = "/flows/"

  while (nextPage) {
    const response: FlowListResponse | null = await klaviyoRequest<FlowListResponse>(apiKey, nextPage)

    if (!response?.data) break

    for (const f of response.data) {
      allFlows.push({
        id: f.id,
        name: f.attributes.name,
        status: f.attributes.status,
        triggerType: f.attributes.trigger_type,
        created: f.attributes.created,
        archived: f.attributes.archived
      })
    }

    nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null
    if (nextPage) await sleep(500)
  }

  return allFlows
}

// Get flow metrics from reporting API
async function getFlowMetrics(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string
) {
  const statistics = [
    "average_order_value",
    "bounce_rate",
    "bounced",
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
    "unsubscribe_rate",
    "unsubscribed"
  ]

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
            conversion_rate?: number
            recipients?: number
            delivery_rate?: number
            bounce_rate?: number
            bounced?: number
            open_rate?: number
            click_rate?: number
            click_to_open_rate?: number
            unsubscribe_rate?: number
            unsubscribed?: number
            average_order_value?: number
            revenue_per_recipient?: number
          }
        }>
      }
    }
  }>(apiKey, "/flow-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    return new Map()
  }

  // Aggregate metrics by flow_id
  const flowMetrics = new Map<string, {
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
  }>()

  for (const r of response.data.attributes.results) {
    const flowId = r.groupings.flow_id
    const stats = r.statistics

    const existing = flowMetrics.get(flowId) || {
      recipients: 0,
      delivered: 0,
      deliveryRate: 0,
      opened: 0,
      openRate: 0,
      clicked: 0,
      clickRate: 0,
      clickToOpenRate: 0,
      conversions: 0,
      conversionRate: 0,
      conversionValue: 0,
      revenuePerRecipient: 0,
      averageOrderValue: 0,
      bounced: 0,
      bounceRate: 0,
      unsubscribed: 0,
      unsubscribeRate: 0
    }

    flowMetrics.set(flowId, {
      recipients: existing.recipients + (stats.recipients || 0),
      delivered: existing.delivered + (stats.delivered || 0),
      deliveryRate: stats.delivery_rate || existing.deliveryRate,
      opened: existing.opened + (stats.opens_unique || 0),
      openRate: stats.open_rate || existing.openRate,
      clicked: existing.clicked + (stats.clicks_unique || 0),
      clickRate: stats.click_rate || existing.clickRate,
      clickToOpenRate: stats.click_to_open_rate || existing.clickToOpenRate,
      conversions: existing.conversions + (stats.conversions || 0),
      conversionRate: stats.conversion_rate || existing.conversionRate,
      conversionValue: existing.conversionValue + (stats.conversion_value || 0),
      revenuePerRecipient: stats.revenue_per_recipient || existing.revenuePerRecipient,
      averageOrderValue: stats.average_order_value || existing.averageOrderValue,
      bounced: existing.bounced + (stats.bounced || 0),
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribed: existing.unsubscribed + (stats.unsubscribed || 0),
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  return flowMetrics
}

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
      .select("klaviyo_api_key, klaviyo_private_key, store_name")
      .eq("id", storeId)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    const apiKey = store.klaviyo_private_key || store.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "API Key do Klaviyo não configurada"
      }, { headers: corsHeaders() })
    }

    console.log("[Klaviyo Flows] Starting fetch for store:", store.store_name)

    // Get account info for timezone
    const accountInfo = await getAccountInfo(apiKey)
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)

    // Calculate date range
    const now = new Date()
    let startDate: Date
    let endDate: Date = new Date(now)

    if (period === "custom" && customStartDate && customEndDate) {
      startDate = new Date(customStartDate)
      endDate = new Date(customEndDate)
    } else {
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
          startDate = new Date(now)
          startDate.setFullYear(now.getFullYear() - 1)
          break
        default:
          startDate = new Date(now)
          startDate.setDate(now.getDate() - 30)
      }
    }

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Fetch data in parallel
    const [flows, metricId] = await Promise.all([
      getAllFlows(apiKey),
      getPlacedOrderMetricId(apiKey)
    ])

    // Get metrics if we have the metric ID
    let flowMetrics = new Map()
    if (metricId) {
      flowMetrics = await getFlowMetrics(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
    }

    // Combine flows with their metrics
    const flowsWithMetrics = flows
      .filter(f => !f.archived) // Exclude archived flows
      .map(flow => {
        const metrics = flowMetrics.get(flow.id) || {
          recipients: 0,
          delivered: 0,
          deliveryRate: 0,
          opened: 0,
          openRate: 0,
          clicked: 0,
          clickRate: 0,
          clickToOpenRate: 0,
          conversions: 0,
          conversionRate: 0,
          conversionValue: 0,
          revenuePerRecipient: 0,
          averageOrderValue: 0,
          bounced: 0,
          bounceRate: 0,
          unsubscribed: 0,
          unsubscribeRate: 0
        }

        return {
          id: flow.id,
          name: flow.name,
          status: flow.status,
          triggerType: flow.triggerType,
          created: flow.created,
          ...metrics
        }
      })
      .sort((a, b) => b.conversionValue - a.conversionValue) // Sort by revenue

    // Calculate totals
    const totals = flowsWithMetrics.reduce((acc, flow) => ({
      totalFlows: acc.totalFlows + 1,
      liveFlows: acc.liveFlows + (flow.status === 'live' ? 1 : 0),
      draftFlows: acc.draftFlows + (flow.status === 'draft' ? 1 : 0),
      manualFlows: acc.manualFlows + (flow.status === 'manual' ? 1 : 0),
      totalRecipients: acc.totalRecipients + flow.recipients,
      totalDelivered: acc.totalDelivered + flow.delivered,
      totalOpened: acc.totalOpened + flow.opened,
      totalClicked: acc.totalClicked + flow.clicked,
      totalConversions: acc.totalConversions + flow.conversions,
      totalRevenue: acc.totalRevenue + flow.conversionValue,
      totalBounced: acc.totalBounced + flow.bounced,
      totalUnsubscribed: acc.totalUnsubscribed + flow.unsubscribed
    }), {
      totalFlows: 0,
      liveFlows: 0,
      draftFlows: 0,
      manualFlows: 0,
      totalRecipients: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalConversions: 0,
      totalRevenue: 0,
      totalBounced: 0,
      totalUnsubscribed: 0
    })

    // Calculate average rates
    const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
    const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
    const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0
    const avgBounceRate = totals.totalRecipients > 0 ? (totals.totalBounced / totals.totalRecipients) * 100 : 0

    // Cache metrics in database
    try {
      const { error: upsertError } = await supabase
        .from("klaviyo_flow_metrics")
        .upsert(
          flowsWithMetrics.map(flow => ({
            store_id: storeId,
            flow_id: flow.id,
            flow_name: flow.name,
            flow_status: flow.status,
            trigger_type: flow.triggerType,
            period_start: startDateStr,
            period_end: endDateStr,
            recipients: flow.recipients,
            delivered: flow.delivered,
            delivery_rate: flow.deliveryRate,
            opened: flow.opened,
            open_rate: flow.openRate,
            clicked: flow.clicked,
            click_rate: flow.clickRate,
            click_to_open_rate: flow.clickToOpenRate,
            conversions: flow.conversions,
            conversion_rate: flow.conversionRate,
            conversion_value: flow.conversionValue,
            revenue_per_recipient: flow.revenuePerRecipient,
            average_order_value: flow.averageOrderValue,
            bounced: flow.bounced,
            bounce_rate: flow.bounceRate,
            unsubscribed: flow.unsubscribed,
            unsubscribe_rate: flow.unsubscribeRate,
            fetched_at: new Date().toISOString()
          })),
          { onConflict: 'store_id,flow_id,period_start,period_end' }
        )

      if (upsertError) {
        console.error("[Klaviyo Flows] Error caching metrics:", upsertError)
      }
    } catch (cacheError) {
      console.error("[Klaviyo Flows] Cache error:", cacheError)
    }

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: endDateStr,
        label: period
      },
      currency: accountInfo.currency,
      summary: {
        ...totals,
        avgOpenRate: Math.round(avgOpenRate * 100) / 100,
        avgClickRate: Math.round(avgClickRate * 100) / 100,
        avgConversionRate: Math.round(avgConversionRate * 100) / 100,
        avgBounceRate: Math.round(avgBounceRate * 100) / 100,
        revenuePerRecipient: totals.totalRecipients > 0
          ? Math.round((totals.totalRevenue / totals.totalRecipients) * 100) / 100
          : 0
      },
      flows: flowsWithMetrics
    }, { headers: corsHeaders() })

  } catch (error) {
    console.error("[Klaviyo Flows] Error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar flows"
    }, { status: 500, headers: corsHeaders() })
  }
}
