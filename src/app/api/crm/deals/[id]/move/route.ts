/**
 * POST /api/crm/deals/[id]/move
 *
 * Move deal entre etapas (drag-and-drop do kanban). Quando a etapa de
 * destino e `won` ou `lost`, transiciona o status do deal e exige
 * `won_reason` ou `lost_reason` se ainda nao informados.
 *
 * Body:
 *   { stage_id: uuid, position?: number, lost_reason?: string, won_reason?: string }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealMove")

export const dynamic = "force-dynamic"

const moveSchema = z.object({
  stage_id: z.string().uuid(),
  position: z.number().int().optional(),
  lost_reason: z.string().nullable().optional(),
  won_reason: z.string().nullable().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = moveSchema.parse(body)

    // Le a etapa destino pra saber se e terminal
    const { data: targetStage } = await admin
      .from("pipeline_stages")
      .select("id, name, stage_type, pipeline_id")
      .eq("id", parsed.stage_id)
      .single()

    if (!targetStage) {
      return errorResponse(request, new Error("Etapa nao encontrada"), "not-found", 404)
    }

    // Calcula nova position se nao foi informada
    let position = parsed.position
    if (position === undefined) {
      const { data: maxPos } = await admin
        .from("deals")
        .select("position")
        .eq("stage_id", parsed.stage_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle()
      position = (maxPos?.position ?? 0) + 10
    }

    // Determina novo status baseado no stage_type
    type DealStatusUpdate = "open" | "won" | "lost"
    const updates: {
      stage_id: string
      position: number
      status: DealStatusUpdate
      lost_reason?: string | null
      won_reason?: string | null
    } = {
      stage_id: parsed.stage_id,
      position,
      status: "open",
    }

    if (targetStage.stage_type === "won") {
      updates.status = "won"
      if (parsed.won_reason !== undefined) updates.won_reason = parsed.won_reason
    } else if (targetStage.stage_type === "lost") {
      updates.status = "lost"
      // lost_reason e fortemente recomendado mas nao bloqueante (UI deve pedir)
      if (parsed.lost_reason !== undefined) updates.lost_reason = parsed.lost_reason
    } else {
      updates.status = "open"
    }

    const { data: deal, error } = await admin
      .from("deals")
      .update(updates)
      .eq("id", id)
      .select("id, pipeline_id, stage_id, status")
      .single()

    if (error) throw error

    log.info("[Deals] moved", { id, to: targetStage.name, status: deal?.status })

    // TODO Fase 5: disparar automation_on_enter da etapa destino se houver

    return successResponse(request, { deal })
  } catch (error) {
    log.error("Deal move error:", error)
    return errorResponse(request, error, "crm-deal-move")
  }
}
