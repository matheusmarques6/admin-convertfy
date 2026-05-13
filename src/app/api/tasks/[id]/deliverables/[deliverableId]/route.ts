import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; deliverableId: string }> },
) {
  try {
    const { id: taskId, deliverableId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const body = await request.json()

    const { data: task } = await admin
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!task) throw new AppError("Task nao encontrada", 404)

    const patch: Record<string, unknown> = {}
    if (body.value !== undefined) patch.value = body.value
    if (body.file_url !== undefined) patch.file_url = body.file_url
    if (body.file_name !== undefined) patch.file_name = body.file_name
    if (body.file_size_bytes !== undefined)
      patch.file_size_bytes = body.file_size_bytes
    if (body.metadata !== undefined) patch.metadata = body.metadata
    if (body.value || body.file_url) {
      patch.filled_at = new Date().toISOString()
      patch.filled_by = user.id
    }

    const { data, error } = await admin
      .from("task_deliverables")
      .update(patch)
      .eq("id", deliverableId)
      .eq("task_id", taskId)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { deliverable: data })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; deliverableId: string }> },
) {
  try {
    const { id: taskId, deliverableId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const { data: task } = await admin
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (!task) throw new AppError("Task nao encontrada", 404)
    const { error } = await admin
      .from("task_deliverables")
      .delete()
      .eq("id", deliverableId)
      .eq("task_id", taskId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-delete")
  }
}
