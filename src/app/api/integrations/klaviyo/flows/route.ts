import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoFlows")
import {
  KLAVIYO_API_URL,
  MIN_REQUEST_INTERVAL,
  sleep,
  klaviyoRequest,
  parseDateRange,
  formatDateStr,
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import type { SupabaseClient } from "@supabase/supabase-js"

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Cache-first configuration
const CACHED_PERIODS = new Set(["7d", "15d", "30d", "90d"])
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours (aligned with cron interval)

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
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
  // Valid statistics per Klaviyo Reporting API (revision 2024-10-15)
  // IMPORTANT: API uses "opens"/"clicks" (NOT "opened"/"clicked")
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
    "opens",
    "opens_unique",
    "recipients",
    "revenue_per_recipient",
    "unsubscribe_rate",
    "unsubscribes"
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
            click_rate?: number
            click_to_open_rate?: number
            unsubscribe_rate?: number
            unsubscribes?: number
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

    const newDelivered = existing.delivered + (stats.delivered || 0)
    const newOpened = existing.opened + (stats.opens_unique || 0)
    const newClicked = existing.clicked + (stats.clicks_unique || 0)
    const calculatedOpenRate = newDelivered > 0 ? (newOpened / newDelivered) * 100 : 0
    const calculatedClickRate = newDelivered > 0 ? (newClicked / newDelivered) * 100 : 0

    flowMetrics.set(flowId, {
      recipients: existing.recipients + (stats.recipients || 0),
      delivered: newDelivered,
      deliveryRate: stats.delivery_rate || existing.deliveryRate,
      opened: newOpened,
      openRate: calculatedOpenRate,
      clicked: newClicked,
      clickRate: calculatedClickRate,
      clickToOpenRate: stats.click_to_open_rate || existing.clickToOpenRate,
      conversions: existing.conversions + (stats.conversions || 0),
      conversionRate: stats.conversion_rate || existing.conversionRate,
      conversionValue: existing.conversionValue + (stats.conversion_value || 0),
      revenuePerRecipient: stats.revenue_per_recipient || existing.revenuePerRecipient,
      averageOrderValue: stats.average_order_value || existing.averageOrderValue,
      bounced: existing.bounced + (stats.bounced || 0),
      bounceRate: stats.bounce_rate || existing.bounceRate,
      unsubscribed: existing.unsubscribed + (stats.unsubscribes || 0),
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate
    })
  }

  return flowMetrics
}

