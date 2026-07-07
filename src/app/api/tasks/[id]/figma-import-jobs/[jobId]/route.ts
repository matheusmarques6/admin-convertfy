/**
 * GET /api/tasks/[id]/figma-import-jobs/[jobId]
 *
 * Status/progresso de um job da fila de imports do Figma (Telas 1 e 2). Os
 * modais fazem polling aqui após o POST de enqueue. O filtro por
 * suggestion_id (source da task) é a autorização: job de outra campanha
 * responde 404.
 */

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { getFigmaImportJob } from "@/lib/services/figma-import-queue.service"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const { id, jobId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "work")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const job = await getFigmaImportJob(jobId, source_id)
    if (!job) {
      throw new AppError("Job de import não encontrado", 404)
    }

    return successResponse(request, {
      id: job.id,
      kind: job.kind,
      status: job.status,
      progress_total: job.progress_total,
      progress_done: job.progress_done,
      result: job.result,
      error: job.error,
      created_at: job.created_at,
      updated_at: job.updated_at,
    })
  } catch (error) {
    return errorResponse(request, error, "tasks:figma-import-jobs:get")
  }
}
