/**
 * POST /api/tasks/[id]/start
 *
 * Inicia uma task de produção de email:
 *  1. Resolve o workspace target via slug (4 pilotos 1:1, 5 flows 1:N,
 *     ou checkbox-only para tasks de estudo).
 *  2. Garante email_flow + email_flow_emails no banco (idempotente).
 *  3. Sobe task.status pending → in_progress.
 *  4. Retorna { target, storeId, flowId?, emailId? } pro drawer abrir
 *     o modal apontando pro lugar certo.
 *
 * Tasks com slug não-mapeado retornam 422 (no_workspace_target).
 */

import { NextRequest } from "next/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { startTaskEmailProduction } from "@/lib/services/email-task-sync.service"

const log = logger.child("TaskStart")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const admin = createAdminClient()

    // Verifica que a task pertence à org do user
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!orgMember?.org_id) throw new AppError("Acesso negado", 403)

    const { data: task } = await admin
      .from("tasks")
      .select("id, status, slug, org_id")
      .eq("id", id)
      .eq("org_id", orgMember.org_id)
      .maybeSingle()
    if (!task) throw new AppError("Tarefa não encontrada", 404)

    // Resolve target e garante linhas no workspace (idempotente)
    const result = await startTaskEmailProduction(id)
    if (!result.ok) {
      const statusCode =
        result.reason === "task_not_found"
          ? 404
          : result.reason === "no_workspace_target"
            ? 422
            : 400
      return errorResponse(
        request,
        new AppError(`start_failed:${result.reason}`, statusCode),
        "task-start",
      )
    }

    // Sobe task.status pending → in_progress se ainda não estava
    if (task.status === "pending") {
      await admin
        .from("tasks")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
    }

    log.info("task started", { taskId: id, kind: result.target.kind })
    return successResponse(request, {
      target: result.target,
      storeId: result.storeId,
      flowId: result.flowId ?? null,
      emailId: result.emailId ?? null,
    })
  } catch (error) {
    log.error("task start error:", error)
    return errorResponse(request, error, "task-start")
  }
}
