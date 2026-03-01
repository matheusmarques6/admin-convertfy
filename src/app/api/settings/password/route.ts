import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { changePassword, MIN_PASSWORD_LENGTH } from "@/lib/services/auth.service"

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Senha atual é obrigatória"),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  })

// PUT - Change admin/agent password
export async function PUT(request: NextRequest) {
  const limited = checkRateLimit(request, "settings:password", RATE_LIMITS.auth)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const parsed = passwordChangeSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos",
        400
      )
    }

    await changePassword(
      supabase,
      user.email!,
      parsed.data.currentPassword,
      parsed.data.newPassword
    )

    return successResponse(request, { success: true }, { message: "Senha alterada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminSettingsPassword")
  }
}
