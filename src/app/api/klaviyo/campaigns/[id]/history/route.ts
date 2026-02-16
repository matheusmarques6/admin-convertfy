import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoCampaignHistory")

/**
 * GET /api/klaviyo/campaigns/[id]/history
 *
 * Retorna histórico de métricas de uma campanha para gráficos
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")

    // Get campaign info
    const { data: campaign, error: campaignError } = await supabase
      .from("klaviyo_campaigns")
      .select(`
        id,
        name,
        channel,
        send_time,
        client_stores (
          id,
          name
        )
      `)
      .eq("id", id)
      .single()

    if (campaignError || !campaign) {
      throw new AppError("Campanha não encontrada", 404)
    }

    // Get metrics history
    let historyQuery = supabase
      .from("campaign_metrics_history")
      .select("*")
      .eq("campaign_id", id)
      .order("snapshot_date", { ascending: true })

    if (startDate) {
      historyQuery = historyQuery.gte("snapshot_date", startDate)
    }
    if (endDate) {
      historyQuery = historyQuery.lte("snapshot_date", endDate)
    }

    const { data: history, error: historyError } = await historyQuery

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    // Get current metrics
    const { data: currentMetrics } = await supabase
      .from("campaign_metrics")
      .select("*")
      .eq("campaign_id", id)
      .single()

    // Format for charts
    const chartData = history?.map((h) => ({
      date: h.snapshot_date,
      hour: h.snapshot_hour,
      recipients: h.recipients,
      delivered: h.delivered,
      opened: h.opened,
      open_rate: h.open_rate,
      clicked: h.clicked,
      click_rate: h.click_rate,
      conversions: h.conversions,
      conversion_rate: h.conversion_rate,
      revenue: h.revenue,
      bounced: h.bounced,
      unsubscribed: h.unsubscribed,
    }))

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        send_time: campaign.send_time,
        store: Array.isArray(campaign.client_stores)
          ? campaign.client_stores[0]
          : campaign.client_stores,
      },
      current_metrics: currentMetrics,
      history: chartData,
      data_points: chartData?.length || 0,
    })
  } catch (error) {
    return errorResponse(request, error, "KlaviyoCampaignsHistory")
  }
}
