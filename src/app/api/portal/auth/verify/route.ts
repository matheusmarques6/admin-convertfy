import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalAuthVerify")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Verify if user is a portal user
export async function POST(request: NextRequest) {
  try {
    // Use admin client to bypass RLS
    const adminClient = createAdminClient()
    const body = await request.json()

    const { userId } = body

    if (!userId) {
      throw new AppError("User ID é obrigatório", 400)
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
      log.debug(`[Portal Auth Verify] Portal user not found for auth_user_id: ${userId}`, { error: portalError })
      throw new AppError("Esta conta não tem acesso ao portal do cliente", 403)
    }

    if (!portalUser.is_active) {
      throw new AppError("Sua conta está desativada. Entre em contato com o suporte.", 403)
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
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalAuthVerify")
  }
}
