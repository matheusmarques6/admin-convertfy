import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAnyFeature } from "@/lib/api/check-permission"

// Valid transitions per role feature
const STATUS_TRANSITIONS: Record<string, { to: string[]; requiredFeature: string }> = {
  pending_approval: { to: ["approved"], requiredFeature: "onboarding_control" },
  approved: { to: ["generating", "pending_design"], requiredFeature: "campaign_copy" },
  generating: { to: ["pending_design"], requiredFeature: "campaign_copy" },
  pending_design: { to: ["in_design"], requiredFeature: "campaign_copy" },
  in_design: { to: ["pending_implementation"], requiredFeature: "campaign_copy" },
  pending_implementation: { to: ["implementing"], requiredFeature: "campaign_control" },
  implementing: { to: ["completed"], requiredFeature: "campaign_control" },
}

// PATCH - Update pipeline status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const { status: newStatus, notes } = body

    if (!newStatus) {
      throw new AppError("status é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Get current pipeline item
    const { data: pipeline } = await adminClient
      .from("copy_pipeline")
      .select("id, status, org_id")
      .eq("id", id)
      .single()

    if (!pipeline) {
      throw new AppError("Pipeline não encontrado", 404)
    }

    // Validate transition
    const currentTransition = STATUS_TRANSITIONS[pipeline.status]
    if (!currentTransition || !currentTransition.to.includes(newStatus)) {
      throw new AppError(
        `Transição inválida: ${pipeline.status} → ${newStatus}`,
        400
      )
    }

    // Check permission for this transition
    await requireAnyFeature(supabase, user.id, [
      currentTransition.requiredFeature,
    ])

    // Get org member for tracking
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    // Build update payload
    const updatePayload: Record<string, unknown> = { status: newStatus }
    if (notes) updatePayload.notes = notes

    // Track timestamps per transition
    if (newStatus === "approved" && orgMember) {
      updatePayload.approved_by = orgMember.id
      updatePayload.approved_at = new Date().toISOString()
    }
    if (newStatus === "in_design") {
      updatePayload.design_started_at = new Date().toISOString()
    }
    if (newStatus === "pending_implementation") {
      updatePayload.design_completed_at = new Date().toISOString()
    }
    if (newStatus === "implementing") {
      updatePayload.impl_started_at = new Date().toISOString()
    }
    if (newStatus === "completed") {
      updatePayload.impl_completed_at = new Date().toISOString()
    }

    const { data: updated, error } = await adminClient
      .from("copy_pipeline")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return successResponse(request, updated)
  } catch (error) {
    return errorResponse(request, error, "CopyPipeline.Status.PATCH")
  }
}
