import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("IntKlaviyoCampaigns")
import {
  KLAVIYO_API_URL,
  MIN_REQUEST_INTERVAL,
  sleep,
  corsHeaders,
  klaviyoRequest,
  parseDateRange,
  formatDateStr,
  getAccountInfo,
  getTimezoneOffset,
  findPlacedOrderMetric,
} from "@/lib/integrations/klaviyo"

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
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
    "unsubscribed",
    "spam_complaints"
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
            open_rate?: number
            click_rate?: number
            click_to_open_rate?: number
            unsubscribe_rate?: number
            unsubscribed?: number
            spam_complaints?: number
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
    spamComplaints: number
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
      spamComplaints: 0
    }

    campaignMetrics.set(campaignId, {
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
      unsubscribeRate: stats.unsubscribe_rate || existing.unsubscribeRate,
      spamComplaints: existing.spamComplaints + (stats.spam_complaints || 0)
    })
  }

  return campaignMetrics
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const period = searchParams.get("period") || "30d"
    const customStartDate = searchParams.get("start_date")
    const customEndDate = searchParams.get("end_date")
    const statusFilter = searchParams.get("status") // 'sent', 'scheduled', 'draft', 'cancelled'

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("API Key do Klaviyo não configurada", 400)
    }

    log.info(`Starting fetch for store: ${storeData.store_name}`)

    // Get account info for timezone
    const accountInfo = await getAccountInfo(apiKey)
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)

    // Calculate date range
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Fetch data in parallel
    const [campaigns, metricId] = await Promise.all([
      getAllCampaigns(apiKey),
      findPlacedOrderMetric(apiKey)
    ])

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
          spamComplaints: 0
        }

        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          sendTime: campaign.sendTime,
          createdAt: campaign.createdAt,
          channel: campaign.channel,
          subject: campaign.subject,
          ...metrics
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
      totalSpamComplaints: acc.totalSpamComplaints + campaign.spamComplaints
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
      totalSpamComplaints: 0
    })

    // Calculate average rates
    const avgOpenRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0
    const avgClickRate = totals.totalDelivered > 0 ? (totals.totalClicked / totals.totalDelivered) * 100 : 0
    const avgConversionRate = totals.totalDelivered > 0 ? (totals.totalConversions / totals.totalDelivered) * 100 : 0
    const avgBounceRate = totals.totalRecipients > 0 ? (totals.totalBounced / totals.totalRecipients) * 100 : 0

    // Cache metrics in database
    try {
      const sentCampaigns = campaignsWithMetrics.filter(c => c.status === 'sent')
      if (sentCampaigns.length > 0) {
        const { error: upsertError } = await supabase
          .from("klaviyo_campaign_metrics")
          .upsert(
            sentCampaigns.map(campaign => ({
              store_id: storeId,
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              campaign_status: campaign.status,
              send_time: campaign.sendTime,
              subject: campaign.subject,
              channel: campaign.channel,
              period_start: startDateStr,
              period_end: endDateStr,
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
              spam_complaints: campaign.spamComplaints,
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
    }, { headers: corsHeaders() })

  } catch (error) {
    return errorResponse(request, error, "IntegrationsKlaviyoCampaigns")
  }
}
