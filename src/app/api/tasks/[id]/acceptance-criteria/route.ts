import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { guardOnboardingTask } from "@/lib/api/onboarding-task-access"

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

    const admin = createAdminClient()
    const { data: task, error } = await admin
      .from("tasks")
      .select("id, acceptance_criteria")
      .eq("id", id)
      .maybeSingle()

    if (error || !task) throw new AppError("Task não encontrada", 404)

    return successResponse(request, {
      criteria: (task.acceptance_criteria as string[]) ?? [],
    })
  } catch (error) {
    return errorResponse(request, error, "TasksAcceptanceCriteria")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await guardOnboardingTask(user.id, id, "work")

    const body = await request.json()
    if (!Array.isArray(body.criteria) || !body.criteria.every((c: unknown) => typeof c === "string")) {
      throw new AppError("Campo criteria deve ser array de strings", 400)
    }

    const admin = createAdminClient()
    const { error: updateErr } = await admin
      .from("tasks")
      .update({
        acceptance_criteria: body.criteria,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateErr) throw new AppError("Erro ao salvar critérios", 500)

    return successResponse(request, { criteria: body.criteria })
  } catch (error) {
    return errorResponse(request, error, "TasksAcceptanceCriteria")
  }
}
