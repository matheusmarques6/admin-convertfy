import { NextRequest } from "next/server"
import {
  AppError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { attemptOnboardingHandoff } from "@/lib/services/onboarding-task-completion.service"
import { attemptCampaignDesignHandoffForTask } from "@/lib/services/campaign-central/campaign-design-trigger.service"
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
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_deliverables")
      .select("*")
      .eq("task_id", id)
    if (error) throw error
    return successResponse(request, {
      deliverables: data ?? [],
      can_work: access.canWork,
      can_admin: access.canAdmin,
    })
  } catch (error) {
    return errorResponse(request, error, "task-deliverables-get")
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "admin")
    const body = await request.json()
    if (!body.field_slug || !body.field_label || !body.field_type) {
      throw new AppError(
        "field_slug, field_label e field_type sao obrigatorios",
        400,
      )
    }

    const hasValue = Boolean(body.value || body.file_url)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_deliverables")
      .insert({
        task_id: id,
        field_slug: body.field_slug,
        field_label: body.field_label,
        field_type: body.field_type,
        required: Boolean(body.required),
        value: body.value ?? null,
        file_url: body.file_url ?? null,
        file_name: body.file_name ?? null,
        file_size_bytes: body.file_size_bytes ?? null,
        metadata: body.metadata ?? {},
        filled_at: hasValue ? new Date().toISOString() : null,
        filled_by: hasValue ? user.id : null,
      })
      .select("*")
      .single()
    if (error) throw error

    let handoff = "not_ready"
    if (access.task.onboarding_id) {
      handoff = await attemptOnboardingHandoff({
        onboardingId: access.task.onboarding_id,
        actorId: user.id,
      })
    }

    // Dispatcher de design de campanha (non-blocking): ao entregar o Figma o
    // pipeline pode avancar. No-op para tasks que nao sejam de campanha.
    try {
      await attemptCampaignDesignHandoffForTask({ taskId: id, actorId: user.id })
    } catch (campaignErr) {
      console.error("Campaign design handoff failed (non-blocking):", campaignErr)
    }

    return successResponse(request, { deliverable: data, handoff })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-create")
  }
}
