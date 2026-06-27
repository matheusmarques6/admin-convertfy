/**
 * GET /api/tasks/[id]/workspace-target
 *
 * Read-only: retorna o workspace target da task sem mutar status.
 * Usado pra reabrir o modal do workspace quando a task já está em
 * progresso (botão "Abrir workspace" no drawer).
 *
 * Se o flow/email ainda não existirem no banco, flowId/emailId vêm null.
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
import { resolveTaskWorkspace } from "@/lib/services/email-task-sync.service"
import { guardOnboardingTask } from "@/lib/api/onboarding-task-access"

const log = logger.child("TaskWorkspaceTarget")

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await guardOnboardingTask(user.id, id, "read")

    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (!orgMember?.org_id) throw new AppError("Acesso negado", 403)

    const admin = createAdminClient()
    const { data: task } = await admin
      .from("tasks")
      .select("id, org_id")
      .eq("id", id)
      .eq("org_id", orgMember.org_id)
      .maybeSingle()
    if (!task) throw new AppError("Tarefa não encontrada", 404)

    const result = await resolveTaskWorkspace(id)
    if (!result.ok) {
      const statusCode =
        result.reason === "task_not_found"
          ? 404
          : result.reason === "no_workspace_target"
            ? 422
            : 400
      return errorResponse(
        request,
        new AppError(`resolve_failed:${result.reason}`, statusCode),
        "task-workspace-target",
      )
    }

    return successResponse(request, {
      target: result.target,
      storeId: result.storeId,
      flowId: result.flowId ?? null,
      emailId: result.emailId ?? null,
    })
  } catch (error) {
    log.error("workspace-target error:", error)
    return errorResponse(request, error, "task-workspace-target")
  }
}
