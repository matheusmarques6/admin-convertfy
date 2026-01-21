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

// GET - Get stores list for portal user
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("client_id, permissions")
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

    // Get stores (without sensitive credentials)
    const { data: stores, error } = await supabase
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        is_active,
        created_at
      `)
      .eq("client_id", portalUser.client_id)
      .order("store_name")

    if (error) {
      console.error("[Portal Stores] Error:", error)
      return NextResponse.json({ error: "Erro ao buscar lojas" }, { status: 500, headers: corsHeaders() })
    }

    // Get campaign counts per store
    const storesWithCounts = await Promise.all(
      (stores || []).map(async (store) => {
        const { count: campaignCount } = await supabase
          .from("campaigns")
          .select("*", { count: "exact", head: true })
          .eq("store_id", store.id)

        return {
          ...store,
          campaignCount: campaignCount || 0,
        }
      })
    )

    return NextResponse.json({ stores: storesWithCounts }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Portal Stores] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
