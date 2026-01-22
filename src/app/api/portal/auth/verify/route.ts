import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// POST - Verify if user is a portal user
export async function POST(request: NextRequest) {
  try {
    // Use admin client to bypass RLS
    const adminClient = createAdminClient()
    const body = await request.json()

    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: "User ID é obrigatório" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email, status)
      `)
      .eq("auth_user_id", userId)
      .single()

    if (portalError || !portalUser) {
      console.log("[Portal Auth Verify] Portal user not found for auth_user_id:", userId, "Error:", portalError)
      return NextResponse.json(
        { error: "Esta conta não tem acesso ao portal do cliente" },
        { status: 403, headers: corsHeaders() }
      )
    }

    if (!portalUser.is_active) {
      return NextResponse.json(
        { error: "Sua conta está desativada. Entre em contato com o suporte." },
        { status: 403, headers: corsHeaders() }
      )
    }

    // Update last login if not required to change password
    if (!portalUser.must_change_password) {
      await adminClient
        .from("client_portal_users")
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (portalUser.login_count || 0) + 1,
        })
        .eq("id", portalUser.id)
    }

    // Log activity
    await adminClient.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "login",
      metadata: {
        user_agent: request.headers.get("user-agent"),
      },
    })

    return NextResponse.json(
      {
        success: true,
        user: {
          id: portalUser.id,
          name: portalUser.name,
          email: portalUser.email,
          clientName: portalUser.client?.name || portalUser.client?.company || "",
          clientId: portalUser.client_id,
        },
        mustChangePassword: portalUser.must_change_password || false,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Auth Verify] Error:", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
