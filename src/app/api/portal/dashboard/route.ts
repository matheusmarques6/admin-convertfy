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

// Helper to get portal user from auth
async function getPortalUser(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: portalUser } = await supabase
    .from("client_portal_users")
    .select("*, client:clients(*)")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single()

  return portalUser
}

// GET - Get portal dashboard data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const clientId = portalUser.client_id
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"

    // Calculate date range
    const now = new Date()
    const startDate = new Date()

    switch (period) {
      case "7d":
        startDate.setDate(now.getDate() - 7)
        break
      case "30d":
        startDate.setDate(now.getDate() - 30)
        break
      case "90d":
        startDate.setDate(now.getDate() - 90)
        break
      case "12m":
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = now.toISOString().split("T")[0]

    // Fetch all data in parallel
    const [
      clientData,
      storesData,
      campaignsData,
      invoicesData,
      meetingsData,
      contractData,
    ] = await Promise.all([
      // Client info
      supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single(),

      // Stores with credentials
      supabase
        .from("client_stores")
        .select("id, store_name, platform, store_url, is_active, created_at")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("store_name"),

      // Recent campaigns
      supabase
        .from("campaigns")
        .select("*")
        .eq("client_id", clientId)
        .gte("scheduled_date", startDateStr)
        .lte("scheduled_date", endDateStr)
        .order("scheduled_date", { ascending: false })
        .limit(10),

      // Invoices
      supabase
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: false })
        .limit(20),

      // Upcoming meetings
      supabase
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .gte("scheduled_at", new Date().toISOString())
        .eq("status", "scheduled")
        .order("scheduled_at")
        .limit(5),

      // Active contract
      supabase
        .from("contracts")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1),
    ])

    const client = clientData.data
    const stores = storesData.data || []
    const campaigns = campaignsData.data || []
    const invoices = invoicesData.data || []
    const meetings = meetingsData.data || []
    const contract = contractData.data?.[0] || null

    // Calculate invoice stats
    const pendingInvoices = invoices.filter((i) => i.status === "pending")
    const overdueInvoices = invoices.filter((i) => i.status === "overdue")
    const paidInvoices = invoices.filter((i) => i.status === "paid")

    const totalPending = pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalPaid = paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)

    // Campaign stats
    const sentCampaigns = campaigns.filter((c) => c.status === "sent")
    const scheduledCampaigns = campaigns.filter((c) => c.status === "scheduled")
    const totalCampaignRevenue = sentCampaigns.reduce((sum, c) => sum + (c.revenue || 0), 0)

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: clientId,
      action: "view_dashboard",
      metadata: { period },
    })

    return NextResponse.json(
      {
        success: true,
        period,
        dateRange: { start: startDateStr, end: endDateStr },

        client: {
          id: client?.id,
          name: client?.name,
          company: client?.company,
          status: client?.status,
          healthScore: client?.health_score,
        },

        stores: stores.map((s) => ({
          id: s.id,
          name: s.store_name,
          platform: s.platform,
          url: s.store_url,
          isActive: s.is_active,
        })),

        summary: {
          totalStores: stores.length,
          totalCampaigns: campaigns.length,
          sentCampaigns: sentCampaigns.length,
          scheduledCampaigns: scheduledCampaigns.length,
          campaignRevenue: totalCampaignRevenue,
        },

        invoices: {
          pending: pendingInvoices.length,
          overdue: overdueInvoices.length,
          totalPending,
          totalOverdue,
          totalPaid,
          recent: invoices.slice(0, 5).map((i) => ({
            id: i.id,
            amount: i.amount,
            dueDate: i.due_date,
            status: i.status,
            description: i.description,
          })),
        },

        campaigns: {
          recent: campaigns.slice(0, 5).map((c) => ({
            id: c.id,
            name: c.name,
            channel: c.channel,
            status: c.status,
            scheduledDate: c.scheduled_date,
            revenue: c.revenue,
          })),
        },

        meetings: meetings.map((m) => ({
          id: m.id,
          title: m.title,
          scheduledAt: m.scheduled_at,
          duration: m.duration_minutes,
          meetingUrl: m.meeting_url,
        })),

        contract: contract
          ? {
              planName: contract.plan_name,
              monthlyValue: contract.monthly_value,
              startDate: contract.start_date,
              endDate: contract.end_date,
              status: contract.status,
            }
          : null,

        lastUpdated: new Date().toISOString(),
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Dashboard] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