// Read flows from cache (klaviyo_flow_metrics table)
async function readFlowsFromCache(
  storeId: string,
  periodStart: string,
  periodEnd: string,
  supabase: SupabaseClient
) {
  const { data: rows, error } = await supabase
    .from("klaviyo_flow_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .order("fetched_at", { ascending: false })

  if (error || !rows || rows.length === 0) return null

  // Check freshness: if newest row is older than threshold, cache is stale
  const latestFetchedAt = new Date(rows[0].fetched_at)
  if (Date.now() - latestFetchedAt.getTime() > CACHE_MAX_AGE_MS) return null

  // Map cached rows to response format (exclude archived)
  const flows = rows
    .filter((r: Record<string, unknown>) => r.flow_status !== "archived")
    .map((r: Record<string, unknown>) => ({
      id: r.flow_id as string,
      name: r.flow_name as string,
      status: r.flow_status as string,
      triggerType: r.trigger_type as string,
      created: "", // not stored in cache
      recipients: (r.recipients as number) || 0,
      delivered: (r.delivered as number) || 0,
      deliveryRate: (r.delivery_rate as number) || 0,
      opened: (r.opened as number) || 0,
      openRate: (r.open_rate as number) || 0,
      clicked: (r.clicked as number) || 0,
      clickRate: (r.click_rate as number) || 0,
      clickToOpenRate: (r.click_to_open_rate as number) || 0,
      conversions: (r.conversions as number) || 0,
      conversionRate: (r.conversion_rate as number) || 0,
      conversionValue: (r.conversion_value as number) || 0,
      revenuePerRecipient: (r.revenue_per_recipient as number) || 0,
      averageOrderValue: (r.average_order_value as number) || 0,
      bounced: (r.bounced as number) || 0,
      bounceRate: (r.bounce_rate as number) || 0,
      unsubscribed: (r.unsubscribed as number) || 0,
      unsubscribeRate: (r.unsubscribe_rate as number) || 0,
      revenue: (r.conversion_value as number) || 0,
    }))
    .sort((a: { conversionValue: number }, b: { conversionValue: number }) => b.conversionValue - a.conversionValue)

  // Calculate summary totals
  const totals = flows.reduce(
    (acc: Record<string, number>, flow: Record<string, unknown>) => ({
      totalFlows: acc.totalFlows + 1,
      liveFlows: acc.liveFlows + (flow.status === "live" ? 1 : 0),
      draftFlows: acc.draftFlows + (flow.status === "draft" ? 1 : 0),
      manualFlows: acc.manualFlows + (flow.status === "manual" ? 1 : 0),
      totalRecipients: acc.totalRecipients + (flow.recipients as number),
      totalDelivered: acc.totalDelivered + (flow.delivered as number),
      totalOpened: acc.totalOpened + (flow.opened as number),
      totalClicked: acc.totalClicked + (flow.clicked as number),
      totalConversions: acc.totalConversions + (flow.conversions as number),
      totalRevenue: acc.totalRevenue + (flow.conversionValue as number),
      totalBounced: acc.totalBounced + (flow.bounced as number),
      totalUnsubscribed: acc.totalUnsubscribed + (flow.unsubscribed as number),
    }),
    {
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
      totalUnsubscribed: 0,
    }
  )

  const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
  const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
  const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0
  const avgBounceRate = totals.totalRecipients > 0 ? (totals.totalBounced / totals.totalRecipients) * 100 : 0

  return {
    fetchedAt: rows[0].fetched_at as string,
    summary: {
      ...totals,
      avgOpenRate: Math.round(avgOpenRate * 100) / 100,
      avgClickRate: Math.round(avgClickRate * 100) / 100,
      avgConversionRate: Math.round(avgConversionRate * 100) / 100,
      avgBounceRate: Math.round(avgBounceRate * 100) / 100,
      revenuePerRecipient: totals.totalRecipients > 0
        ? Math.round((totals.totalRevenue / totals.totalRecipients) * 100) / 100
        : 0,
    },
    flows,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")
    const forceRefresh = searchParams.get("force_refresh") === "true"

    if (!storeId) {
      return NextResponse.json({ error: "store_id é obrigatório" }, { status: 400, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Validate user has access to this store (multi-tenant isolation)
    const store = await requireStoreAccess(storeId, user.id)

    // Get decrypted credentials via credentials service
    const credentials = await getStoreCredentials(storeId)
    const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "API Key do Klaviyo não configurada"
      }, { headers: corsHeaders(request.headers.get("origin")) })
    }

    // Calculate date range
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Convert date strings to ISO timestamps to match cron-written cache format
    const periodStartISO = new Date(`${startDateStr}T00:00:00Z`).toISOString()
    const periodEndISO = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()

    // Cache-first: try reading from cache for standard periods
    const isCustomPeriod = period === "custom" || !CACHED_PERIODS.has(period)
    if (!forceRefresh && !isCustomPeriod) {
      try {
        const adminClient = createAdminClient()
        const cached = await readFlowsFromCache(storeId, periodStartISO, periodEndISO, adminClient)
        if (cached) {
          // Resolve currency from store_revenue_summary (already synced by cron)
          let cachedCurrency = "BRL"
          try {
            const { data: summaryRow } = await adminClient
              .from("store_revenue_summary")
              .select("currency")
              .eq("store_id", storeId)
              .limit(1)
              .single()
            if (summaryRow?.currency) cachedCurrency = summaryRow.currency
          } catch { /* fallback to BRL */ }

          log.info(`[Klaviyo Flows] Serving from cache for store: ${store.storeName} period: ${period}`)
          return NextResponse.json({
            success: true,
            period: {
              start: startDateStr,
              end: endDateStr,
              label: period,
            },
            fromCache: true,
            fetchedAt: cached.fetchedAt,
            currency: cachedCurrency,
            summary: cached.summary,
            flows: cached.flows,
          }, { headers: corsHeaders(request.headers.get("origin")) })
        }
      } catch (cacheReadError) {
        log.error("[Klaviyo Flows] Cache read error, falling through to live fetch:", cacheReadError)
      }
    }

    log.info("[Klaviyo Flows] Starting live fetch for store:", store.storeName)

    // Get account info for timezone
    const accountInfo = await getCachedAccountInfo(apiKey, store.orgId, store.storeId)
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)

    // Fetch data sequentially to avoid Klaviyo rate limiting
    const flows = await getAllFlows(apiKey)
    await sleep(350)
    const metricId = await getCachedPlacedOrderMetric(apiKey, store.orgId, store.storeId)

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
          ...metrics,
          revenue: metrics.conversionValue,
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
      const adminClient = createAdminClient()
      const { error: upsertError } = await adminClient
        .from("klaviyo_flow_metrics")
        .upsert(
          flowsWithMetrics.map(flow => ({
            store_id: storeId,
            flow_id: flow.id,
            flow_name: flow.name,
            flow_status: flow.status,
            trigger_type: flow.triggerType,
            period_start: periodStartISO,
            period_end: periodEndISO,
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
        log.error("[Klaviyo Flows] Error caching metrics:", upsertError)
      }
    } catch (cacheError) {
      log.error("[Klaviyo Flows] Cache error:", cacheError)
    }

    return NextResponse.json({
      success: true,
      period: {
        start: startDateStr,
        end: endDateStr,
        label: period
      },
      fromCache: false,
      fetchedAt: new Date().toISOString(),
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
    }, { headers: corsHeaders(request.headers.get("origin")) })

  } catch (error) {
    const origin = request.headers.get("origin")
    if (error instanceof KlaviyoPermissionError) {
      return NextResponse.json(
        { success: false, error: `Permissão negada no Klaviyo. Scopes ausentes: ${error.missingScopes.join(", ")}`, code: "KLAVIYO_PERMISSION_ERROR" },
        { status: 403, headers: corsHeaders(origin) }
      )
    }
    if (error instanceof KlaviyoInvalidKeyError) {
      return NextResponse.json(
        { success: false, error: "API key do Klaviyo inválida ou contém caracteres não permitidos", code: "KLAVIYO_INVALID_KEY" },
        { status: 400, headers: corsHeaders(origin) }
      )
    }
    if (error instanceof KlaviyoRateLimitError) {
      return NextResponse.json(
        { success: false, error: "Klaviyo temporariamente indisponível (limite de requisições). Tente novamente em alguns segundos.", code: "KLAVIYO_RATE_LIMIT" },
        { status: 429, headers: { ...corsHeaders(origin), "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } }
      )
    }
    return errorResponse(request, error, "IntegrationsKlaviyoFlows")
  }
}
