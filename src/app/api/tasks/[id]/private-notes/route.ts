import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "read")
    const ownsNotes =
      access.task.created_by === user.id || access.task.assignee_id === user.id
    return successResponse(request, {
      private_notes: ownsNotes ? (access.task.private_notes ?? "") : null,
      can_edit: ownsNotes && access.canWork,
    })
  } catch (error) {
    return errorResponse(request, error, "task-private-notes-get")
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "work")
    const ownsNotes =
      access.task.created_by === user.id || access.task.assignee_id === user.id
    if (!ownsNotes) {
      throw new AppError("Anotacoes pessoais pertencem ao autor/responsavel", 403)
    }
    const body = await request.json()
    if (typeof body.private_notes !== "string") {
      throw new AppError("private_notes deve ser string", 400)
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from("tasks")
      .update({ private_notes: body.private_notes })
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { saved: true })
  } catch (error) {
    return errorResponse(request, error, "task-private-notes-update")
  }
}
