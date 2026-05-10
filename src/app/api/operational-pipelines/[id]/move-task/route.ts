/**
 * PATCH /api/operational-pipelines/[id]/move-task
 *
 * Move uma task pra outra coluna do pipeline. Atualiza
 * operational_column_id (e position se fornecido) e dispara
 * automacoes do trigger task_moved_to.
 *
 * Body: { task_id: string, column_id: string, position?: number }
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { executeAutomations } from "@/lib/services/operational-automation.service"
import type { OperationalColumn } from "@/types/operational-pipeline"

const log = logger.child("OperationalMoveTask")
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const isUuid = UUID_RE.test(id)
    const pq = admin
      .from("operational_pipelines")
      .select("id, columns, automations")
      .eq("org_id", orgId)
      .eq("is_active", true)
    const { data: pipeline } = isUuid
      ? await pq.eq("id", id).maybeSingle()
      : await pq.eq("slug", id).maybeSingle()
    if (!pipeline) throw new AppError("Pipeline nao encontrada", 404)

    const body = await request.json()
    if (!body.task_id || !body.column_id) {
      throw new AppError("task_id e column_id sao obrigatorios", 400)
    }

    const cols = (pipeline.columns ?? []) as OperationalColumn[]
    if (!cols.some((c) => c.id === body.column_id)) {
      throw new AppError("Coluna nao pertence a esta pipeline", 400)
    }

    const updatePatch: Record<string, unknown> = {
      operational_column_id: body.column_id,
    }
    if (typeof body.position === "number") updatePatch.position = body.position

    const { data: task, error } = await admin
      .from("tasks")
      .update(updatePatch)
      .eq("id", body.task_id)
      .eq("operational_pipeline_id", pipeline.id)
      .select("*")
      .single()
    if (error) throw error
    if (!task) throw new AppError("Task nao encontrada", 404)

    // Dispara automacoes
    void executeAutomations(pipeline.id, "task_moved_to", {
      taskId: task.id,
      assigneeId: task.assignee_id,
      columnId: body.column_id,
    })

    // Se a task foi movida pra coluna 'won' ou 'completed' tipo (mas
    // no nosso schema nao temos stage_type), checar via nome heuristico.
    const targetCol = cols.find((c) => c.id === body.column_id)
    if (
      targetCol &&
      /(conclu|fech|deploy|resolv|tomada|live)/i.test(targetCol.name)
    ) {
      void executeAutomations(pipeline.id, "task_completed", {
        taskId: task.id,
        assigneeId: task.assignee_id,
        columnId: body.column_id,
      })
    }

    return successResponse(request, { task })
  } catch (error) {
    log.error("Move error", error)
    return errorResponse(request, error, "operational-move-task")
  }
}
