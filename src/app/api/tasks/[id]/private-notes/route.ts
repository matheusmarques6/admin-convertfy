import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksPrivateNotes")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET — só owner/assignee da task lê suas notes (RLS app-layer)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: task, error } = await admin
      .from("tasks")
      .select("id, created_by, assignee_id, private_notes")
      .eq("id", id)
      .maybeSingle()

    if (error || !task) throw new AppError("Task não encontrada", 404)

    // RLS app-layer: só owner/assignee
    const canRead = task.created_by === user.id || task.assignee_id === user.id
    if (!canRead) {
      return successResponse(request, { private_notes: null, can_edit: false })
    }

    return successResponse(request, {
      private_notes: task.private_notes ?? "",
      can_edit: true,
    })
  } catch (error) {
    return errorResponse(request, error, "TasksPrivateNotes")
  }
}

// PATCH — atualiza notes (auto-save com debounce no cliente)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    if (typeof body.private_notes !== "string") {
      throw new AppError("Campo private_notes obrigatório (string)", 400)
    }

    const admin = createAdminClient()
    const { data: task } = await admin
      .from("tasks")
      .select("created_by, assignee_id")
      .eq("id", id)
      .maybeSingle()

    if (!task) throw new AppError("Task não encontrada", 404)

    // RLS app-layer: só owner/assignee pode editar
    const canEdit = task.created_by === user.id || task.assignee_id === user.id
    if (!canEdit) {
      throw new AppError("Apenas owner ou responsável da task pode editar anotações", 403)
    }

    const { error: updateErr } = await admin
      .from("tasks")
      .update({ private_notes: body.private_notes, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (updateErr) {
      log.error("[Private Notes] erro ao salvar", updateErr)
      throw new AppError("Erro ao salvar anotações", 500)
    }

    return successResponse(request, { saved: true })
  } catch (error) {
    return errorResponse(request, error, "TasksPrivateNotes")
  }
}
