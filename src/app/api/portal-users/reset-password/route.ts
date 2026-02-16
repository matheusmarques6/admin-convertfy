import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateTempPassword } from "@/lib/utils/generate-password"
import {
  errorResponse,
  successResponse,
  requireAuth,
  requireRole,
  parseAndValidate,
  NotFoundError,
  ValidationError,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { uuidSchema } from "@/lib/schemas/common"

const log = logger.child("PortalResetPassword")

const resetPasswordSchema = z.object({
  portal_user_id: uuidSchema,
  new_password: z.string().min(6).optional(),
})

// POST - Reset password for a portal user (admin action)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireRole(supabase, ["admin", "manager", "cs"])

    const body = await parseAndValidate(request, resetPasswordSchema)

    const adminClient = createAdminClient()

    // Get portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select("id, name, auth_user_id, client_id")
      .eq("id", body.portal_user_id)
      .single()

    if (portalError || !portalUser) {
      throw new NotFoundError("Usuário do portal")
    }

    if (!portalUser.auth_user_id) {
      throw new ValidationError("Usuário do portal não possui conta de autenticação")
    }

    const passwordToSet = body.new_password || generateTempPassword()

    // Update the auth user's password
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      portalUser.auth_user_id,
      { password: passwordToSet }
    )

    if (updateAuthError) {
      log.error("Error resetting password", { error: updateAuthError.message })
      throw new AppError("Falha ao resetar a senha", 500)
    }

    // Set must_change_password back to true
    await adminClient
      .from("client_portal_users")
      .update({ must_change_password: true })
      .eq("id", body.portal_user_id)

    return successResponse(request, {
      success: true,
      new_password: passwordToSet,
    }, { message: "Senha resetada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "PortalResetPassword POST")
  }
}
