import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("IntKlaviyoCampaigns")
import {
  KLAVIYO_API_URL,
  MIN_REQUEST_INTERVAL,
  sleep,
  klaviyoRequest,
  parseDateRangeInTimezone,
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { isCachedPeriod } from "@/lib/shared/data-status"
import { RATE_LIMIT_MAX_CACHE_AGE_MS } from "@/lib/integrations/klaviyo"
import type { SupabaseClient } from "@supabase/supabase-js"

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Cache-first configuration
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours (aligned with cron interval)

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// Types for campaign response
interface KlaviyoCampaignListResponse {
  data: Array<{
    id: string
    attributes: {
      name: string
      status: string
      send_time: string | null
      created_at: string
      archived: boolean
      channel: string
      send_options?: { subject?: string }
      message?: { subject?: string }
    }
  }>
  links?: { next?: string }
}

// Get all campaigns with details
// Klaviyo requires channel filter and does NOT support page[size] for campaigns
async function getAllCampaigns(apiKey: string) {
  const allCampaigns: Array<{
    id: string
    name: string
    status: string
    sendTime: string | null
    createdAt: string
    archived: boolean
    channel: string
    subject: string | null
  }> = []

  // Fetch email and SMS campaigns separately (channel filter is required)
  for (const channel of ['email', 'sms']) {
    let nextPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`

    while (nextPage) {
      const response: KlaviyoCampaignListResponse | null = await klaviyoRequest<KlaviyoCampaignListResponse>(apiKey, nextPage)

      if (!response?.data) break

      for (const c of response.data) {
        allCampaigns.push({
          id: c.id,
          name: c.attributes.name,
          status: c.attributes.status,
          sendTime: c.attributes.send_time,
          createdAt: c.attributes.created_at,
          archived: c.attributes.archived,
          channel: c.attributes.channel || channel,
          subject: c.attributes.send_options?.subject || c.attributes.message?.subject || null
        })
      }

      nextPage = response.links?.next ? response.links.next.replace(KLAVIYO_API_URL, "") : null
      if (nextPage) await sleep(500)
    }
  }

  return allCampaigns
}

// Get campaign metrics from reporting API
async function getCampaignMetrics(
  apiKey: string,
  metricId: string,
  startDate: string,
  endDate: string,
  timezoneOffset: string
) {
  // Valid statistics per Klaviyo Reporting API (revision 2024-10-15)
  // IMPORTANT: API uses "opens"/"clicks"/"unsubscribes" (NOT "opened"/"clicked"/"unsubscribed")
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
  }>(apiKey, "/campaign-values-reports/", { method: "POST", body })

  if (!response?.data?.attributes?.results) {
    return new Map()
  }

  // Aggregate metrics by campaign_id
  const campaignMetrics = new Map<string, {
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
    const campaignId = r.groupings.campaign_id
    const stats = r.statistics

    const existing = campaignMetrics.get(campaignId) || {
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
      unsubscribeRate: 0,
    }

    const newDelivered = existing.delivered + (stats.delivered || 0)
    const newOpened = existing.opened + (stats.opens_unique || 0)
    const newClicked = existing.clicked + (stats.clicks_unique || 0)
    const calculatedOpenRate = newDelivered > 0 ? (newOpened / newDelivered) * 100 : 0
    const calculatedClickRate = newDelivered > 0 ? (newClicked / newDelivered) * 100 : 0

    campaignMetrics.set(campaignId, {
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
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate,
    })
  }

  return campaignMetrics
}

// Read campaigns from cache (klaviyo_campaign_metrics table)
async function readCampaignsFromCache(
  storeId: string,
  period: string,
  statusFilter: string | null,
  supabase: SupabaseClient,
  maxAgeMs: number = CACHE_MAX_AGE_MS
) {
  const { data: rows, error } = await supabase
    .from("klaviyo_campaign_metrics")
    .select("*")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .order("fetched_at", { ascending: false })

  if (error || !rows || rows.length === 0) return null

  // Check freshness
  const latestFetchedAt = new Date(rows[0].fetched_at)
  if (Date.now() - latestFetchedAt.getTime() > maxAgeMs) return null

  // Map cached rows to response format
  let campaigns = rows.map((r: Record<string, unknown>) => ({
    id: r.campaign_id as string,
    name: r.campaign_name as string,
    status: r.campaign_status as string,
    sendTime: (r.send_time as string) || null,
    createdAt: "", // not stored in cache
    channel: (r.channel as string) || "email",
    subject: (r.subject as string) || null,
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

  // Apply status filter if provided
  if (statusFilter) {
    campaigns = campaigns.filter((c: { status: string }) => c.status === statusFilter)
  }

  // Sort by send time (most recent first) for sent campaigns, or by revenue
  campaigns.sort((a: { sendTime: string | null; conversionValue: number }, b: { sendTime: string | null; conversionValue: number }) => {
    if (a.sendTime && b.sendTime) {
      return new Date(b.sendTime).getTime() - new Date(a.sendTime).getTime()
    }
    return b.conversionValue - a.conversionValue
  })

  // Calculate summary totals
  const totals = campaigns.reduce(
    (acc: Record<string, number>, campaign: Record<string, unknown>) => ({
      totalCampaigns: acc.totalCampaigns + 1,
      sentCampaigns: acc.sentCampaigns + (campaign.status === "sent" ? 1 : 0),
      scheduledCampaigns: acc.scheduledCampaigns + (campaign.status === "scheduled" ? 1 : 0),
      draftCampaigns: acc.draftCampaigns + (campaign.status === "draft" ? 1 : 0),
      cancelledCampaigns: acc.cancelledCampaigns + (campaign.status === "cancelled" ? 1 : 0),
      emailCampaigns: acc.emailCampaigns + (campaign.channel === "email" ? 1 : 0),
      smsCampaigns: acc.smsCampaigns + (campaign.channel === "sms" ? 1 : 0),
      totalRecipients: acc.totalRecipients + (campaign.recipients as number),
      totalDelivered: acc.totalDelivered + (campaign.delivered as number),
      totalOpened: acc.totalOpened + (campaign.opened as number),
      totalClicked: acc.totalClicked + (campaign.clicked as number),
      totalConversions: acc.totalConversions + (campaign.conversions as number),
      totalRevenue: acc.totalRevenue + (campaign.conversionValue as number),
      totalBounced: acc.totalBounced + (campaign.bounced as number),
      totalUnsubscribed: acc.totalUnsubscribed + (campaign.unsubscribed as number),
    }),
    {
      totalCampaigns: 0,
      sentCampaigns: 0,
      scheduledCampaigns: 0,
      draftCampaigns: 0,
      cancelledCampaigns: 0,
      emailCampaigns: 0,
      smsCampaigns: 0,
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
    campaigns,
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
    const statusFilter = searchParams.get("status") // 'sent', 'scheduled', 'draft', 'cancelled'
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

    // Get account info for timezone (in-memory cached, no API cost)
    const accountInfo = await getCachedAccountInfo(apiKey, store.orgId, store.storeId)
    const accountTimezone = accountInfo?.timezone
    if (!accountTimezone) {
      log.warn(`[Klaviyo Campaigns] No timezone from account info for store ${storeId}, falling back to America/Sao_Paulo`)
    }
    const timezone = accountTimezone || "America/Sao_Paulo"

    // Calculate date range using account timezone (consistent with cron)
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, timezone, customStartDate, customEndDate)

    // Convert date strings to ISO timestamps to match cron-written cache format
    const periodStartISO = new Date(`${startDateStr}T00:00:00Z`).toISOString()
    const periodEndISO = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()

    // Cache-first: try reading from cache for standard periods
    const isCustomPeriod = period === "custom" || !isCachedPeriod(period)
    if (!forceRefresh && !isCustomPeriod) {
      try {
        const adminClient = createAdminClient()
        const cached = await readCampaignsFromCache(storeId, period, statusFilter, adminClient)
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

          log.info(`[Klaviyo Campaigns] Serving from cache for store: ${store.storeName} period: ${period}`)
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
            campaigns: cached.campaigns,
          }, { headers: corsHeaders(request.headers.get("origin")) })
        }
      } catch (cacheReadError) {
        log.error("[Klaviyo Campaigns] Cache read error, falling through to live fetch:", cacheReadError)
      }
    }

    log.info("[Klaviyo Campaigns] Starting live fetch for store:", store.storeName)

    const timezoneOffset = getTimezoneOffset(timezone)

    // Fetch data sequentially to avoid Klaviyo rate limiting
    const campaigns = await getAllCampaigns(apiKey)
    await sleep(350)
    const metricId = await getCachedPlacedOrderMetric(apiKey, store.orgId, store.storeId)

    // Get metrics if we have the metric ID
    let campaignMetrics = new Map()
    if (metricId) {
      campaignMetrics = await getCampaignMetrics(apiKey, metricId, startDateStr, endDateStr, timezoneOffset)
    }

    // Combine campaigns with their metrics
    let campaignsWithMetrics = campaigns
      .filter(c => !c.archived)
      .map(campaign => {
        const metrics = campaignMetrics.get(campaign.id) || {
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
          unsubscribeRate: 0,
        }

        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          sendTime: campaign.sendTime,
          createdAt: campaign.createdAt,
          channel: campaign.channel,
          subject: campaign.subject,
          ...metrics,
          revenue: metrics.conversionValue,
        }
      })

    // Apply status filter if provided
    if (statusFilter) {
      campaignsWithMetrics = campaignsWithMetrics.filter(c => c.status === statusFilter)
    }

    // Sort by send time (most recent first) for sent campaigns, or by revenue
    campaignsWithMetrics.sort((a, b) => {
      // Sent campaigns with send_time: sort by date
      if (a.sendTime && b.sendTime) {
        return new Date(b.sendTime).getTime() - new Date(a.sendTime).getTime()
      }
      // Otherwise sort by revenue
      return b.conversionValue - a.conversionValue
    })

    // Calculate totals
    const totals = campaignsWithMetrics.reduce((acc, campaign) => ({
      totalCampaigns: acc.totalCampaigns + 1,
      sentCampaigns: acc.sentCampaigns + (campaign.status === 'sent' ? 1 : 0),
      scheduledCampaigns: acc.scheduledCampaigns + (campaign.status === 'scheduled' ? 1 : 0),
      draftCampaigns: acc.draftCampaigns + (campaign.status === 'draft' ? 1 : 0),
      cancelledCampaigns: acc.cancelledCampaigns + (campaign.status === 'cancelled' ? 1 : 0),
      emailCampaigns: acc.emailCampaigns + (campaign.channel === 'email' ? 1 : 0),
      smsCampaigns: acc.smsCampaigns + (campaign.channel === 'sms' ? 1 : 0),
      totalRecipients: acc.totalRecipients + campaign.recipients,
      totalDelivered: acc.totalDelivered + campaign.delivered,
      totalOpened: acc.totalOpened + campaign.opened,
      totalClicked: acc.totalClicked + campaign.clicked,
      totalConversions: acc.totalConversions + campaign.conversions,
      totalRevenue: acc.totalRevenue + campaign.conversionValue,
      totalBounced: acc.totalBounced + campaign.bounced,
      totalUnsubscribed: acc.totalUnsubscribed + campaign.unsubscribed,
    }), {
      totalCampaigns: 0,
      sentCampaigns: 0,
      scheduledCampaigns: 0,
      draftCampaigns: 0,
      cancelledCampaigns: 0,
      emailCampaigns: 0,
      smsCampaigns: 0,
      totalRecipients: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalConversions: 0,
      totalRevenue: 0,
      totalBounced: 0,
      totalUnsubscribed: 0,
    })

    // Calculate average rates
    const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
    const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
    const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0
    const avgBounceRate = totals.totalRecipients > 0 ? (totals.totalBounced / totals.totalRecipients) * 100 : 0

    // Cache metrics in database
    try {
      const adminClient = createAdminClient()
      const sentCampaigns = campaignsWithMetrics.filter(c => c.status === 'sent')
      if (sentCampaigns.length > 0) {
        const { error: upsertError } = await adminClient
          .from("klaviyo_campaign_metrics")
          .upsert(
            sentCampaigns.map(campaign => ({
              store_id: storeId,
              org_id: store.orgId,
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              campaign_status: campaign.status,
              send_time: campaign.sendTime,
              subject: campaign.subject,
              channel: campaign.channel,
              period_start: periodStartISO,
              period_end: periodEndISO,
              period_label: isCachedPeriod(period) ? period : "custom",
              recipients: campaign.recipients,
              delivered: campaign.delivered,
              delivery_rate: campaign.deliveryRate,
              opened: campaign.opened,
              open_rate: campaign.openRate,
              clicked: campaign.clicked,
              click_rate: campaign.clickRate,
              click_to_open_rate: campaign.clickToOpenRate,
              conversions: campaign.conversions,
              conversion_rate: campaign.conversionRate,
              conversion_value: campaign.conversionValue,
              revenue_per_recipient: campaign.revenuePerRecipient,
              average_order_value: campaign.averageOrderValue,
              bounced: campaign.bounced,
              bounce_rate: campaign.bounceRate,
              unsubscribed: campaign.unsubscribed,
              unsubscribe_rate: campaign.unsubscribeRate,
              fetched_at: new Date().toISOString()
            })),
            { onConflict: 'store_id,campaign_id,period_start,period_end' }
          )

        if (upsertError) {
          log.error("[Klaviyo Campaigns] Error caching metrics:", upsertError)
        }
      }
    } catch (cacheError) {
      log.error("[Klaviyo Campaigns] Cache error:", cacheError)
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
      campaigns: campaignsWithMetrics
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
      log.warn("[Klaviyo Campaigns] Rate limited, attempting cache fallback...")
      try {
        const adminClient = createAdminClient()
        const searchParams = request.nextUrl.searchParams
        const fallbackStoreId = searchParams.get("store_id")
        const fallbackPeriod = searchParams.get("period") || "30d"
        const fallbackStatus = searchParams.get("status")
        if (fallbackStoreId && isCachedPeriod(fallbackPeriod)) {
          const cached = await readCampaignsFromCache(fallbackStoreId, fallbackPeriod, fallbackStatus, adminClient, RATE_LIMIT_MAX_CACHE_AGE_MS)
          if (cached) {
            let cachedCurrency = "BRL"
            try {
              const { data: summaryRow } = await adminClient
                .from("store_revenue_summary")
                .select("currency")
                .eq("store_id", fallbackStoreId)
                .limit(1)
                .single()
              if (summaryRow?.currency) cachedCurrency = summaryRow.currency
            } catch { /* fallback to BRL */ }

            log.info(`[Klaviyo Campaigns] Rate limit fallback: serving stale cache for store ${fallbackStoreId}`)
            return NextResponse.json({
              success: true,
              rateLimited: true,
              fromCache: true,
              fetchedAt: cached.fetchedAt,
              currency: cachedCurrency,
              summary: cached.summary,
              campaigns: cached.campaigns,
            }, { headers: corsHeaders(origin) })
          }
        }
      } catch (fallbackErr) {
        log.error("[Klaviyo Campaigns] Rate limit fallback error:", fallbackErr)
      }
      // No cache available — return friendly message (status 200, not 429)
      return NextResponse.json(
        { success: true, rateLimited: true, error: "rate_limited_no_cache", message: "Dados temporariamente indisponiveis por limitacao da Klaviyo." },
        { headers: corsHeaders(origin) }
      )
    }
    return errorResponse(request, error, "IntegrationsKlaviyoCampaigns")
  }
}
