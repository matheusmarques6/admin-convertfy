import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("RitualApproveTasks")

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

interface TaskInput {
  title: string
  store_id: string
  assignee_id?: string | null
  due_date?: string | null
  priority: "low" | "medium" | "high"
  origin_quote?: string | null
}

function thisMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/**
 * POST /api/ritual/sessions/[sessionId]/approve-tasks
 *
 * Aprova tasks geradas pela IA e:
 * 1. Cria tasks reais na tabela `tasks`
 * 2. Move lojas para Etapa 2 (Em otimização) no weekly_pipeline_states
 * 3. Marca sessão como completed
 *
 * Body: { tasks: TaskInput[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const body = await request.json()
    const tasks = body.tasks as TaskInput[]
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new AppError("tasks obrigatório (array não vazio)", 400)
    }

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const { data: session } = await admin
      .from("ritual_sessions")
      .select("id, org_id, store_ids")
      .eq("id", sessionId)
      .maybeSingle()
    if (!session) throw new AppError("Sessão não encontrada", 404)

    let createdCount = 0
    let errorCount = 0
    const storeIds = new Set<string>()
    const validTasks = tasks.filter((t) => t.title && t.store_id)
    for (const t of validTasks) storeIds.add(t.store_id)

    const clientIdMap = new Map<string, string | null>()
    if (storeIds.size > 0) {
      const { data: stores } = await admin
        .from("client_stores")
        .select("id, client_id")
        .in("id", Array.from(storeIds))
      for (const s of (stores ?? []) as Array<{ id: string; client_id: string | null }>) {
        clientIdMap.set(s.id, s.client_id)
      }
    }

    const orgId = (member as { org_id: string }).org_id
    const taskRows = validTasks.map((task) => ({
      org_id: orgId,
      title: task.title,
      description: task.origin_quote || null,
      type: "general" as const,
      status: "pending" as const,
      priority: task.priority || ("medium" as const),
      assignee_id: task.assignee_id || null,
      created_by: user.id,
      store_id: task.store_id,
      client_id: clientIdMap.get(task.store_id) ?? null,
      due_date: task.due_date || null,
      source_type: "manual" as const,
      metadata: {
        origin: "ritual",
        ritual_session_id: sessionId,
        origin_quote: task.origin_quote || null,
      },
    }))

    if (taskRows.length > 0) {
      const { error } = await admin.from("tasks").insert(taskRows)
      if (error) {
        log.error("Falha ao criar tasks em batch", { error: error.message, count: taskRows.length })
        errorCount = taskRows.length
      } else {
        createdCount = taskRows.length
      }
    }

    const week = thisMonday()
    let movedCount = 0
    for (const storeId of storeIds) {
      const { error } = await admin
        .from("weekly_pipeline_states")
        .update({
          current_stage: 2,
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq("store_id", storeId)
        .eq("week_start", week)
        .eq("is_active", true)

      if (!error) movedCount++
    }

    await admin
      .from("ritual_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)

    log.info("[ApproveTasks] concluido", {
      sessionId,
      tasksCreated: createdCount,
      tasksErrors: errorCount,
      storesMoved: movedCount,
    })

    return successResponse(request, {
      tasks_created: createdCount,
      tasks_errors: errorCount,
      stores_moved: movedCount,
      stores_affected: storeIds.size,
    })
  } catch (error) {
    return errorResponse(request, error, "RitualApproveTasks")
  }
}
