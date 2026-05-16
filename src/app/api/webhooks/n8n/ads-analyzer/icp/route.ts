/**
 * POST /api/webhooks/n8n/ads-analyzer/icp
 *
 * Callback do n8n com dados de demografia + inferências qualitativas do ICP.
 * Faz MERGE em icp_demographics (preserva chaves preexistentes) e UPDATE
 * direto nos demais campos.
 *
 * Auth: header x-secret == N8N_WEBHOOK_SECRET.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireWebhookSecret } from "@/lib/api/n8n-auth"
import { errorResponse, successResponse, parseAndValidate } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  store_id: z.string().uuid(),
  demographics: z.record(z.string(), z.unknown()).optional().nullable(),
  persona_text: z.string().trim().min(1).optional().nullable(),
  day_in_life: z.string().trim().optional().nullable(),
  motivations: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
  frictions: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    requireWebhookSecret(request, "N8N_WEBHOOK_SECRET", "x-secret")
    const body = await parseAndValidate(request, schema)

    const admin = createAdminClient()

    // Lê demografia atual para fazer merge sem destruir chaves preexistentes
    let mergedDemographics: Record<string, unknown> | null = null
    if (body.demographics) {
      const { data: current } = await admin
        .from("client_stores")
        .select("icp_demographics")
        .eq("id", body.store_id)
        .single()
      const existing = (current?.icp_demographics ?? {}) as Record<string, unknown>
      mergedDemographics = { ...existing, ...body.demographics }
    }

    const update: Record<string, unknown> = {}
    if (mergedDemographics !== null) update.icp_demographics = mergedDemographics
    if (body.persona_text !== undefined && body.persona_text !== null) {
      // icp_persona é jsonb — armazenamos como objeto { text }
      update.icp_persona = { text: body.persona_text }
    }
    if (body.day_in_life !== undefined && body.day_in_life !== null) {
      update.icp_day_in_life = body.day_in_life
    }
    if (body.motivations) update.icp_motivations = body.motivations
    if (body.frictions) update.icp_frictions = body.frictions

    if (Object.keys(update).length === 0) {
      return successResponse(request, { store_id: body.store_id, updated: [] })
    }

    const { error } = await admin
      .from("client_stores")
      .update(update)
      .eq("id", body.store_id)

    if (error) throw error

    return successResponse(request, { store_id: body.store_id, updated: Object.keys(update) })
  } catch (error) {
    return errorResponse(request, error, "ads-analyzer/icp")
  }
}
