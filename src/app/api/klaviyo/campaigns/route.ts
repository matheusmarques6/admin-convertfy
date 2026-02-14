import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/klaviyo/campaigns
 *
 * Busca campanhas sincronizadas do Klaviyo com filtros
 * Suporta busca cross-store por nome
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get("search")
    const storeId = searchParams.get("store_id")
    const status = searchParams.get("status")
    const channel = searchParams.get("channel")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const sortBy = searchParams.get("sort_by") || "send_time"
    const sortOrder = searchParams.get("sort_order") || "desc"
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Build query
    let query = supabase
      .from("klaviyo_campaigns")
      .select(`
        *,
        campaign_metrics (*),
        client_stores!inner (
          id,
          store_name,
          store_url,
          clients (
            id,
            name
          )
        )
      `, { count: "exact" })

    // Apply filters
    if (search) {
      query = query.ilike("name", `%${search}%`)
    }
    if (storeId) {
      query = query.eq("store_id", storeId)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (channel) {
      query = query.eq("channel", channel)
    }
    if (startDate) {
      query = query.gte("send_time", startDate)
    }
    if (endDate) {
      query = query.lte("send_time", endDate)
    }

    // Sort
    query = query.order(sortBy, { ascending: sortOrder === "asc" })

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data: campaigns, error, count } = await query

    if (error) {
      console.error("Error fetching campaigns:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data
    const transformedCampaigns = campaigns?.map((campaign) => {
      const metricsRaw = campaign.campaign_metrics
      const metrics = Array.isArray(metricsRaw) ? metricsRaw[0] : metricsRaw
      const storeRaw = campaign.client_stores
      const store = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw
      const clientRaw = store?.clients
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw

      return {
        id: campaign.id,
        klaviyo_campaign_id: campaign.klaviyo_campaign_id,
        name: campaign.name,
        subject: campaign.subject,
        channel: campaign.channel,
        status: campaign.status,
        send_time: campaign.send_time,
        tags: campaign.tags,
        synced_at: campaign.synced_at,
        store: {
          id: store?.id,
          name: store?.store_name,
          url: store?.store_url,
        },
        client: {
          id: client?.id,
          name: client?.name,
        },
        metrics: metrics
          ? {
              recipients: metrics.recipients,
              delivered: metrics.delivered,
              delivery_rate: metrics.delivery_rate,
              opened: metrics.opened,
              open_rate: metrics.open_rate,
              clicked: metrics.clicked,
              click_rate: metrics.click_rate,
              conversions: metrics.conversions,
              conversion_rate: metrics.conversion_rate,
              revenue: metrics.revenue,
              revenue_per_recipient: metrics.revenue_per_recipient,
              bounced: metrics.bounced,
              bounce_rate: metrics.bounce_rate,
              unsubscribed: metrics.unsubscribed,
              unsubscribe_rate: metrics.unsubscribe_rate,
            }
          : null,
      }
    })

    return NextResponse.json({
      campaigns: transformedCampaigns,
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error("Error in campaigns API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
