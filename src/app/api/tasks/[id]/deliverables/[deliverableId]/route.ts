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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; deliverableId: string }> },
) {
  try {
    const { id, deliverableId } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "work")
    const body = await request.json()
    const patch: Record<string, unknown> = {}
    for (const field of [
      "value",
      "file_url",
      "file_name",
      "file_size_bytes",
      "metadata",
    ]) {
      if (body[field] !== undefined) patch[field] = body[field]
    }
    const hasValue = Boolean(body.value || body.file_url)
    if (body.value !== undefined || body.file_url !== undefined) {
      patch.filled_at = hasValue ? new Date().toISOString() : null
      patch.filled_by = hasValue ? user.id : null
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("Nenhum campo editavel informado", 400)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("task_deliverables")
      .update(patch)
      .eq("id", deliverableId)
      .eq("task_id", id)
      .select("*")
      .maybeSingle()
    if (error) throw error
    if (!data) throw new AppError("Entregavel nao encontrado", 404)

    let handoff = "not_ready"
    if (access.task.onboarding_id) {
      handoff = await attemptOnboardingHandoff({
        onboardingId: access.task.onboarding_id,
        actorId: user.id,
      })
    }

    // Dispatcher de design de campanha (non-blocking): ao preencher o Figma o
    // pipeline pode avancar. No-op para tasks que nao sejam de campanha.
    try {
      await attemptCampaignDesignHandoffForTask({ taskId: id, actorId: user.id })
    } catch (campaignErr) {
      console.error("Campaign design handoff failed (non-blocking):", campaignErr)
    }

    return successResponse(request, { deliverable: data, handoff })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; deliverableId: string }> },
) {
  try {
    const { id, deliverableId } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    await requireTaskAccess(user.id, id, "admin")
    const admin = createAdminClient()
    const { error } = await admin
      .from("task_deliverables")
      .delete()
      .eq("id", deliverableId)
      .eq("task_id", id)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "task-deliverable-delete")
  }
}
