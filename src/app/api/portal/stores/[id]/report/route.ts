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

// GET - Get store report (Klaviyo + Shopify data)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const { id: storeId } = await params
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get("period") || "30d"

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
    const permissions = portalUser.permissions as { view_reports?: boolean }
    if (!permissions?.view_reports) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403, headers: corsHeaders() })
    }

    // Verify store belongs to client
    const { data: store, error: storeError } = await supabase
      .from("client_stores")
      .select("*")
      .eq("id", storeId)
      .eq("client_id", portalUser.client_id)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Loja não encontrada" }, { status: 404, headers: corsHeaders() })
    }

    // Build base URL for internal API calls
    const baseUrl = request.nextUrl.origin

    // Fetch Klaviyo report if configured
    let klaviyoReport = null
    if (store.klaviyo_private_key || store.klaviyo_api_key) {
      try {
        const klaviyoResponse = await fetch(
          `${baseUrl}/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}`,
          {
            headers: {
              Cookie: request.headers.get("cookie") || "",
            },
          }
        )
        if (klaviyoResponse.ok) {
          klaviyoReport = await klaviyoResponse.json()
        }
      } catch (e) {
        console.error("[Portal Store Report] Klaviyo error:", e)
      }
    }

    // Fetch Shopify report if configured
    let shopifyReport = null
    if (store.shopify_access_token && store.shopify_store_domain) {
      try {
        const shopifyResponse = await fetch(
          `${baseUrl}/api/integrations/shopify/report?store_id=${storeId}&period=${period}`,
          {
            headers: {
              Cookie: request.headers.get("cookie") || "",
            },
          }
        )
        if (shopifyResponse.ok) {
          shopifyReport = await shopifyResponse.json()
        }
      } catch (e) {
        console.error("[Portal Store Report] Shopify error:", e)
      }
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

    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("*")
      .eq("store_id", storeId)
      .gte("scheduled_date", startDate.toISOString().split("T")[0])
      .order("scheduled_date", { ascending: false })

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "view_report",
      resource_type: "store",
      resource_id: storeId,
      metadata: { period, storeName: store.store_name },
    })

    // Build response
    return NextResponse.json(
      {
        success: true,
        store: {
          id: store.id,
          name: store.store_name,
          platform: store.platform,
          url: store.store_url,
          hasKlaviyo: !!(store.klaviyo_private_key || store.klaviyo_api_key),
          hasShopify: !!(store.shopify_access_token && store.shopify_store_domain),
        },
        period,
        klaviyo: klaviyoReport
          ? {
              connected: klaviyoReport.connected,
              account: klaviyoReport.account,
              overview: klaviyoReport.overview,
              revenue: klaviyoReport.revenue,
              engagement: klaviyoReport.engagement,
              emailPerformance: klaviyoReport.emailPerformance,
              campaigns: klaviyoReport.campaigns,
              flows: klaviyoReport.flowPerformance,
              lists: klaviyoReport.lists?.slice(0, 10),
            }
          : null,
        shopify: shopifyReport
          ? {
              connected: shopifyReport.connected,
              shop: shopifyReport.shop,
              orders: shopifyReport.orders,
              products: shopifyReport.products,
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
        lastUpdated: new Date().toISOString(),
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Store Report] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
