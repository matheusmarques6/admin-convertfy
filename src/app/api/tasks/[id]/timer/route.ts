import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// POST /api/tasks/[id]/timer — start/stop do time tracking da task.
// Idempotente: start com timer rodando e stop com timer parado sao no-ops.
// A fonte da verdade e o servidor: timer_started_at marca o inicio da
// sessao corrente e time_spent_seconds acumula o total no stop.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "work")

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
    }
    const action = body.action
    if (action !== "start" && action !== "stop") {
      throw new AppError("action deve ser 'start' ou 'stop'", 400)
    }

    const adminClient = createAdminClient()
    const { data: task, error: fetchError } = await adminClient
      .from("tasks")
      .select("id, time_spent_seconds, timer_started_at")
      .eq("id", id)
      .single()
    if (fetchError || !task) throw new AppError("Tarefa não encontrada", 404)

    const updates: Record<string, unknown> = {}
    if (action === "start") {
      if (!task.timer_started_at) {
        updates.timer_started_at = new Date().toISOString()
      }
    } else if (task.timer_started_at) {
      const elapsedSec = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(task.timer_started_at)) / 1000),
      )
      updates.time_spent_seconds = (task.time_spent_seconds || 0) + elapsedSec
      updates.timer_started_at = null
    }

    let result = task
    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateError } = await adminClient
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select("id, time_spent_seconds, timer_started_at")
        .single()
      if (updateError || !updated) {
        throw new AppError("Erro ao atualizar o timer da tarefa", 500)
      }
      result = updated
    }

    return successResponse(request, {
      time_spent_seconds: result.time_spent_seconds ?? 0,
      timer_started_at: result.timer_started_at ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "task-timer")
  }
}
