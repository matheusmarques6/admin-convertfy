import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("TasksChecklists")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get checklists for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const adminClient = createAdminClient()

    const { data: checklists, error } = await adminClient
      .from("task_checklists")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true })

    if (error) {
      log.error("[Task Checklists] Error fetching:", error)
      throw new AppError("Erro ao buscar checklists", 500)
    }

    return successResponse(request, { checklists: checklists || [] })
  } catch (error) {
    return errorResponse(request, error, "TasksChecklists")
  }
}

// POST - Add checklist item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()

    if (!body.title) {
      throw new AppError("Título é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Get next position
    const { data: lastItem } = await adminClient
      .from("task_checklists")
      .select("position")
      .eq("task_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPosition = (lastItem?.position || 0) + 1

    const { data: checklist, error: insertError } = await adminClient
      .from("task_checklists")
      .insert({
        task_id: id,
        title: body.title,
        position: nextPosition,
      })
      .select()
      .single()

    if (insertError) {
      log.error("[Task Checklists] Insert error:", insertError)
      throw new AppError("Erro ao adicionar item", 500)
    }

    return successResponse(request, { checklist, message: "Item adicionado" }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "TasksChecklists")
  }
}

// PUT - Update checklist item (toggle complete, reorder)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const adminClient = createAdminClient()

    if (!body.checklist_id) {
      throw new AppError("checklist_id é obrigatório", 400)
    }

    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.position !== undefined) updateData.position = body.position

    if (body.is_completed !== undefined) {
      updateData.is_completed = body.is_completed
      if (body.is_completed) {
        updateData.completed_by = user.id
        updateData.completed_at = new Date().toISOString()
      } else {
        updateData.completed_by = null
        updateData.completed_at = null
      }
    }

    const { data: checklist, error: updateError } = await adminClient
      .from("task_checklists")
      .update(updateData)
      .eq("id", body.checklist_id)
      .eq("task_id", id)
      .select()
      .single()

    if (updateError) {
      log.error("[Task Checklists] Update error:", updateError)
      throw new AppError("Erro ao atualizar item", 500)
    }

    return successResponse(request, { checklist, message: "Item atualizado" })
  } catch (error) {
    return errorResponse(request, error, "TasksChecklists")
  }
}

// DELETE - Remove checklist item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const checklistId = searchParams.get("checklist_id")

    if (!checklistId) {
      throw new AppError("checklist_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    const { error: deleteError } = await adminClient
      .from("task_checklists")
      .delete()
      .eq("id", checklistId)
      .eq("task_id", id)

    if (deleteError) {
      log.error("[Task Checklists] Delete error:", deleteError)
      throw new AppError("Erro ao remover item", 500)
    }

    return successResponse(request, { success: true, message: "Item removido" })
  } catch (error) {
    return errorResponse(request, error, "TasksChecklists")
  }
}
