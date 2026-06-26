import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { startTaskEmailProduction } from "@/lib/services/email-task-sync.service"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "work")
    const result = await startTaskEmailProduction(id)
    if (!result.ok) {
      const status =
        result.reason === "task_not_found"
          ? 404
          : result.reason === "no_workspace_target"
            ? 422
            : 400
      throw new AppError(`start_failed:${result.reason}`, status)
    }

    if (access.task.status === "pending") {
      const admin = createAdminClient()
      await admin
        .from("tasks")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
    }

    return successResponse(request, {
      target: result.target,
      storeId: result.storeId,
      flowId: result.flowId ?? null,
      emailId: result.emailId ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "task-start")
  }
}
