/**
 * POST /api/webhooks/n8n/icp
 *
 * Callback do n8n que popula a área "03 Cliente Ideal" da Pesquisa.
 * Persiste em `client_stores`:
 *   - persona       → icp_persona (jsonb — objeto fixo)
 *   - demographics  → icp_demographics (jsonb — qualitativa)
 *   - day_in_life   → icp_day_in_life (text — parágrafos)
 *   - motivations   → icp_motivations (text[])
 *   - frictions     → icp_frictions (text[])
 *
 * Schema alinhado com PesquisaData (pesquisa-section.tsx:67-78).
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

const personaSchema = z.object({
  name: z.string().min(1).max(60),
  age: z.string().min(1).max(40),
  city: z.string().min(1).max(80),
  monogram: z.string().min(1).max(4),
})

const demographicsSchema = z.object({
  age_range: z.string().min(1).max(60),
  income: z.string().min(1).max(60),
  education: z.string().min(1).max(80),
  occupation: z.string().min(1).max(120),
  religion: z.string().min(1).max(60),
})

const schema = z.object({
  store_id: z.string().uuid(),
  persona: personaSchema,
  demographics: demographicsSchema,
  day_in_life: z.string().min(80).max(4000),
  motivations: z.array(z.string().min(2).max(200)).min(2).max(12),
  frictions: z.array(z.string().min(2).max(200)).min(2).max(12),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update({
        icp_persona: body.persona,
        icp_demographics: body.demographics,
        icp_day_in_life: body.day_in_life,
        icp_motivations: body.motivations,
        icp_frictions: body.frictions,
      })
      .eq("id", body.store_id)
      .select("id")
      .single()

    if (error) throw error
    if (!data) throw new NotFoundError("Loja")

    logger.info("[n8n:icp] persisted", { store_id: body.store_id })
    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:icp")
  }
}
