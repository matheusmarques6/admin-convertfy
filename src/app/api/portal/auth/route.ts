import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get current portal user session
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { authenticated: false, error: "Não autenticado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    // Use admin client to bypass RLS when checking portal user
    const adminClient = createAdminClient()

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email, status)
      `)
      .eq("auth_user_id", user.id)
      .single()

    // For portal auth endpoint, we ONLY check portal users
    // Don't fall back to profiles table - this is specifically for the client portal
    if (portalError || !portalUser) {
      console.log("[Portal Auth] Portal user not found for auth_user_id:", user.id, "Error:", portalError)
      return NextResponse.json(
        { authenticated: false, error: "Esta conta não tem acesso ao portal do cliente" },
        { status: 403, headers: corsHeaders() }
      )
    }

    if (!portalUser.is_active) {
      return NextResponse.json(
        { authenticated: false, error: "Conta desativada" },
        { status: 403, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        authenticated: true,
        isPortalUser: true,
        user: {
          id: portalUser.id,
          name: portalUser.name,
          email: portalUser.email,
          clientName: portalUser.client?.name || portalUser.client?.company || "",
          clientId: portalUser.client_id,
          mustChangePassword: portalUser.must_change_password || false,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Auth] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// POST - Login to portal
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400, headers: corsHeaders() }
      )
    }

    // Sign in with Supabase
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })

    if (signInError) {
      console.error("[Portal Auth] Sign in error:", signInError)
      return NextResponse.json(
        { error: "Email ou senha incorretos" },
        { status: 401, headers: corsHeaders() }
      )
    }

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await supabase
      .from("client_portal_users")
      .select(`
        *,
        client:clients(id, name, company, email, status)
      `)
      .eq("auth_user_id", authData.user.id)
      .single()

    if (portalError || !portalUser) {
      // Sign out if not a portal user
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: "Esta conta não tem acesso ao portal do cliente" },
        { status: 403, headers: corsHeaders() }
      )
    }

    if (!portalUser.is_active) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: "Sua conta está desativada. Entre em contato com o suporte." },
        { status: 403, headers: corsHeaders() }
      )
    }

    // Only update last login if not required to change password
    // This way must_change_password stays true until they actually change it
    if (!portalUser.must_change_password) {
      await supabase
        .from("client_portal_users")
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (portalUser.login_count || 0) + 1,
        })
        .eq("id", portalUser.id)
    }

    // Log activity
    await supabase.from("client_portal_activity").insert({
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
        session: authData.session,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Auth] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}

// DELETE - Logout from portal
export async function DELETE() {
  try {
    const supabase = await createClient()

    // Sign out the user
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error("[Portal Auth] Logout error:", error)
      return NextResponse.json(
        { error: "Erro ao fazer logout" },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      { success: true, message: "Logout realizado com sucesso" },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Portal Auth] Logout error:", error)
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
