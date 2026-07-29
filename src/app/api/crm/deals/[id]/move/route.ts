/**
 * POST /api/crm/deals/[id]/move
 *
 * Move deal entre etapas (drag-and-drop do kanban) E entre pipelines.
 * Quando a etapa de destino e `won` ou `lost`, transiciona o status do
 * deal e exige `won_reason` ou `lost_reason` se ainda nao informados.
 *
 * O pipeline do deal e SEMPRE derivado da etapa de destino — nao ha
 * constraint no banco ligando deals.pipeline_id ao pipeline da etapa
 * (so o indice idx_deals_pipeline_stage), entao gravar stage_id de
 * outra pipeline sem ajustar pipeline_id deixaria o deal orfao: sumido
 * de um board sem aparecer no outro.
 *
 * Transferencia entre pipelines exige mesmo `scope` (sales/cs/internal)
 * e NAO dispara automacoes de deal_stage_change — reorganizar pipeline
 * e ato administrativo, nao avanco comercial; disparar mandaria
 * WhatsApp ao cliente durante uma arrumacao interna.
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
import { syncCadenceMove } from "@/lib/services/cs-pipelines-sync.service"

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
    const user = await requireAuth(sb)
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

    // Estado atual do deal — precisa vir ANTES do update pra saber se
    // isto e uma transferencia entre pipelines.
    const { data: currentDeal } = await admin
      .from("deals")
      .select("id, pipeline_id")
      .eq("id", id)
      .maybeSingle()

    if (!currentDeal) {
      throw new AppError("Deal nao encontrado", 404, "not-found")
    }

    const isTransfer = currentDeal.pipeline_id !== targetStage.pipeline_id

    // Transferencia so entre pipelines do mesmo escopo: um deal de
    // `sales` num board de `cs` cai em etapas com outro significado, e
    // a pipeline "Cadencias CS" e sincronizada por
    // cs-pipelines-sync.service (que abandona quando o pipeline_id do
    // deal nao bate) — deal comercial ali quebra a sincronia.
    if (isTransfer) {
      const { data: scopes } = await admin
        .from("pipelines")
        .select("id, name, scope")
        .in("id", [currentDeal.pipeline_id, targetStage.pipeline_id])

      const from = scopes?.find((p) => p.id === currentDeal.pipeline_id)
      const to = scopes?.find((p) => p.id === targetStage.pipeline_id)

      if (!to) {
        throw new AppError("Pipeline de destino nao encontrada", 404, "not-found")
      }
      if (from && from.scope !== to.scope) {
        throw new AppError(
          `Nao e possivel transferir entre escopos diferentes (${from.scope} -> ${to.scope}).`,
          400,
          "scope-mismatch",
        )
      }
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
      pipeline_id: string
      position: number
      status: DealStatusUpdate
      lost_reason?: string | null
      won_reason?: string | null
    } = {
      stage_id: parsed.stage_id,
      // Sempre derivado da etapa — ver docstring.
      pipeline_id: targetStage.pipeline_id,
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

    log.info("[Deals] moved", {
      id,
      to: targetStage.name,
      status: deal?.status,
      transfer: isTransfer
        ? `${currentDeal.pipeline_id} -> ${targetStage.pipeline_id}`
        : undefined,
    })

    // Dispara trigger de automation (fire-and-forget). Pulado em
    // transferencia de pipeline — ver docstring.
    if (deal?.owner_id && !isTransfer) {
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

    // Sync cadencias: se deal for do pipeline "Cadencias CS",
    // atualiza store_cadence_overrides (drag entre frequencias).
    // Fire-and-forget — falha nao bloqueia o move.
    syncCadenceMove({
      dealId: id,
      newStageId: parsed.stage_id,
      movedBy: user.id,
    }).catch(() => {
      /* logado no service */
    })

    return successResponse(request, {
      deal,
      // Deixa o board saber que precisa remover o card (o deal saiu
      // desta pipeline), em vez de so reposicionar.
      transferred: isTransfer,
    })
  } catch (error) {
    log.error("Deal move error:", error)
    return errorResponse(request, error, "crm-deal-move")
  }
}
