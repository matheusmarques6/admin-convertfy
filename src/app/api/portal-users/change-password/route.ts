import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  NotFoundError,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { logger } from "@/lib/logger"

const log = logger.child("PortalChangePassword")

const changePasswordSchema = z.object({
  new_password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
})

// POST - Portal user changes their own password
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, changePasswordSchema)

    const adminClient = createAdminClient()

    // Check if this is a portal user
    const { data: portalUser, error: portalError } = await adminClient
      .from("client_portal_users")
      .select("id, client_id, name, auth_user_id")
      .eq("auth_user_id", user.id)
      .single()

    if (portalError || !portalUser) {
      throw new NotFoundError("Usuário do portal")
    }

    // Update the auth user's password
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: body.new_password }
    )

    if (updateAuthError) {
      log.error("Error updating password", { error: updateAuthError.message })
      throw new AppError("Falha ao alterar a senha", 500)
    }

    // Mark must_change_password as false
    const { error: updatePortalError } = await adminClient
      .from("client_portal_users")
      .update({ must_change_password: false })
      .eq("id", portalUser.id)

    if (updatePortalError) {
      log.warn("Error updating must_change_password flag", { error: updatePortalError.message })
    }

    // Log the activity
    await adminClient.from("activities").insert({
      client_id: portalUser.client_id,
      user_id: user.id,
      type: "portal_user_updated",
      description: `Usuário do portal "${portalUser.name}" alterou a senha`,
      metadata: {
        portal_user_id: portalUser.id,
        action: "password_changed",
      },
    })

    return successResponse(request, { success: true }, { message: "Senha alterada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "PortalChangePassword POST")
  }
}
