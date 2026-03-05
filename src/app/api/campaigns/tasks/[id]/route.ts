import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignTaskUpdate")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AppError("Não autorizado", 401)
    }

    const { data: orgMember } = await supabase
      .from("org_members")
      .select("id, org_id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Membro não encontrado", 403)
    }

    const adminClient = createAdminClient()

    // Fetch current task
    const { data: task, error: fetchError } = await adminClient
      .from("campaign_generation_tasks")
      .select("id, status, assignee_id, org_id, generation_id, role")
      .eq("id", id)
      .single()

    if (fetchError || !task) {
      throw new AppError("Tarefa não encontrada", 404)
    }

    // Permission: assignee can update own task, owner/manager/coo can update any
    const isAssignee = task.assignee_id === orgMember.id
    const isManager = ["owner", "manager", "coo"].includes(orgMember.role)
    const isAdmin =
      (
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
      ).data?.role === "admin"

    if (!isAssignee && !isManager && !isAdmin) {
      throw new AppError("Sem permissão para atualizar esta tarefa", 403)
    }

    // Build update payload
    const updateData: Record<string, unknown> = {}

    // Handle status change
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        pending: ["in_progress", "skipped"],
        in_progress: ["completed", "skipped"],
      }

      const allowed = validTransitions[task.status]
      if (!allowed || !allowed.includes(body.status)) {
        throw new AppError(
          `Transição de '${task.status}' para '${body.status}' não é permitida`,
          400
        )
      }

      updateData.status = body.status

      if (body.status === "in_progress" && !task.assignee_id) {
        updateData.started_at = new Date().toISOString()
      }

      if (body.status === "completed" || body.status === "skipped") {
        updateData.completed_at = new Date().toISOString()
        updateData.completed_by = orgMember.id
      }
    }

    // Handle assignment
    if (body.assignee_id !== undefined) {
      if (!isManager && !isAdmin) {
        throw new AppError("Apenas gestores podem reatribuir tarefas", 403)
      }
      updateData.assignee_id = body.assignee_id
    }

    // Handle notes
    if (body.notes !== undefined) {
      updateData.notes = body.notes
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError("Nenhum campo para atualizar", 400)
    }

    const { data: updated, error: updateError } = await adminClient
      .from("campaign_generation_tasks")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        id, generation_id, role, assignee_id, status,
        started_at, completed_at, completed_by, notes, updated_at
      `
      )
      .single()

    if (updateError) {
      log.error("Failed to update task", updateError)
      throw new AppError("Erro ao atualizar tarefa", 500)
    }

    // If task completed/skipped, check if all tasks are done (trigger handles generation status)
    // Notify COO if all tasks completed
    if (
      body.status === "completed" ||
      body.status === "skipped"
    ) {
      const { data: allTasks } = await adminClient
        .from("campaign_generation_tasks")
        .select("status")
        .eq("generation_id", task.generation_id)

      const allDone = allTasks?.every(
        (t) => t.status === "completed" || t.status === "skipped"
      )

      if (allDone) {
        // Get the generation's approved_by to notify the COO
        const { data: generation } = await adminClient
          .from("campaign_generations")
          .select("approved_by")
          .eq("id", task.generation_id)
          .single()

        if (generation?.approved_by) {
          const { data: approver } = await adminClient
            .from("org_members")
            .select("profile_id")
            .eq("id", generation.approved_by)
            .single()

          if (approver?.profile_id) {
            await adminClient.from("notifications").insert({
              user_id: approver.profile_id,
              title: "Todas as tarefas concluídas",
              body: "Todas as tarefas da geração de campanha foram finalizadas.",
              type: "success",
              link: "/campaigns?view=copy",
              metadata: {
                generation_id: task.generation_id,
                event: "all_tasks_completed",
              },
            })
          }
        }
      }
    }

    log.info(`Task ${id} updated by ${user.id}`, { status: body.status })

    return successResponse(request, { task: updated })
  } catch (error) {
    return errorResponse(request, error, "CampaignTaskUpdate")
  }
}
