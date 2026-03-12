import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAuth")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}


// GET - Get current portal user session
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { authenticated: false, error: "Não autenticado" },
        { status: 401, headers: corsHeaders(request.headers.get("origin")) }
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
      log.debug(`[Portal Auth] Portal user not found for auth_user_id: ${user.id}`, { error: portalError })
      return NextResponse.json(
        { authenticated: false, error: "Esta conta não tem acesso ao portal do cliente" },
        { status: 403, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    if (!portalUser.is_active) {
      return NextResponse.json(
        { authenticated: false, error: "Conta desativada" },
        { status: 403, headers: corsHeaders(request.headers.get("origin")) }
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
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalAuth")
  }
}

// POST - Login to portal
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "portal:auth", RATE_LIMITS.auth)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const body = await request.json()

    const { email, password } = body

    if (!email || !password) {
      throw new AppError("Email e senha são obrigatórios", 400)
    }

    // Sign in with Supabase
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })

    if (signInError) {
      log.error("[Portal Auth] Sign in error:", signInError)
      throw new AppError("Email ou senha incorretos", 401)
    }

    // Use admin client for portal queries (RLS bypass policies will be removed in 18.1.2)
    const adminClient = createAdminClient()

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await adminClient
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
      throw new AppError("Esta conta não tem acesso ao portal do cliente", 403)
    }

    if (!portalUser.is_active) {
      await supabase.auth.signOut()
      throw new AppError("Sua conta está desativada. Entre em contato com o suporte.", 403)
    }

    // Only update last login if not required to change password
    // This way must_change_password stays true until they actually change it
    if (!portalUser.must_change_password) {
      await adminClient
        .from("client_portal_users")
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (portalUser.login_count || 0) + 1,
        })
        .eq("id", portalUser.id)
    }

    // Log portal activity
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
        session: authData.session,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalAuth")
  }
}

// DELETE - Logout from portal
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Sign out the user
    const { error } = await supabase.auth.signOut()

    if (error) {
      log.error("[Portal Auth] Logout error:", error)
      throw new AppError("Erro ao fazer logout", 500)
    }

    return NextResponse.json(
      { success: true, message: "Logout realizado com sucesso" },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalAuth")
  }
}
