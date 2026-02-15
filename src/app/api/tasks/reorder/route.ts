import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksReorder")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Bulk reorder tasks (for Kanban drag-and-drop)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const body = await request.json()

    // Expected format:
    // { tasks: [{ id: "uuid", status: "pending", position: 0 }, ...] }
    if (!body.tasks || !Array.isArray(body.tasks)) {
      return NextResponse.json(
        { error: "tasks array é obrigatório" },
        { status: 400, headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    const adminClient = createAdminClient()

    // Update each task's position and status
    const updates = body.tasks.map(async (task: { id: string; status?: string; position: number }) => {
      const updateData: Record<string, unknown> = { position: task.position }

      if (task.status) {
        updateData.status = task.status

        // Set started_at when moving to in_progress
        if (task.status === "in_progress") {
          const { data: currentTask } = await adminClient
            .from("tasks")
            .select("started_at")
            .eq("id", task.id)
            .single()

          if (!currentTask?.started_at) {
            updateData.started_at = new Date().toISOString()
          }
        }

        // Set completed_at when completing
        if (task.status === "completed") {
          updateData.completed_at = new Date().toISOString()
        }
      }

      return adminClient
        .from("tasks")
        .update(updateData)
        .eq("id", task.id)
    })

    await Promise.all(updates)

    return NextResponse.json({ success: true, message: "Tarefas reordenadas" }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    log.error("[Tasks Reorder] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
