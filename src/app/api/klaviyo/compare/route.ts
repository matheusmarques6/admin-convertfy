import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoCompare")

/**
 * GET /api/klaviyo/compare
 *
 * Compara campanhas por nome entre lojas
 * Ex: Buscar "Black Friday" e ver performance em todas as lojas
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const campaignName = searchParams.get("name")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    if (!campaignName) {
      throw new AppError("Nome da campanha é obrigatório", 400)
    }

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
        campaign_metrics (
          recipients,
          delivered,
          delivery_rate,
          opened,
          open_rate,
          clicked,
          click_rate,
          conversions,
          conversion_rate,
          revenue,
          revenue_per_recipient,
          bounced,
          bounce_rate,
          unsubscribed,
          unsubscribe_rate
        ),
        client_stores!inner (
          id,
          store_name,
          store_url,
          clients (
            id,
            name
          )
        )
      `)
      .ilike("name", `%${campaignName}%`)
      .eq("status", "Sent")
      .order("send_time", { ascending: false })

    if (startDate) {
      query = query.gte("send_time", startDate)
    }
    if (endDate) {
      query = query.lte("send_time", endDate)
    }

    const { data: campaigns, error } = await query

    if (error) {
      log.error("Error fetching comparison:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by store
    const byStore = new Map<
      string,
      {
        store_id: string
        store_name: string
        store_url: string
        client_id: string
        client_name: string
        campaigns: Array<{
          id: string
          name: string
          subject: string
          channel: string
          send_time: string
          metrics: Record<string, number>
        }>
        totals: {
          campaign_count: number
          total_recipients: number
          total_revenue: number
          avg_open_rate: number
          avg_click_rate: number
          avg_conversion_rate: number
        }
      }
    >()

    for (const campaign of campaigns || []) {
      const storeRaw = campaign.client_stores
      const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw
      const clientRaw = store?.clients
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      const metricsRaw = campaign.campaign_metrics
      const metrics = Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw

      if (!byStore.has(campaign.store_id)) {
        byStore.set(campaign.store_id, {
          store_id: campaign.store_id,
          store_name: store?.store_name || "",
          store_url: store?.store_url || "",
          client_id: client?.id || "",
          client_name: client?.name || "",
          campaigns: [],
          totals: {
            campaign_count: 0,
            total_recipients: 0,
            total_revenue: 0,
            avg_open_rate: 0,
            avg_click_rate: 0,
            avg_conversion_rate: 0,
          },
        })
      }

      const storeData = byStore.get(campaign.store_id)!
      storeData.campaigns.push({
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject || "",
        channel: campaign.channel,
        send_time: campaign.send_time,
        metrics: {
          recipients: metrics?.recipients || 0,
          delivered: metrics?.delivered || 0,
          delivery_rate: metrics?.delivery_rate || 0,
          opened: metrics?.opened || 0,
          open_rate: metrics?.open_rate || 0,
          clicked: metrics?.clicked || 0,
          click_rate: metrics?.click_rate || 0,
          conversions: metrics?.conversions || 0,
          conversion_rate: metrics?.conversion_rate || 0,
          revenue: Number(metrics?.revenue) || 0,
          revenue_per_recipient: metrics?.revenue_per_recipient || 0,
          bounced: metrics?.bounced || 0,
          bounce_rate: metrics?.bounce_rate || 0,
        },
      })
    }

    // Calculate totals per store
    for (const [, storeData] of Array.from(byStore)) {
      const campaigns = storeData.campaigns
      storeData.totals.campaign_count = campaigns.length

      let totalOpenRate = 0
      let totalClickRate = 0
      let totalConversionRate = 0

      for (const c of campaigns) {
        storeData.totals.total_recipients += c.metrics.recipients
        storeData.totals.total_revenue += c.metrics.revenue
        totalOpenRate += c.metrics.open_rate
        totalClickRate += c.metrics.click_rate
        totalConversionRate += c.metrics.conversion_rate
      }

      if (campaigns.length > 0) {
        storeData.totals.avg_open_rate = totalOpenRate / campaigns.length
        storeData.totals.avg_click_rate = totalClickRate / campaigns.length
        storeData.totals.avg_conversion_rate = totalConversionRate / campaigns.length
      }
    }

    // Calculate global totals
    const storeResults = Array.from(byStore.values())
    const globalTotals = {
      total_stores: storeResults.length,
      total_campaigns: campaigns?.length || 0,
      total_recipients: 0,
      total_revenue: 0,
      avg_open_rate: 0,
      avg_click_rate: 0,
      avg_conversion_rate: 0,
    }

    let totalOpenRate = 0
    let totalClickRate = 0
    let totalConversionRate = 0

    for (const store of storeResults) {
      globalTotals.total_recipients += store.totals.total_recipients
      globalTotals.total_revenue += store.totals.total_revenue
      totalOpenRate += store.totals.avg_open_rate
      totalClickRate += store.totals.avg_click_rate
      totalConversionRate += store.totals.avg_conversion_rate
    }

    if (storeResults.length > 0) {
      globalTotals.avg_open_rate = totalOpenRate / storeResults.length
      globalTotals.avg_click_rate = totalClickRate / storeResults.length
      globalTotals.avg_conversion_rate = totalConversionRate / storeResults.length
    }

    // Sort stores by revenue
    storeResults.sort((a, b) => b.totals.total_revenue - a.totals.total_revenue)

    return NextResponse.json({
      search_term: campaignName,
      by_store: storeResults,
      totals: globalTotals,
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoCompare")
  }
}
