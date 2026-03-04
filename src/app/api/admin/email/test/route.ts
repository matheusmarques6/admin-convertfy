import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireRole, parseAndValidate } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { emailService, EmailConfigError } from "@/lib/email"
import { z } from "zod"
import { logger } from "@/lib/logger"

const log = logger.child("AdminEmailTest")

const testEmailSchema = z.object({
  to: z.string().email("Email inválido"),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireRole(supabase, ["admin", "manager"])

    const body = await parseAndValidate(request, testEmailSchema)

    if (!emailService.isConfigured()) {
      throw new EmailConfigError("RESEND_API_KEY não configurada. Configure a variável de ambiente.")
    }

    const startTime = Date.now()
    const result = await emailService.sendTestEmail(body.to)
    const duration = Date.now() - startTime

    log.info("Email de teste enviado com sucesso", {
      to: body.to,
      resendId: result.id,
      durationMs: duration,
    })

    return successResponse(request, {
      resend_id: result.id,
      to: body.to,
      duration_ms: duration,
      config: {
        from_email: process.env.RESEND_FROM_EMAIL || "noreply@convertfy.com",
        from_name: process.env.RESEND_FROM_NAME || "Convertfy",
      },
    }, { message: "Email de teste enviado com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminEmailTest")
  }
}
