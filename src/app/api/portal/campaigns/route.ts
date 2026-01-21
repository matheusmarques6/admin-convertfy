import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get campaigns for portal user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id, client_id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Check permission
    const permissions = portalUser.permissions as { view_campaigns?: boolean }
    if (!permissions?.view_campaigns) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const storeId = searchParams.get("store_id")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const status = searchParams.get("status")

    // Build query
    let query = supabase
      .from("campaigns")
      .select(`
        *,
        store:client_stores(id, store_name, platform)
      `)
      .eq("client_id", portalUser.client_id)
      .order("scheduled_date", { ascending: false })

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    if (startDate) {
      query = query.gte("scheduled_date", startDate)
    }

    if (endDate) {
      query = query.lte("scheduled_date", endDate)
    }

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data: campaigns, error } = await query

    if (error) {
      console.error("[Portal Campaigns] Error:", error)
      return NextResponse.json({ error: "Erro ao buscar campanhas" }, { status: 500, headers: corsHeaders() })
    }

    // Get stores for filter
    const { data: stores } = await supabase
      .from("client_stores")
      .select("id, store_name")
      .eq("client_id", portalUser.client_id)
      .eq("is_active", true)

    // Calculate stats
    const allCampaigns = campaigns || []
    const sent = allCampaigns.filter((c) => c.status === "sent")
    const scheduled = allCampaigns.filter((c) => c.status === "scheduled")

    const stats = {
      total: allCampaigns.length,
      sent: sent.length,
      scheduled: scheduled.length,
      draft: allCampaigns.filter((c) => c.status === "draft").length,
      totalRevenue: sent.reduce((sum, c) => sum + (c.revenue || 0), 0),
      totalRecipients: sent.reduce((sum, c) => sum + (c.recipients || 0), 0),
      totalOpens: sent.reduce((sum, c) => sum + (c.opened || 0), 0),
      totalClicks: sent.reduce((sum, c) => sum + (c.clicked || 0), 0),
    }

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "view_campaigns",
      metadata: { storeId, startDate, endDate },
    })

    return NextResponse.json(
      {
        campaigns: allCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          channel: c.channel,
          type: c.campaign_type,
          status: c.status,
          scheduledDate: c.scheduled_date,
          scheduledTime: c.scheduled_time,
          color: c.color,
          subjectLine: c.subject_line,
          segmentName: c.segment_name,
          recipients: c.recipients,
          delivered: c.delivered,
          opened: c.opened,
          clicked: c.clicked,
          converted: c.converted,
          revenue: c.revenue,
          store: c.store,
        })),
        stores: stores || [],
        stats,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Campaigns] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
