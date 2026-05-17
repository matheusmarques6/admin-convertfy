/**
 * POST /api/webhooks/n8n/ads-analyzer/briefing-markdown
 *
 * Callback do workflow n8n. Persiste o markdown completo do briefing
 * (saída final do AI Agent) em store_briefings.
 *
 * Versionamento: arquiva o status='current' anterior e insere o novo
 * como 'current'. Metadados (mode, model, tokens) ficam dentro do
 * JSONB briefing_data já que o schema de store_briefings não tem
 * colunas dedicadas pra eles.
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

const schema = z.object({
  store_id: z.string().uuid(),
  raw_text: z.string().min(200),
  mode: z.enum(["full", "reduced", "reduced-enriched"]),
  generated_at: z.string().datetime().optional(),
  model_used: z.string().optional(),
  tokens_used: z.number().int().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    const admin = createAdminClient()

    const { data: store, error: storeErr } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", body.store_id)
      .single()
    if (storeErr || !store) throw new NotFoundError("Loja")

    const generatedAt = body.generated_at ?? new Date().toISOString()

    // Arquiva versão atual
    const { error: archErr } = await admin
      .from("store_briefings")
      .update({ status: "archived" })
      .eq("store_id", body.store_id)
      .eq("status", "current")
    if (archErr) throw archErr

    // Insere nova como current
    const briefingData = {
      raw_text: body.raw_text,
      mode: body.mode,
      model_used: body.model_used ?? null,
      tokens_used: body.tokens_used ?? null,
    }

    const { data: inserted, error: insErr } = await admin
      .from("store_briefings")
      .insert({
        store_id: body.store_id,
        briefing_data: briefingData,
        generated_at: generatedAt,
        generated_by: "n8n:ads-analyzer",
        status: "current",
      })
      .select("id")
      .single()
    if (insErr) throw insErr

    logger.info("[n8n:ads-analyzer/briefing-markdown] persisted", {
      store_id: body.store_id,
      briefing_id: inserted?.id,
      mode: body.mode,
    })

    return successResponse(request, {
      data: { store_id: body.store_id, briefing_id: inserted?.id },
    })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer/briefing-markdown")
  }
}
