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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await context.params
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
    const { data, error } = await admin
      .from("task_deliverables")
      .select("*")
      .eq("task_id", taskId)
    if (error) throw error
    return successResponse(request, { deliverables: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "task-deliverables-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await context.params
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

    if (!body.field_slug || !body.field_label || !body.field_type) {
      throw new AppError(
        "field_slug, field_label e field_type sao obrigatorios",
        400,
      )
    }

    const payload = {
      task_id: taskId,
      field_slug: body.field_slug,
      field_label: body.field_label,
      field_type: body.field_type,
      required: !!body.required,
      value: body.value ?? null,
      file_url: body.file_url ?? null,
      file_name: body.file_name ?? null,
      file_size_bytes: body.file_size_bytes ?? null,
      metadata: body.metadata ?? {},
      filled_at: body.value || body.file_url ? new Date().toISOString() : null,
      filled_by: body.value || body.file_url ? user.id : null,
    }

    const { data, error } = await admin
      .from("task_deliverables")
      .insert(payload)
      .select("*")
      .single()
    if (error) throw error
    return successResponse(request, { deliverable: data })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-create")
  }
}
