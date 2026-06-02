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
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse } from "@/lib/api/errors"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { logger } from "@/lib/logger"

const log = logger.child("N8nReferenceTemplates")

export const dynamic = "force-dynamic"

const imageMapEntrySchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  type: z.enum(["logo", "product", "hero", "icon", "decorative", "custom"]),
  product_index: z.number().optional(),
  instruction: z.string().nullable().optional(),
  image_prompt: z.string().nullable().optional(),
})

const postSchema = z.object({
  flow_type: z.string().optional().nullable(),
  email_number: z.number().int().min(1).optional().nullable(),
  name: z.string().min(1),
  html: z.string().optional().nullable(),
  copy: z.string().optional().nullable(),
  image_map: z.array(imageMapEntrySchema).optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
})

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

/**
 * POST /api/n8n/email-reference-templates
 *
 * Cria uma nova reference template. Espelha o POST admin mas autentica
 * via header `x-webhook-secret`. Campos obrigatórios: apenas `name`.
 * Todos os outros (incluindo `copy`, `html`, `flow_type`, `email_number`)
 * são opcionais — campos vazios podem vir como null ou ser omitidos.
 *
 * Retorna 201 com o template criado.
 */
export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = postSchema.parse(body)

    const { data, error } = await admin
      .from("email_reference_templates")
      .insert(parsed)
      .select("*")
      .single()

    if (error) throw error

    log.info("post.ok", {
      id: data?.id,
      flow_type: parsed.flow_type,
      email_number: parsed.email_number,
      name: parsed.name,
    })

    return successResponse(request, { template: data }, { status: 201 })
  } catch (error) {
    log.error("post.error", error)
    return errorResponse(request, error, "n8n-ref-templates-post")
  }
}
