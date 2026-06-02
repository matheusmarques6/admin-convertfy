/**
 * GET /api/n8n/email-reference-templates
 *
 * Endpoint público pra consumo do n8n (machine-to-machine). Espelha o GET
 * de `/api/admin/email-reference-templates` mas autentica via header
 * `x-webhook-secret` em vez de cookie de sessão.
 *
 * O n8n não consegue passar cookie de sessão do Supabase, então as rotas
 * `/api/admin/*` retornam 401. Usar essa rota com o mesmo `N8N_WEBHOOK_SECRET`
 * já configurado pro callback `/api/webhooks/n8n/email-copy`.
 *
 * Filtros (query string, todos opcionais):
 *   - flow_type:    welcome | abandoned_cart | browse_abandonment | upsell |
 *                   win_back | site_abandoned | shipping_stages | custom
 *   - email_number: int >= 1 — número do email no flow
 *   - is_active:    true | false
 *
 * Header obrigatório:
 *   x-webhook-secret: <valor de N8N_WEBHOOK_SECRET>
 */

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { logger } from "@/lib/logger"

const log = logger.child("N8nReferenceTemplates")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const admin = createAdminClient()

    const flowType = request.nextUrl.searchParams.get("flow_type")
    const emailNumberRaw = request.nextUrl.searchParams.get("email_number")
    const isActiveRaw = request.nextUrl.searchParams.get("is_active")

    let query = admin
      .from("email_reference_templates")
      .select("*")
      .order("created_at", { ascending: false })

    if (flowType) {
      query = query.eq("flow_type", flowType)
    }

    if (emailNumberRaw !== null && emailNumberRaw !== "") {
      const emailNumber = Number(emailNumberRaw)
      if (Number.isInteger(emailNumber) && emailNumber >= 1) {
        query = query.eq("email_number", emailNumber)
      }
    }

    if (isActiveRaw === "true") {
      query = query.eq("is_active", true)
    } else if (isActiveRaw === "false") {
      query = query.eq("is_active", false)
    }

    const { data, error } = await query
    if (error) throw error

    return successResponse(request, { templates: data ?? [] })
  } catch (error) {
    log.error("get.error", error)
    return errorResponse(request, error, "n8n-ref-templates-get")
  }
}
