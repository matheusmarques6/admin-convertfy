import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { logger } from "@/lib/logger"

const log = logger.child("AuthChangePassword")

const changePasswordSchema = z.object({
  new_password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
})

// POST - User changes their own password (for first login password change)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, changePasswordSchema)

    const { error: updateError } = await supabase.auth.updateUser({
      password: body.new_password,
      data: {
        must_change_password: false,
      },
    })

    if (updateError) {
      log.error("Error updating password", { error: updateError.message })
      throw new AppError("Falha ao alterar a senha", 500)
    }

    // Log the activity
    await supabase.from("activities").insert({
      user_id: user.id,
      type: "user_updated",
      description: `Usuário "${user.email}" alterou a senha`,
      metadata: {
        action: "password_changed",
        first_login: true,
      },
    })

    return successResponse(request, { success: true }, { message: "Senha alterada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AuthChangePassword POST")
  }
}
