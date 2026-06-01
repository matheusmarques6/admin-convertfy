/**
 * GET /api/email-reference-templates/[id]
 *
 * Endpoint publico (auth via x-webhook-secret) que retorna o template de
 * referencia completo (copy + html). Usado pelo n8n apos receber o webhook
 * de dispatch — o payload agora carrega so `reference: { id, name }` e
 * o n8n busca o conteudo aqui quando precisa.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("EmailReferenceTemplate")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireWebhookSecret(request)
    const { id } = await context.params

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_reference_templates")
      .select("id, flow_type, email_number, name, copy, html")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      log.error("template.query_failed", { id, error: error.message })
      return NextResponse.json({ error: "query_failed" }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    return errorResponse(request, e, "email-reference-template:get")
  }
}
