/**
 * PATCH /api/tasks/[id]/campaign-images/results
 *   { batch_id, store_id, adjustment_notes? } — regera UMA loja de um lote.
 *
 * Cobre "Regerar com ajuste" (com adjustment_notes) e "Tentar de novo"
 * (sem notes). Acesso é o da própria task de campanha (requireTaskAccess work).
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { regenerateResult } from "@/lib/services/campaign-central/campaign-image-generation.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const patchSchema = z.object({
  batch_id: z.string().uuid(),
  store_id: z.string().uuid(),
  adjustment_notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const body = await parseAndValidate(request, patchSchema)
    const result = await regenerateResult(
      body.batch_id,
      ctx.member.orgId,
      body.store_id,
      body.adjustment_notes ?? null,
    )
    return successResponse(request, { result })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-images:results")
  }
}
