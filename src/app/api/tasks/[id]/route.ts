import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Tasks")

async function resolveOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!orgMember?.org_id) {
    throw new AppError("Acesso negado", 403)
  }

  return orgMember.org_id
}

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
    const orgId = await resolveOrgId(supabase, user.id)

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
    const orgId = await resolveOrgId(supabase, user.id)

    const body = await request.json()
    const adminClient = createAdminClient()

    // Verify task belongs to user's org
    const { data: existingTask, error: fetchError } = await adminClient
      .from("tasks")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (fetchError || !existingTask) {
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
      throw new AppError("Erro ao atualizar tarefa", 500)
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
    const orgId = await resolveOrgId(supabase, user.id)

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
