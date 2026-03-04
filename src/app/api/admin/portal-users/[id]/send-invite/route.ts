import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { emailService } from "@/lib/email/email.service"
import { logger } from "@/lib/logger"

const log = logger.child("AdminPortalUsersSendInvite")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// POST - Send or resend invite email to portal user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin/manager
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "coo"].includes(profile.role)) {
      throw new AppError("Acesso negado", 403)
    }

    const { id } = await params

    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("id, auth_user_id, email, name, client_id, login_count")
      .eq("id", id)
      .single()

    if (!portalUser) {
      throw new AppError("Usuário não encontrado", 404)
    }

    // If user already logged in, they should use reset-password instead
    if (portalUser.login_count && portalUser.login_count > 0) {
      throw new AppError(
        "Este usuário já acessou o portal. Use 'Redefinir Senha' em vez de reenviar convite.",
        400
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    // Delete existing auth user by email using SQL function (reliable, no pagination)
    log.info("Deleting auth user by email via RPC", { email: portalUser.email })
    const { error: rpcError } = await adminClient.rpc("delete_auth_user_by_email", {
      target_email: portalUser.email,
    })
    if (rpcError) {
      log.warn("RPC delete_auth_user_by_email failed, trying SDK fallback", {
        error: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
      })
      // Fallback: try deleting by saved auth_user_id
      if (portalUser.auth_user_id) {
        const { error: delError } = await adminClient.auth.admin.deleteUser(portalUser.auth_user_id)
        if (delError) {
          log.warn("SDK deleteUser also failed", { error: delError.message })
        }
      }
    } else {
      log.info("Auth user deleted successfully via RPC")
    }

    // Generate temporary password and create new auth user
    const tempPassword = crypto.randomBytes(6).toString("base64url")

    log.info("Creating auth user with temp password", { email: portalUser.email })
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email: portalUser.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: portalUser.name,
        is_portal_user: true,
        client_id: portalUser.client_id,
      },
    })

    if (createError || !authData?.user) {
      log.error("createUser failed", {
        message: createError?.message,
      })
      throw new AppError(
        `Erro ao recriar conta: ${createError?.message || "Erro desconhecido"}`,
        500
      )
    }

    // Update portal user with new auth_user_id
    const { error: updateError } = await adminClient
      .from("client_portal_users")
      .update({
        auth_user_id: authData.user.id,
        must_change_password: true,
      })
      .eq("id", id)

    if (updateError) {
      log.error("Failed to update portal user, rolling back auth user", { error: updateError.message })
      await adminClient.auth.admin.deleteUser(authData.user.id)
      throw new AppError("Erro ao atualizar usuário do portal", 500)
    }

    // Send welcome email via Resend with portal login link
    await emailService.sendWelcomeWithPassword({
      to: portalUser.email,
      name: portalUser.name,
      email: portalUser.email,
      tempPassword,
      loginUrl: `${appUrl}/portal/login`,
    })

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "invite_sent",
      metadata: {
        sent_by: user.id,
        user_agent: request.headers.get("user-agent"),
      },
    })

    log.info("Invite sent to portal user", {
      portalUserId: portalUser.id,
      email: portalUser.email,
      sentBy: user.id,
    })

    return NextResponse.json(
      {
        success: true,
        message: `Convite enviado para ${portalUser.email}`,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "AdminPortalUsersSendInvite")
  }
}
