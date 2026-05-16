import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import {
  errorResponse,
  successResponse,
  requireAuth,
  parseAndValidate,
  AppError,
} from "@/lib/api/errors"
import { taskCreateSchema } from "@/lib/schemas/common"
import { logger } from "@/lib/logger"

const log = logger.child("Tasks")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List tasks with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const adminClient = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const type = searchParams.get("type")
    const assigneeId = searchParams.get("assignee_id")
    const clientId = searchParams.get("client_id")
    const storeId = searchParams.get("store_id")
    const priority = searchParams.get("priority")
    const myTasks = searchParams.get("my_tasks") === "true"

    let query = adminClient
      .from("tasks")
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        creator:profiles!tasks_created_by_fkey(id, name, email, avatar_url),
        client:clients(id, name, company),
        store:client_stores(id, store_name, platform),
        task_comments(count)
      `)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (type) query = query.eq("type", type)
    if (assigneeId) query = query.eq("assignee_id", assigneeId)
    if (clientId) query = query.eq("client_id", clientId)
    if (storeId) query = query.eq("store_id", storeId)
    if (priority) query = query.eq("priority", priority)

    // Get current user's org_member_id for "my tasks" filter
    if (myTasks) {
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .single()

      if (orgMember) {
        query = query.eq("assignee_id", orgMember.id)
      }
    }

    const { data: tasks, error } = await query

    if (error) {
      log.error("Error fetching tasks", { error: error.message })
      throw new AppError("Erro ao buscar tarefas", 500)
    }

    // Extract comments_count from the joined count
    const tasksWithCounts = (tasks || []).map((task) => {
      const commentData = task.task_comments as unknown as Array<{ count: number }> | undefined
      const commentsCount = commentData?.[0]?.count ?? 0
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { task_comments: _taskComments, ...rest } = task
      return {
        ...rest,
        comments_count: commentsCount,
      }
    })

    return successResponse(request, { tasks: tasksWithCounts })
  } catch (error) {
    return errorResponse(request, error, "Tasks GET")
  }
}

// POST - Create new task
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await parseAndValidate(request, taskCreateSchema)

    const adminClient = createAdminClient()

    // Get next position for the status
    const { data: lastTask } = await adminClient
      .from("tasks")
      .select("position")
      .eq("status", "pending")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPosition = (lastTask?.position || 0) + 1

    const insertData: Record<string, unknown> = {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      type: body.type,
      priority: body.priority,
      assignee_id: body.assignee_id || null,
      created_by: user.id,
      client_id: body.client_id || null,
      store_id: body.store_id || null,
      due_date: body.due_date || null,
      tags: body.tags || [],
      metadata: body.metadata || {},
      position: nextPosition,
      status: body.status || ("pending" as const),
      // Suporte a tarefas manuais vinculadas a onboarding (Jean cria
      // pra outro user; ganha checklist/deliverables/anexos como
      // tarefas automatizadas, mas marcada como source_type='manual')
      onboarding_id: body.onboarding_id || null,
      operational_column_id: body.operational_column_id || null,
      source_type: body.source_type || null,
    }

    log.info("Creating task", { title: insertData.title, type: insertData.type })

    const { data: task, error: insertError } = await adminClient
      .from("tasks")
      .insert(insertData)
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

    if (insertError) {
      log.error("Task insert failed", {
        error: insertError.message,
        code: insertError.code,
        details: insertError.details,
      })
      throw new AppError("Erro ao criar tarefa: " + insertError.message, 500)
    }

    return successResponse(request, { task }, { status: 201, message: "Tarefa criada com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "Tasks POST")
  }
}
