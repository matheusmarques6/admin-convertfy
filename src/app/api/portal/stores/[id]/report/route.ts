import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalStoresReport")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get store report (email platform + Shopify data)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const { id: storeId } = await params
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"
    const forceRefresh = searchParams.get("force_refresh") === "true"

    // Use admin client to bypass RLS for portal user lookups
    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("id, client_id, permissions")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    // Check permission
    const permissions = portalUser.permissions as { view_reports?: boolean }
    if (!permissions?.view_reports) {
      throw new AppError("Sem permissão", 403)
    }

    // Verify store belongs to client
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select("id, client_id, store_name, platform, store_url, email_platform, klaviyo_private_key, klaviyo_api_key, omnisend_api_key, shopify_access_token, shopify_store_domain")
      .eq("id", storeId)
      .eq("client_id", portalUser.client_id)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Build base URL for internal API calls
    const baseUrl = request.nextUrl.origin
    const refreshParam = forceRefresh ? "&force_refresh=true" : ""

    // Fetch email platform and Shopify reports in parallel
    const cookie = request.headers.get("cookie") || ""
    const headers = { Cookie: cookie }

    const hasEmailPlatform = !!(store.klaviyo_private_key || store.klaviyo_api_key || store.omnisend_api_key)
    const [emailPlatformResult, shopifyResult] = await Promise.allSettled([
      hasEmailPlatform
        ? fetch(`${baseUrl}/api/integrations/email-platform/report?store_id=${storeId}&period=${period}${refreshParam}`, { headers })
            .then(r => r.ok ? r.json() : null)
        : Promise.resolve(null),
      (store.shopify_access_token && store.shopify_store_domain)
        ? fetch(`${baseUrl}/api/integrations/shopify/report?store_id=${storeId}&period=${period}${refreshParam}`, { headers })
            .then(r => r.ok ? r.json() : null)
        : Promise.resolve(null),
    ])

    const emailPlatformReport = emailPlatformResult.status === "fulfilled" ? emailPlatformResult.value : null
    const shopifyReport = shopifyResult.status === "fulfilled" ? shopifyResult.value : null

    if (emailPlatformResult.status === "rejected") {
      log.error("[Portal Store Report] Email platform error:", emailPlatformResult.reason)
    }
    if (shopifyResult.status === "rejected") {
      log.error("[Portal Store Report] Shopify error:", shopifyResult.reason)
    }

    // Get campaigns for this store
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
      default:
        startDate.setDate(now.getDate() - 30)
    }

    const { data: campaigns } = await adminClient
      .from("campaigns")
      .select("*")
      .eq("store_id", storeId)
      .gte("scheduled_date", startDate.toISOString().split("T")[0])
      .order("scheduled_date", { ascending: false })

    // Log portal activity
    await adminClient.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "view_report",
      metadata: { resource_type: "store", resource_id: storeId, period, storeName: store.store_name },
    })

    // Build response
    return NextResponse.json(
      {
        success: true,
        store: {
          id: store.id,
          store_name: store.store_name,
          store_url: store.store_url,
          platform: store.platform,
          is_active: true,
          currency: "BRL",
          hasKlaviyo: !!(store.klaviyo_private_key || store.klaviyo_api_key),
          hasOmnisend: !!store.omnisend_api_key,
          hasEmailPlatform,
          emailPlatform: store.email_platform,
          hasShopify: !!(store.shopify_access_token && store.shopify_store_domain),
        },
        period,
        klaviyo: emailPlatformReport
          ? {
              connected: emailPlatformReport.connected,
              account: emailPlatformReport.account,
              // Flat fields expected by portal page
              totalLeads: emailPlatformReport.overview?.totalSubscribers || 0,
              engagedLeads: emailPlatformReport.engagement?.engagedProfiles || 0,
              engagementRate: parseFloat(emailPlatformReport.engagement?.engagementRate) || 0,
              totalRevenue: emailPlatformReport.revenue?.totalRevenue || 0,
              campaignRevenue: emailPlatformReport.revenue?.campaignRevenue || 0,
              flowRevenue: emailPlatformReport.revenue?.flowRevenue || 0,
              emailsSent: emailPlatformReport.emailPerformance?.delivered || 0,
              openRate: emailPlatformReport.emailPerformance?.openRate || 0,
              clickRate: emailPlatformReport.emailPerformance?.clickRate || 0,
              conversionRate: emailPlatformReport.revenue?.totalOrders && emailPlatformReport.emailPerformance?.delivered
                ? (emailPlatformReport.revenue.totalOrders / emailPlatformReport.emailPerformance.delivered) * 100
                : 0,
              unsubscribeRate: emailPlatformReport.emailPerformance?.unsubscribeRate || 0,
              bounceRate: emailPlatformReport.emailPerformance?.bounceRate || 0,
              delivered: emailPlatformReport.emailPerformance?.delivered || 0,
              lists: (emailPlatformReport.lists || []).slice(0, 10).map((l: Record<string, unknown>) => ({
                name: l.name,
                count: (l.profileCount as number) || 0,
              })),
              recentCampaigns: (
                (emailPlatformReport.campaignPerformance?.campaigns as Record<string, unknown>[]) ||
                (emailPlatformReport.campaigns?.recentCampaigns as Record<string, unknown>[]) ||
                []
              ).slice(0, 10).map((c: Record<string, unknown>) => ({
                id: c.campaignId || c.id,
                name: c.name,
                status: c.status || "sent",
                sentAt: c.sendTime || c.sentAt || null,
                recipients: c.recipients || 0,
                delivered: c.delivered || 0,
                opened: c.opens || c.opened || 0,
                clicked: c.clicks || c.clicked || 0,
                revenue: c.revenue || 0,
                openRate: c.openRate || 0,
                clickRate: c.clickRate || 0,
              })),
              topFlows: ((emailPlatformReport.flowPerformance?.flows as Record<string, unknown>[]) || [])
                .slice(0, 5).map((f: Record<string, unknown>) => ({
                  id: f.flowId || f.id,
                  name: f.name,
                  revenue: f.revenue || 0,
                  recipients: f.recipients || 0,
                  openRate: f.openRate || 0,
                  clickRate: f.clickRate || 0,
                })),
            }
          : null,
        shopify: shopifyReport
          ? {
              connected: shopifyReport.connected,
              shop: shopifyReport.shop,
              orders: shopifyReport.orders,
              products: shopifyReport.products,
              // Flat fields expected by portal page
              totalOrders: shopifyReport.summary?.totalOrders || shopifyReport.orders?.totalOrders || 0,
              totalRevenue: shopifyReport.summary?.totalRevenue || shopifyReport.orders?.totalRevenue || 0,
              averageOrderValue: shopifyReport.summary?.averageOrderValue || shopifyReport.orders?.averageOrderValue || 0,
              recurringCustomerRate: shopifyReport.summary?.recurringCustomerRate || shopifyReport.orders?.recurringCustomerRate || 0,
              newCustomers: shopifyReport.customers?.newCustomersLast30Days || 0,
              topProducts: (shopifyReport.bestSellingProducts || shopifyReport.orders?.bestSellingProducts || [])
                .slice(0, 10)
                .map((p: Record<string, unknown>) => ({
                  name: p.title || p.name,
                  quantity: p.totalQuantity || p.quantity || 0,
                  revenue: p.totalRevenue || p.revenue || 0,
                })),
            }
          : null,
        campaigns: (campaigns || []).map((c) => ({
          id: c.id,
          name: c.name,
          channel: c.channel,
          type: c.campaign_type,
          status: c.status,
          scheduledDate: c.scheduled_date,
          recipients: c.recipients,
          delivered: c.delivered,
          opened: c.opened,
          clicked: c.clicked,
          revenue: c.revenue,
        })),
        lastSyncedAt: new Date().toISOString(),
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalStoresReport")
  }
}
