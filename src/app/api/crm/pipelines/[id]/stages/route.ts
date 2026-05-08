/**
 * POST /api/crm/pipelines/[id]/stages
 *
 * Adiciona uma nova etapa ao pipeline. Order e calculado automaticamente
 * (ultima posicao + 1) caso nao seja informado.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmPipelineStages")

export const dynamic = "force-dynamic"

const createStageSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().optional().default("#71717A"),
  stage_type: z.enum(["open", "won", "lost", "archived"]).default("open"),
  sla_hours: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  exit_criteria: z.string().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: pipelineId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = createStageSchema.parse(body)

    // Garante que pipeline existe
    const { data: pipeline, error: pErr } = await admin
      .from("pipelines")
      .select("id")
      .eq("id", pipelineId)
      .single()
    if (pErr || !pipeline) {
      throw new AppError("Pipeline nao encontrada", 404, "not-found")
    }

    // Calcula order se nao informado
    let order = parsed.order
    if (order == null) {
      const { data: lastStage } = await admin
        .from("pipeline_stages")
        .select("\"order\"")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: false })
        .limit(1)
        .maybeSingle()
      order = (lastStage?.order ?? -1) + 1
    }

    const { data: created, error } = await admin
      .from("pipeline_stages")
      .insert({
        pipeline_id: pipelineId,
        name: parsed.name,
        color: parsed.color,
        order,
        stage_type: parsed.stage_type,
        sla_hours: parsed.sla_hours ?? null,
        description: parsed.description ?? null,
        exit_criteria: parsed.exit_criteria ?? null,
      })
      .select("id, name, color, \"order\", stage_type, sla_hours, description, exit_criteria")
      .single()

    if (error) throw error
    return successResponse(request, { stage: created })
  } catch (error) {
    log.error("Stage create error:", error)
    return errorResponse(request, error, "crm-stage-create")
  }
}
