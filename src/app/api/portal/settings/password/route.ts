import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { changePassword, MIN_PASSWORD_LENGTH } from "@/lib/services/auth.service"

const portalPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `A nova senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`),
})

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// PUT - Change portal user password
export async function PUT(request: NextRequest) {
  const limited = checkRateLimit(request, "portal:password", RATE_LIMITS.auth)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Verify portal user
    const { data: portalUser } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const parsed = portalPasswordSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos",
        400
      )
    }

    await changePassword(supabase, user.email!, parsed.data.currentPassword, parsed.data.newPassword)

    return successResponse(request, { success: true })
  } catch (error) {
    return errorResponse(request, error, "PortalSettingsPassword")
  }
}
