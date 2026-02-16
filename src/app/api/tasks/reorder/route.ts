import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"


export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// POST - Bulk reorder tasks (for Kanban drag-and-drop)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    // Expected format:
    // { tasks: [{ id: "uuid", status: "pending", position: 0 }, ...] }
    if (!body.tasks || !Array.isArray(body.tasks)) {
      throw new AppError("tasks array é obrigatório", 400)
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

    return successResponse(request, { success: true, message: "Tarefas reordenadas" })
  } catch (error) {
    return errorResponse(request, error, "TasksReorder")
  }
}
