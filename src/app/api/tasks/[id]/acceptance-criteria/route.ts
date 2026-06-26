import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "read")
    return successResponse(request, {
      criteria: (access.task.acceptance_criteria as string[] | null) ?? [],
      can_work: access.canWork,
    })
  } catch (error) {
    return errorResponse(request, error, "task-criteria-get")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "work")
    const body = await request.json()
    if (
      !Array.isArray(body.criteria) ||
      !body.criteria.every((item: unknown) => typeof item === "string")
    ) {
      throw new AppError("criteria deve ser um array de strings", 400)
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from("tasks")
      .update({ acceptance_criteria: body.criteria })
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { criteria: body.criteria })
  } catch (error) {
    return errorResponse(request, error, "task-criteria-update")
  }
}
