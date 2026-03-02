import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateTempPassword } from "@/lib/utils/generate-password"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { emailService } from "@/lib/email"

const log = logger.child("AdminPortalUsersResetPassword")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Reset password for portal user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["admin", "manager", "coo"].includes(profile.role)) {
      throw new AppError("Acesso negado", 403)
    }

    const { id } = await params

    // Get portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("auth_user_id, email, name")
      .eq("id", id)
      .single()

    if (!portalUser?.auth_user_id) {
      throw new AppError("Usuário não encontrado", 404)
    }

    // Generate new temporary password
    const tempPassword = generateTempPassword()

    // Use admin client for auth operations (requires service role key)
    const adminClient = createAdminClient()

    // Update password in Supabase Auth
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      portalUser.auth_user_id,
      { password: tempPassword }
    )

    if (updateError) {
      log.error("[Portal Users] Password reset error:", updateError)
      throw new AppError("Erro ao redefinir senha", 500)
    }

    // Set must_change_password flag so user is required to change password on login
    await adminClient
      .from("client_portal_users")
      .update({ must_change_password: true })
      .eq("id", id)

    // Send password reset notification email (non-blocking)
    if (portalUser.email) {
      try {
        await emailService.sendPasswordResetNotification({
          to: portalUser.email,
          name: portalUser.name || "Usuário",
          tempPassword,
        })
        log.info("Password reset email sent", { email: portalUser.email })
      } catch (emailError) {
        log.warn("Failed to send password reset email", {
          email: portalUser.email,
          error: (emailError as Error).message,
        })
      }
    }

    return NextResponse.json(
      {
        message: "Senha redefinida com sucesso",
        tempPassword,
        userEmail: portalUser.email,
        userName: portalUser.name,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "AdminPortalUsersResetPassword")
  }
}

