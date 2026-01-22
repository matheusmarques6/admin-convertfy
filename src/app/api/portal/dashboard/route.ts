import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

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

// GET - Get portal dashboard data
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders() })
    }

    // Get portal user using admin client to bypass RLS
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("*, client:clients(*)")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const clientId = portalUser.client_id
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"
    const storeId = searchParams.get("store_id")

    // Calculate date range
    const now = new Date()
    const startDate = new Date()

    switch (period) {
      case "1d":
        startDate.setDate(now.getDate() - 1)
        break
      case "7d":
        startDate.setDate(now.getDate() - 7)
        break
      case "15d":
        startDate.setDate(now.getDate() - 15)
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

    // Fetch all base data in parallel using admin client to bypass RLS
    const [
      clientData,
      storesData,
      invoicesData,
      meetingsData,
      upcomingCampaignsData,
    ] = await Promise.all([
      // Client info
      adminClient
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single(),

      // Stores with credentials
      adminClient
        .from("client_stores")
        .select("id, store_name, platform, store_url, is_active, klaviyo_private_key, klaviyo_api_key, shopify_access_token, shopify_store_domain")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("store_name"),

      // Invoices
      adminClient
        .from("invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: false })
        .limit(20),

      // Upcoming meetings
      adminClient
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .gte("scheduled_at", new Date().toISOString())
        .eq("status", "scheduled")
        .order("scheduled_at")
        .limit(5),

      // Upcoming campaigns (scheduled)
      adminClient
        .from("campaigns")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "scheduled")
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .order("scheduled_date")
        .limit(10),
    ])

    const client = clientData.data
    const stores = storesData.data || []
    const invoices = invoicesData.data || []
    const meetings = meetingsData.data || []
    const upcomingCampaigns = upcomingCampaignsData.data || []

    // Calculate invoice stats
    const pendingInvoices = invoices.filter((i) => i.status === "pending")
    const overdueInvoices = invoices.filter((i) => i.status === "overdue")
    const paidInvoices = invoices.filter((i) => i.status === "paid")

    const totalPending = pendingInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)
    const totalPaid = paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0)

    // Prepare the base response
    const response: Record<string, unknown> = {
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

      invoices: {
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length,
        totalPending,
        totalOverdue,
        totalPaid,
        recent: invoices.slice(0, 10).map((i) => ({
          id: i.id,
          amount: i.amount,
          dueDate: i.due_date,
          status: i.status,
          description: i.description,
        })),
      },

      upcomingCampaigns: upcomingCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        scheduledDate: c.scheduled_date,
      })),

      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduled_at,
        duration: m.duration_minutes,
        meetingUrl: m.meeting_url,
      })),

      lastUpdated: new Date().toISOString(),
    }

    // If a specific store is selected, fetch Klaviyo and Shopify data
    if (storeId && storeId !== "all") {
      const selectedStore = stores.find((s) => s.id === storeId)

      if (selectedStore) {
        response.selectedStore = {
          id: selectedStore.id,
          name: selectedStore.store_name,
          platform: selectedStore.platform,
        }

        // Fetch Klaviyo data if configured
        const hasKlaviyo = !!(selectedStore.klaviyo_private_key || selectedStore.klaviyo_api_key)
        if (hasKlaviyo) {
          try {
            const baseUrl = request.nextUrl.origin
            const klaviyoResponse = await fetch(
              `${baseUrl}/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}`,
              {
                headers: {
                  Cookie: request.headers.get("cookie") || "",
                },
              }
            )

            if (klaviyoResponse.ok) {
              const klaviyoData = await klaviyoResponse.json()

              if (klaviyoData.success && klaviyoData.connected) {
                // Map Klaviyo data to the dashboard format with all metrics
                const totalKlaviyoRevenue = klaviyoData.revenue?.totalRevenue || 0
                const flowRevenue = klaviyoData.revenue?.flowRevenue || 0
                const campaignRevenue = klaviyoData.revenue?.campaignRevenue || 0

                response.klaviyo = {
                  // Overview metrics
                  totalLeads: klaviyoData.overview?.totalSubscribers || 0,
                  engagedLeads: klaviyoData.engagement?.engagedProfiles || 0,
                  engagementRate: parseFloat(klaviyoData.engagement?.engagementRate || "0"),

                  // Revenue metrics
                  totalRevenue: totalKlaviyoRevenue,
                  campaignRevenue: campaignRevenue,
                  flowRevenue: flowRevenue,
                  smsRevenue: 0, // SMS data if available

                  // Email performance
                  emailsSent: klaviyoData.emailPerformance?.delivered || 0,
                  delivered: klaviyoData.emailPerformance?.delivered || 0,
                  openRate: klaviyoData.emailPerformance?.openRate || 0,
                  clickRate: klaviyoData.emailPerformance?.clickRate || 0,
                  clickToOpenRate: klaviyoData.emailPerformance?.clickToOpenRate || 0,
                  conversionRate: klaviyoData.emailPerformance?.clickToOpenRate || 0,
                  unsubscribeRate: klaviyoData.emailPerformance?.unsubscribeRate || 0,
                  bounceRate: klaviyoData.emailPerformance?.bounceRate || 0,
                  bounces: Math.round((klaviyoData.emailPerformance?.bounceRate || 0) * (klaviyoData.emailPerformance?.delivered || 0) / 100),

                  // Campaigns
                  campaignsCount: klaviyoData.overview?.campaignsInPeriod || klaviyoData.campaigns?.sent || 0,
                  campaignDelivered: klaviyoData.campaignPerformance?.totalDelivered || 0,
                  campaignRevenuePercent: totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0,

                  // Flows
                  flowsCount: klaviyoData.overview?.totalFlows || 0,
                  activeFlows: klaviyoData.overview?.liveFlows || 0,
                  flowDelivered: klaviyoData.flowPerformance?.totalDelivered || 0,
                  flowRevenuePercent: totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0,

                  // Recent campaigns with full metrics
                  recentCampaigns: (klaviyoData.campaignPerformance?.campaigns || []).slice(0, 10).map((c: Record<string, unknown>) => ({
                    id: c.campaignId,
                    name: c.name,
                    status: "sent",
                    sentAt: c.sendTime || new Date().toISOString(),
                    recipients: c.delivered || 0,
                    delivered: c.delivered || 0,
                    opened: c.opens || 0,
                    clicked: c.clicks || 0,
                    revenue: c.revenue || 0,
                    openRate: c.openRate || 0,
                    clickRate: c.clickRate || 0,
                  })),

                  // Top flows with full metrics
                  topFlows: (klaviyoData.flowPerformance?.flows || []).slice(0, 10).map((f: Record<string, unknown>) => ({
                    id: f.flowId,
                    name: f.name,
                    revenue: f.revenue || 0,
                    delivered: f.delivered || 0,
                    openRate: f.openRate || 0,
                    clickRate: f.clickRate || 0,
                  })),
                }
              }
            }
          } catch (error) {
            console.error("[Portal Dashboard] Klaviyo fetch error:", error)
          }
        }

        // Fetch Shopify data if configured
        const hasShopify = !!(selectedStore.shopify_access_token && selectedStore.shopify_store_domain)
        if (hasShopify) {
          try {
            const baseUrl = request.nextUrl.origin
            const shopifyResponse = await fetch(
              `${baseUrl}/api/integrations/shopify/report?store_id=${storeId}&period=${period}`,
              {
                headers: {
                  Cookie: request.headers.get("cookie") || "",
                },
              }
            )

            if (shopifyResponse.ok) {
              const shopifyData = await shopifyResponse.json()

              if (shopifyData.success && shopifyData.connected) {
                // Map Shopify data to the dashboard format with all metrics
                response.shopify = {
                  // Revenue metrics
                  totalRevenue: shopifyData.orders?.totalRevenue || 0,
                  totalOrders: shopifyData.orders?.totalOrders || 0,
                  averageOrderValue: shopifyData.orders?.averageOrderValue || 0,
                  totalCustomers: shopifyData.customers?.totalCustomers || 0,

                  // Customer metrics
                  newCustomers: shopifyData.customers?.newCustomersLast30Days || 0,
                  recurringCustomerRate: shopifyData.orders?.recurringCustomerRate || 0,

                  // Top products
                  topProducts: (shopifyData.bestSellingProducts || []).slice(0, 10).map((p: Record<string, unknown>) => ({
                    name: p.title || "Unknown Product",
                    quantity: p.quantitySold || 0,
                    revenue: p.revenue || 0,
                  })),
                }
              }
            }
          } catch (error) {
            console.error("[Portal Dashboard] Shopify fetch error:", error)
          }
        }
      }
    }

    // Log activity
    try {
      await adminClient.from("client_portal_activity").insert({
        portal_user_id: portalUser.id,
        client_id: clientId,
        action: "view_dashboard",
        metadata: { period, storeId },
      })
    } catch {
      // Ignore activity logging errors
    }

    return NextResponse.json(response, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Dashboard] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
