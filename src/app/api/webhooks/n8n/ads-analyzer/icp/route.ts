/**
 * POST /api/webhooks/n8n/ads-analyzer/icp
 *
 * Callback do workflow n8n "Analisador de ADS".
 * Persiste demografia + ICP qualitativo inferido pelo AI Agent
 * em client_stores.icp_*.
 *
 * Disparado apenas no branch `full` do workflow (precisa de demografia).
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

const demographicsSchema = z
  .object({
    gender: z
      .object({ male: z.number().min(0).max(100), female: z.number().min(0).max(100) })
      .partial()
      .optional(),
    age: z.record(z.string(), z.number()).optional(),
    countries: z
      .array(z.object({ code: z.string(), pct: z.number() }))
      .optional(),
  })
  .passthrough()
  .nullable()
  .optional()

const personaSchema = z.union([
  z.string().min(80).max(3000),
  z.record(z.string(), z.unknown()),
])

const schema = z.object({
  store_id: z.string().uuid(),
  demographics: demographicsSchema,
  persona_text: personaSchema,
  day_in_life: z.string().min(80).max(3000),
  motivations: z.array(z.string().min(3)).min(3).max(10),
  frictions: z.array(z.string().min(3)).min(3).max(10),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request)
    const body = await parseAndValidate(request, schema)
    const admin = createAdminClient()

    // Lê demografia atual para merge raso (preserva chaves preexistentes)
    const { data: current } = await admin
      .from("client_stores")
      .select("icp_demographics")
      .eq("id", body.store_id)
      .single()

    if (!current) throw new NotFoundError("Loja")

    const mergedDemographics = {
      ...((current.icp_demographics as Record<string, unknown>) ?? {}),
      ...(body.demographics ?? {}),
    }

    // icp_persona é JSONB no schema — aceita string OU objeto, persiste como JSON
    const personaJsonb =
      typeof body.persona_text === "string"
        ? { text: body.persona_text }
        : body.persona_text

    const { error } = await admin
      .from("client_stores")
      .update({
        icp_demographics: mergedDemographics,
        icp_persona: personaJsonb,
        icp_day_in_life: body.day_in_life,
        icp_motivations: body.motivations,
        icp_frictions: body.frictions,
      })
      .eq("id", body.store_id)

    if (error) throw error

    logger.info("[n8n:ads-analyzer/icp] persisted", {
      store_id: body.store_id,
    })

    return successResponse(request, { data: { store_id: body.store_id } })
  } catch (e) {
    return errorResponse(request, e, "n8n:ads-analyzer/icp")
  }
}
