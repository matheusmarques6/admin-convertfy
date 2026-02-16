import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("PortalChangePassword")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Change password for portal user (first login requirement)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autenticado", 401)
    }

    const body = await request.json()
    const { newPassword, confirmPassword } = body

    // Validate passwords
    if (!newPassword || !confirmPassword) {
      throw new AppError("Nova senha e confirmação são obrigatórias", 400)
    }

    if (newPassword !== confirmPassword) {
      throw new AppError("As senhas não coincidem", 400)
    }

    if (newPassword.length < 8) {
      throw new AppError("A senha deve ter no mínimo 8 caracteres", 400)
    }

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await supabase
      .from("client_portal_users")
      .select("id, client_id, login_count")
      .eq("auth_user_id", user.id)
      .single()

    if (portalError || !portalUser) {
      throw new AppError("Usuário não é do portal", 403)
    }

    // Use admin client to update password
    const adminClient = createAdminClient()

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      log.error("[Portal Change Password] Error:", updateError)
      throw new AppError("Erro ao alterar senha", 500)
    }

    // Update portal user to mark password as changed and update login info
    await adminClient
      .from("client_portal_users")
      .update({
        must_change_password: false,
        last_login_at: new Date().toISOString(),
        login_count: (portalUser.login_count || 0) + 1,
      })
      .eq("id", portalUser.id)

    // Log activity
    await supabase.from("client_portal_activity").insert({
      portal_user_id: portalUser.id,
      client_id: portalUser.client_id,
      action: "password_changed",
      metadata: {
        first_login: true,
        user_agent: request.headers.get("user-agent"),
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: "Senha alterada com sucesso",
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalChangePassword")
  }
}
