import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { resolveTaskWorkspace } from "@/lib/services/email-task-sync.service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "read")
    const result = await resolveTaskWorkspace(id)
    if (!result.ok) {
      const status =
        result.reason === "task_not_found"
          ? 404
          : result.reason === "no_workspace_target"
            ? 422
            : 400
      throw new AppError(`resolve_failed:${result.reason}`, status)
    }
    return successResponse(request, {
      target: result.target,
      storeId: result.storeId,
      flowId: result.flowId ?? null,
      emailId: result.emailId ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "task-workspace-target")
  }
}
