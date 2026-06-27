import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { guardEmailProductionCompletion } from "@/lib/api/email-production-guard"
import { getTaskAccessContext } from "@/lib/api/onboarding-task-access"
import { attemptOnboardingHandoff } from "@/lib/services/onboarding-task-completion.service"

const log = logger.child("Tasks")

// Campos cuja edicao e privilegiada (somente bypass: admin/dev/coo) quando a
// task pertence a um onboarding. Tasks comuns (sem onboarding_id) mantem o
// comportamento original: qualquer membro da org edita.
const ONBOARDING_ADMIN_FIELDS = [
  "title",
  "type",
  "priority",
  "assignee_id",
  "client_id",
  "store_id",
  "due_date",
  "position",
  "tags",
  "operational_column_id",
  "operational_pipeline_id",
] as const

// Sem cache: mutations frequentes precisam reflectir imediato.
export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single task with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    // Visibilidade por etapa: tasks de onboarding so sao visiveis para a
    // funcao responsavel da etapa atual (bypass enxerga tudo). Tasks comuns
    // seguem inalteradas.
    const access = await getTaskAccessContext(user.id, id)
    if (!access) throw new AppError("Tarefa não encontrada", 404)
    if (access.onboarding && !access.canRead) {
      throw new AppError("Tarefa não encontrada", 404)
    }

    const adminClient = createAdminClient()

    // Fetch task with related data
    const { data: task, error } = await adminClient
      .from("tasks")
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company, email),
        store:client_stores(id, store_name, store_url, platform)
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (error || !task) {
      log.error("[Task] Fetch error:", error)
      throw new AppError("Tarefa não encontrada", 404)
    }

    // Fetch comments
    const { data: comments } = await adminClient
      .from("task_comments")
      .select(`
        *,
        author:profiles(id, name, email, avatar_url)
      `)
      .eq("task_id", id)
      .order("created_at", { ascending: true })

    // Fetch checklists
    const { data: checklists } = await adminClient
      .from("task_checklists")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true })

    // Fetch history
    const { data: history } = await adminClient
      .from("task_history")
      .select(`
        *,
        actor:profiles(id, name, avatar_url)
      `)
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(20)

    return NextResponse.json({
      task: {
        ...task,
        comments: comments || [],
        checklists: checklists || [],
        history: history || [],
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "Tasks")
  }
}

