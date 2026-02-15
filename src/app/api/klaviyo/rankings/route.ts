import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoRankings")

/**
 * GET /api/klaviyo/rankings
 *
 * Retorna rankings de campanhas por diferentes métricas
 * Top 10 campanhas por receita, taxa de abertura, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const metric = searchParams.get("metric") || "revenue" // revenue, open_rate, click_rate, conversion_rate
    const storeId = searchParams.get("store_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const limit = parseInt(searchParams.get("limit") || "10")

    // Build query
    let query = supabase
      .from("klaviyo_campaigns")
      .select(`
        id,
        name,
        subject,
        channel,
        status,
        send_time,
        store_id,
        campaign_metrics!inner (
          recipients,
          delivered,
          open_rate,
          click_rate,
          conversion_rate,
          revenue,
          revenue_per_recipient,
          bounced,
          bounce_rate
        ),
        client_stores!inner (
          id,
          store_name,
          clients (
            id,
            name
          )
        )
      `)
      .eq("status", "Sent")

    // Only campaigns with the metric > 0
    if (metric === "revenue") {
      query = query.gt("campaign_metrics.revenue", 0)
    } else if (metric === "open_rate") {
      query = query.gt("campaign_metrics.open_rate", 0)
    } else if (metric === "click_rate") {
      query = query.gt("campaign_metrics.click_rate", 0)
    } else if (metric === "conversion_rate") {
      query = query.gt("campaign_metrics.conversion_rate", 0)
    }

    if (storeId) {
      query = query.eq("store_id", storeId)
    }
    if (startDate) {
      query = query.gte("send_time", startDate)
    }
    if (endDate) {
      query = query.lte("send_time", endDate)
    }

    const { data: campaigns, error } = await query

    if (error) {
      log.error("Error fetching rankings:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform and sort
    const transformedCampaigns = campaigns?.map((campaign) => {
      const metricsRaw = campaign.campaign_metrics
      const metrics = Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw
      const storeRaw = campaign.client_stores
      const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw
      const clientRaw = store?.clients
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw

      return {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        channel: campaign.channel,
        send_time: campaign.send_time,
        store: {
          id: store?.id,
          name: store?.store_name,
        },
        client: {
          id: client?.id,
          name: client?.name,
        },
        metrics: {
          recipients: metrics?.recipients || 0,
          delivered: metrics?.delivered || 0,
          open_rate: metrics?.open_rate || 0,
          click_rate: metrics?.click_rate || 0,
          conversion_rate: metrics?.conversion_rate || 0,
          revenue: metrics?.revenue || 0,
          revenue_per_recipient: metrics?.revenue_per_recipient || 0,
        },
      }
    }) || []

    // Sort by metric
    transformedCampaigns.sort((a, b) => {
      const aValue = a.metrics[metric as keyof typeof a.metrics] || 0
      const bValue = b.metrics[metric as keyof typeof b.metrics] || 0
      return Number(bValue) - Number(aValue)
    })

    // Apply limit and add rank
    const rankedCampaigns = transformedCampaigns.slice(0, limit).map((c, i) => ({
      ...c,
      rank: i + 1,
    }))

    // Calculate totals
    const totals = {
      total_campaigns: transformedCampaigns.length,
      total_revenue: transformedCampaigns.reduce((sum, c) => sum + Number(c.metrics.revenue), 0),
      total_recipients: transformedCampaigns.reduce((sum, c) => sum + c.metrics.recipients, 0),
      avg_open_rate:
        transformedCampaigns.length > 0
          ? transformedCampaigns.reduce((sum, c) => sum + c.metrics.open_rate, 0) /
            transformedCampaigns.length
          : 0,
      avg_click_rate:
        transformedCampaigns.length > 0
          ? transformedCampaigns.reduce((sum, c) => sum + c.metrics.click_rate, 0) /
            transformedCampaigns.length
          : 0,
      avg_conversion_rate:
        transformedCampaigns.length > 0
          ? transformedCampaigns.reduce((sum, c) => sum + c.metrics.conversion_rate, 0) /
            transformedCampaigns.length
          : 0,
    }

    return NextResponse.json({
      metric,
      rankings: rankedCampaigns,
      totals,
    })
  } catch (error) {
    log.error("Error in rankings API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
