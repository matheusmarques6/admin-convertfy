/**
 * POST /api/crm/pipelines/[id]/stages/reorder
 *
 * Atualiza a ordem (campo `order`) de varias stages de uma vez. Aceita
 * um array de { id, order } e aplica via update individual em paralelo.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmStageReorder")

export const dynamic = "force-dynamic"

const reorderSchema = z.object({
  stages: z
    .array(
      z.object({
        id: uuid(),
        order: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(50),
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
    const parsed = reorderSchema.parse(body)

    // Aplica em paralelo. Cada update filtra por pipeline_id como guarda
    // pra nao reordenar stage de outro pipeline acidentalmente.
    const results = await Promise.all(
      parsed.stages.map((s) =>
        admin
          .from("pipeline_stages")
          .update({ order: s.order })
          .eq("id", s.id)
          .eq("pipeline_id", pipelineId),
      ),
    )

    const firstError = results.find((r) => r.error)?.error
    if (firstError) throw firstError

    return successResponse(request, { ok: true, updated: parsed.stages.length })
  } catch (error) {
    log.error("Stage reorder error:", error)
    return errorResponse(request, error, "crm-stage-reorder")
  }
}
