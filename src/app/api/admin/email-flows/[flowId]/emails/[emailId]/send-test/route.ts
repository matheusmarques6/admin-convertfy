/**
 * POST /api/admin/email-flows/[flowId]/emails/[emailId]/send-test
 *   Envia o email renderizado pra um endereco real via Resend.
 *   Body: { to: string }
 *
 *   Re-renderiza o HTML server-side a partir dos blocos (nao confia em
 *   HTML enviado pelo client) para evitar abuse da rota.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { emailService, EmailConfigError } from "@/lib/email"
import { renderEmailHtml } from "@/lib/email-workspace/render-html"
import { logger } from "@/lib/logger"

const log = logger.child("EmailSendTest")

export const dynamic = "force-dynamic"

const schema = z.object({
  to: z.string().email("Email invalido"),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ flowId: string; emailId: string }> },
) {
  try {
    const { emailId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { to } = await parseAndValidate(request, schema)

    const { data: email, error: emailErr } = await admin
      .from("email_flow_emails")
      .select("*")
      .eq("id", emailId)
      .single()
    if (emailErr || !email) {
      return errorResponse(
        request,
        new Error("Email nao encontrado"),
        "send-test-not-found",
      )
    }

    const { data: blocks } = await admin
      .from("email_blocks")
      .select("*")
      .eq("email_id", emailId)
      .order("position", { ascending: true })

    if (!emailService.isConfigured()) {
      throw new EmailConfigError(
        "RESEND_API_KEY nao configurada. Configure a variavel de ambiente.",
      )
    }

    const html = renderEmailHtml(email, blocks ?? [])
    const subject = `[TESTE] ${email.subject ?? email.name}`

    const result = await emailService.send({
      to,
      subject,
      html,
    })

    log.info("Email de teste enviado", {
      emailId,
      to,
      resendId: result.id,
    })

    return successResponse(request, {
      ok: true,
      resend_id: result.id,
      to,
    })
  } catch (error) {
    log.error("Send test error:", error)
    return errorResponse(request, error, "send-test")
  }
}