// PUT - Update task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const body = await request.json()

    // Gate de visibilidade/edicao por etapa (apenas tasks de onboarding).
    // Tasks comuns mantem o comportamento original (qualquer membro da org).
    const access = await getTaskAccessContext(user.id, id)
    if (!access) throw new AppError("Tarefa não encontrada", 404)
    if (access.onboarding) {
      if (!access.canRead) throw new AppError("Tarefa não encontrada", 404)
      const touchesAdmin = ONBOARDING_ADMIN_FIELDS.some(
        (field) => body[field] !== undefined,
      )
      if (touchesAdmin && !access.canAdmin) {
        throw new AppError("Sem permissão administrativa nesta task", 403)
      }
      if (!touchesAdmin && !access.canWork) {
        throw new AppError("Sem permissão para trabalhar nesta task", 403)
      }
    }

    const adminClient = createAdminClient()

    // Verify task belongs to user's org + captura estado pre-update
    // pra disparar triggers de automacao quando relevante.
    const { data: existingTask, error: fetchError } = await adminClient
      .from("tasks")
      .select(
        "id, assignee_id, status, operational_pipeline_id, operational_column_id",
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchError || !existingTask) {
      log.error("[Task] PUT fetch failed", {
        taskId: id,
        orgId,
        code: fetchError?.code,
        message: fetchError?.message,
      })
      throw new AppError("Tarefa não encontrada", 404)
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.type !== undefined) updateData.type = body.type
    if (body.status !== undefined) {
      updateData.status = body.status

      // Set started_at when moving to in_progress
      if (body.status === "in_progress") {
        const { data: currentTask } = await adminClient
          .from("tasks")
          .select("started_at")
          .eq("id", id)
          .single()

        if (!currentTask?.started_at) {
          updateData.started_at = new Date().toISOString()
        }
      }

      // Set completed_at when completing
      if (body.status === "completed") {
        // Invariante: completar manualmente uma task de producao de email
        // sem que o(s) email(s) correspondente(s) estejam aprovados quebra
        // a sincronia entre o board e o workspace. Bloqueia com 409.
        const blockedReason = await guardEmailProductionCompletion(
          adminClient,
          id,
        )
        if (blockedReason) {
          throw new AppError(blockedReason, 409)
        }
        updateData.completed_at = new Date().toISOString()
      }
    }
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.assignee_id !== undefined) updateData.assignee_id = body.assignee_id
    if (body.client_id !== undefined) updateData.client_id = body.client_id
    if (body.store_id !== undefined) updateData.store_id = body.store_id
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.position !== undefined) updateData.position = body.position
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.metadata !== undefined) updateData.metadata = body.metadata
    if (body.operational_column_id !== undefined)
      updateData.operational_column_id = body.operational_column_id
    if (body.operational_pipeline_id !== undefined)
      updateData.operational_pipeline_id = body.operational_pipeline_id

    const { data: task, error: updateError } = await adminClient
      .from("tasks")
      .update(updateData)
      .eq("id", id)
      .eq("org_id", orgId)
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company),
        store:client_stores(id, store_name, platform)
      `)
      .single()

    if (updateError) {
      log.error("[Task] Update error:", updateError)
      throw new AppError(
        `Erro ao atualizar tarefa: ${updateError.message || updateError.code || "desconhecido"}`,
        500,
      )
    }

    // --- Onboarding sync (non-blocking) ---
    if (
      task &&
      body.status &&
      task.source_type === "auto_onboarding_step" &&
      !task.metadata?._syncOrigin
    ) {
      try {
        const { OnboardingSyncService } = await import("@/lib/services/onboarding-sync.service")
        await OnboardingSyncService.onTaskStatusChanged(id, body.status)
      } catch (syncErr) {
        log.error("Onboarding sync failed (non-blocking):", syncErr)
      }
    }

    // --- Operational pipeline triggers (non-blocking) ---
    // Dispara automacoes baseadas em diff entre estado anterior e novo:
    // - assignee mudou -> task_assigned
    // - status mudou pra completed -> task_completed
    // - column mudou -> task_moved_to (cobre uso fora do move-task endpoint)
    if (task?.operational_pipeline_id) {
      try {
        const { executeAutomations } = await import(
          "@/lib/services/operational-automation.service"
        )
        const pipelineId = task.operational_pipeline_id as string
        const ctxBase = {
          taskId: task.id as string,
          assigneeId: (task.assignee_id ?? null) as string | null,
          columnId: (task.operational_column_id ?? null) as string | null,
        }
        if (
          body.assignee_id !== undefined &&
          body.assignee_id !== existingTask.assignee_id
        ) {
          void executeAutomations(pipelineId, "task_assigned", ctxBase)
        }
        if (
          body.status === "completed" &&
          existingTask.status !== "completed"
        ) {
          void executeAutomations(pipelineId, "task_completed", ctxBase)
        }
        if (
          body.operational_column_id !== undefined &&
          body.operational_column_id !== existingTask.operational_column_id
        ) {
          void executeAutomations(pipelineId, "task_moved_to", ctxBase)
        }
      } catch (autoErr) {
        log.error("Operational automation trigger failed:", autoErr)
      }
    }

    // --- Auto-handoff de etapa do onboarding ao concluir (non-blocking) ---
    // Quando a ultima task da etapa e concluida, avanca o onboarding e
    // transfere a visibilidade para a proxima funcao responsavel.
    const completedOnboardingId =
      task &&
      body.status === "completed" &&
      existingTask.status !== "completed"
        ? ((task as { onboarding_id?: string | null }).onboarding_id ?? null)
        : null
    if (completedOnboardingId) {
      try {
        await attemptOnboardingHandoff({
          onboardingId: completedOnboardingId,
          actorId: user.id,
        })
      } catch (handoffErr) {
        log.error("Onboarding handoff failed (non-blocking):", handoffErr)
      }
    }

    return successResponse(request, { task, message: "Tarefa atualizada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Tasks")
  }
}

// DELETE - Delete task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    // Excluir task de onboarding e acao administrativa (somente bypass).
    // Tasks comuns mantem o comportamento original.
    const access = await getTaskAccessContext(user.id, id)
    if (!access) throw new AppError("Tarefa não encontrada", 404)
    if (access.onboarding && !access.canAdmin) {
      throw new AppError("Sem permissão administrativa nesta task", 403)
    }

    const adminClient = createAdminClient()

    // Verify task belongs to user's org before deleting
    const { data: existingTask, error: fetchError } = await adminClient
      .from("tasks")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchError || !existingTask) {
      throw new AppError("Tarefa não encontrada", 404)
    }

    const { error: deleteError } = await adminClient
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)

    if (deleteError) {
      log.error("[Task] Delete error:", deleteError)
      throw new AppError("Erro ao excluir tarefa", 500)
    }

    return successResponse(request, { success: true, message: "Tarefa excluída com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Tasks")
  }
}
