/**
 * PATCH  /api/crm/pipelines/[id]/stages/[stageId]
 * DELETE /api/crm/pipelines/[id]/stages/[stageId]
 *
 * Edita ou remove uma etapa do pipeline. Para deletar, se a stage tiver
 * deals, exige `migrate_to_stage_id` no body pra mover os deals.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmPipelineStageDetail")

export const dynamic = "force-dynamic"

const patchStageSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().optional(),
  stage_type: z.enum(["open", "won", "lost", "archived"]).optional(),
  funnel_step: z.enum(["mql", "agendamento", "reuniao", "venda"]).nullable().optional(),
  sla_hours: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  exit_criteria: z.string().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; stageId: string }> },
) {
  try {
    const { id: pipelineId, stageId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchStageSchema.parse(body)

    if (Object.keys(parsed).length === 0) {
      return successResponse(request, { ok: true })
    }

    const { error } = await admin
      .from("pipeline_stages")
      .update(parsed)
      .eq("id", stageId)
      .eq("pipeline_id", pipelineId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Stage patch error:", error)
    return errorResponse(request, error, "crm-stage-patch")
  }
}

const deleteSchema = z.object({
  migrate_to_stage_id: uuid().optional(),
})

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; stageId: string }> },
) {
  try {
    const { id: pipelineId, stageId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    let migrateToStageId: string | undefined
    try {
      const body = await request.json()
      const parsed = deleteSchema.parse(body)
      migrateToStageId = parsed.migrate_to_stage_id
    } catch {
      // Body opcional — pode vir vazio se a stage nao tem deals
    }

    // Garante que ha pelo menos 2 stages no pipeline (nunca deixa zerado)
    const { count: stageCount } = await admin
      .from("pipeline_stages")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", pipelineId)
    if ((stageCount ?? 0) <= 1) {
      throw new AppError(
        "Pipeline precisa ter ao menos 1 etapa. Crie outra etapa antes de remover esta.",
        422,
        "validation-error",
      )
    }

    // Deals nessa stage?
    const { count: dealsCount } = await admin
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId)

    if ((dealsCount ?? 0) > 0) {
      if (!migrateToStageId) {
        throw new AppError(
          `Esta etapa tem ${dealsCount} deal(s). Informe migrate_to_stage_id pra mover antes de excluir.`,
          422,
          "validation-error",
        )
      }
      // Garante que a stage de destino e do mesmo pipeline
      const { data: targetStage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("id", migrateToStageId)
        .eq("pipeline_id", pipelineId)
        .single()
      if (!targetStage) {
        throw new AppError("Etapa de destino invalida", 422, "validation-error")
      }
      const { error: migErr } = await admin
        .from("deals")
        .update({ stage_id: migrateToStageId })
        .eq("stage_id", stageId)
      if (migErr) throw migErr
    }

    const { error } = await admin
      .from("pipeline_stages")
      .delete()
      .eq("id", stageId)
      .eq("pipeline_id", pipelineId)

    if (error) throw error
    return successResponse(request, { ok: true, migrated: dealsCount ?? 0 })
  } catch (error) {
    log.error("Stage delete error:", error)
    return errorResponse(request, error, "crm-stage-delete")
  }
}
