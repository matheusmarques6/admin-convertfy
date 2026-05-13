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
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { dispatchTrigger } from "@/lib/services/crm-trigger-dispatcher.service"

const log = logger.child("CrmDealMove")

export const dynamic = "force-dynamic"

const moveSchema = z.object({
  stage_id: uuid(),
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
      throw new AppError("Etapa nao encontrada", 404, "not-found")
    }

    // Calcula nova position se nao foi informada
    let position: number
    if (parsed.position !== undefined) {
      position = parsed.position
    } else {
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
      .select("id, pipeline_id, stage_id, status, owner_id")
      .single()

    if (error) throw error

    log.info("[Deals] moved", { id, to: targetStage.name, status: deal?.status })

    // Dispara trigger de automation (fire-and-forget)
    if (deal?.owner_id) {
      const { data: fullDeal } = await admin
        .from("deals")
        .select(`
          id, pipeline_id, stage_id, owner_id, value, status, source, tags,
          client_id, store_id, lead_id, title,
          owner:profiles!deals_owner_id_fkey (id, name, email),
          client:clients (id, name, email, phone),
          lead:crm_leads!deals_lead_id_fkey (id, name, phone, email)
        `)
        .eq("id", id)
        .single()

      // org_id via membership do owner do deal
      const { data: ownerOrg } = await admin
        .from("org_members")
        .select("org_id")
        .eq("profile_id", deal.owner_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()

      const resolvedOrgId = ownerOrg?.org_id || null

      if (resolvedOrgId) {
        // idempotency_key inclui timestamp pra permitir multiplos
        // disparos quando o deal volta pra mesma stage. Janela de 1
        // minuto pra deduplicar cliques duplos no mesmo move.
        const minuteBucket = Math.floor(Date.now() / 60000)
        dispatchTrigger({
          trigger_type: "deal_stage_change",
          org_id: resolvedOrgId,
          trigger_data: { from_stage_id: undefined, to_stage_id: parsed.stage_id },
          context: {
            trigger_type: "deal_stage_change",
            trigger_data: { to_stage_id: parsed.stage_id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deal: fullDeal as any,
            org_id: resolvedOrgId,
          },
          idempotency_key: `${id}:${parsed.stage_id}:${minuteBucket}`,
        }).catch((err) => log.error("[Deals] dispatch error", err))
      }
    }

    return successResponse(request, { deal })
  } catch (error) {
    log.error("Deal move error:", error)
    return errorResponse(request, error, "crm-deal-move")
  }
}
