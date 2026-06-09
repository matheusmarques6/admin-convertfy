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
 * Blocos avançados (OPCIONAIS — só gravam quando presentes, retrocompatível):
 *   - awareness        → icp_awareness (jsonb)
 *   - starving_crowd   → icp_starving_crowd (jsonb)
 *   - unique_mechanism → icp_unique_mechanism (jsonb {headline, body})
 *   - objections       → icp_objections (jsonb [{objection, treatment}])
 *   - vocabulary       → icp_vocabulary (jsonb [{type, channel, quote}])
 *
 * Schema alinhado com PesquisaData (pesquisa-section.tsx, bloco ICP).
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

// Blocos avançados — opcionais para retrocompatibilidade com payloads antigos.
const awarenessSchema = z.object({
  dominant: z.string().min(1).max(60),
  levels: z.array(z.object({
    key: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    pct: z.number().min(0).max(100),
  })).min(2).max(7),
  copy_implication: z.string().min(1).max(2000),
})

const starvingCrowdSchema = z.object({
  verdict: z.string().min(1).max(60),
  scores: z.array(z.object({
    key: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    value: z.number().min(0).max(5),
    note: z.string().max(200),
  })).min(2).max(8),
  total: z.number().min(0).max(20),
})

const uniqueMechanismSchema = z.object({
  headline: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
})

const objectionSchema = z.object({
  objection: z.string().min(1).max(400),
  treatment: z.string().min(1).max(800),
})

const vocabularySchema = z.object({
  type: z.enum(["Dor", "Desejo", "Objeção", "Marca"]),
  channel: z.string().min(1).max(60),
  quote: z.string().min(1).max(400),
})

const schema = z.object({
  store_id: z.string().uuid(),
  persona: personaSchema,
  demographics: demographicsSchema,
  day_in_life: z.string().min(80).max(4000),
  motivations: z.array(z.string().min(2).max(200)).min(2).max(12),
  frictions: z.array(z.string().min(2).max(200)).min(2).max(12),
  // Opcionais (blocos avançados)
  awareness: awarenessSchema.optional(),
  starving_crowd: starvingCrowdSchema.optional(),
  unique_mechanism: uniqueMechanismSchema.optional(),
  objections: z.array(objectionSchema).min(1).max(8).optional(),
  vocabulary: z.array(vocabularySchema).min(1).max(16).optional(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)

    // Base sempre persistida; blocos avançados só quando vierem no payload
    // (evita zerar dados existentes em callbacks que não os incluem).
    const update: Record<string, unknown> = {
      icp_persona: body.persona,
      icp_demographics: body.demographics,
      icp_day_in_life: body.day_in_life,
      icp_motivations: body.motivations,
      icp_frictions: body.frictions,
    }
    if (body.awareness !== undefined) update.icp_awareness = body.awareness
    if (body.starving_crowd !== undefined) update.icp_starving_crowd = body.starving_crowd
    if (body.unique_mechanism !== undefined) update.icp_unique_mechanism = body.unique_mechanism
    if (body.objections !== undefined) update.icp_objections = body.objections
    if (body.vocabulary !== undefined) update.icp_vocabulary = body.vocabulary

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_stores")
      .update(update)
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
