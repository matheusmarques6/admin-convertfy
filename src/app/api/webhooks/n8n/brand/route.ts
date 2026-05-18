/**
 * POST /api/webhooks/n8n/brand
 *
 * Callback do n8n que popula a área "01 Perfil da Marca" da Pesquisa.
 * Persiste 4 campos em `client_stores`:
 *   - thesis   → brand_thesis (text — pull-quote)
 *   - about    → brand_about (text — parágrafos)
 *   - pillars  → brand_pillars (jsonb — 3 tiles)
 *   - presence → brand_presence (text — opcional)
 *
 * Auth: header `x-webhook-secret` == N8N_WEBHOOK_SECRET
 * UI:   src/components/stores/v2/pesquisa/pesquisa-section.tsx (área 01)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import {
  errorResponse,
  successResponse,
  parseAndValidate,
  NotFoundError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const pillarSchema = z.object({
  number: z.string().min(1).max(4),
  label: z.string().min(1).max(60),
  text: z.string().min(1).max(500),
})

const schema = z.object({
  store_id: z.string().uuid(),
  thesis: z.string().min(10).max(500),
  about: z.string().min(40).max(4000),
  pillars: z.array(pillarSchema).length(3),
  presence: z.string().max(2000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        brand_thesis: body.thesis,
        brand_about: body.about,
        brand_pillars: body.pillars,
        brand_presence: body.presence ?? null,
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:brand] persisted", { store_id: body.store_id })
    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:brand")
  }
}
