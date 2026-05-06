/**
 * POST /api/crm/stores/[id]/nps
 *
 * Registra uma resposta de NPS (0-10) para uma loja. Atualiza:
 * - client_stores.nps_last_score
 * - client_stores.nps_last_at
 *
 * Tambem cria activity em qualquer deal aberto da loja no pipeline
 * "Feedback Mensal" pra registrar a resposta na timeline.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmNps")

export const dynamic = "force-dynamic"

const npsSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).nullable().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = npsSchema.parse(body)

    const now = new Date().toISOString()

    // Atualiza loja
    const { error: storeErr } = await admin
      .from("client_stores")
      .update({
        nps_last_score: parsed.score,
        nps_last_at: now,
      })
      .eq("id", id)

    if (storeErr) throw storeErr

    // Anota em qualquer deal aberto no pipeline "Feedback Mensal" desta loja
    const { data: feedbackPipeline } = await admin
      .from("pipelines")
      .select("id")
      .eq("scope", "cs")
      .ilike("name", "%Feedback%")
      .eq("is_archived", false)
      .maybeSingle()

    if (feedbackPipeline) {
      const { data: deals } = await admin
        .from("deals")
        .select("id")
        .eq("pipeline_id", feedbackPipeline.id)
        .eq("store_id", id)
        .eq("status", "open")

      const category = parsed.score >= 9 ? "Promotor" : parsed.score >= 7 ? "Passivo" : "Detrator"
      const content = `NPS recebido: ${parsed.score}/10 (${category})${parsed.comment ? ` — "${parsed.comment}"` : ""}`

      for (const deal of deals || []) {
        await admin.from("crm_deal_activities").insert({
          deal_id: deal.id,
          type: "system",
          content,
          created_by: user.id,
          is_internal: true,
        })
      }
    }

    log.info("[NPS] recorded", { store_id: id, score: parsed.score })
    return successResponse(request, { ok: true, score: parsed.score, recorded_at: now })
  } catch (error) {
    log.error("NPS post error:", error)
    return errorResponse(request, error, "crm-nps")
  }
}
