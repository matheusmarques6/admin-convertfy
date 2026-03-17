import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { z } from "zod"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { MIN_PASSWORD_LENGTH } from "@/lib/services/auth.service"
import { logger } from "@/lib/logger"

const log = logger.child("AuthChangePassword")

const changePasswordSchema = z.object({
  new_password: z.string().min(MIN_PASSWORD_LENGTH, `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`),
})

// POST - First-login password change only (must_change_password guard)
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "auth:change-password", { ...RATE_LIMITS.auth, failClosed: true })
  if (limited) return limited

  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) throw new AppError("Não autorizado", 401)

    // Guard: only allow when must_change_password is true
    const mustChange = authUser.user_metadata?.must_change_password
    if (!mustChange) {
      throw new AppError("Este endpoint é exclusivo para primeiro login", 403)
    }

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
      user_id: authUser.id,
      type: "user_updated",
      description: `Usuário "${authUser.email}" alterou a senha`,
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
