import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("Onboarding")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get single onboarding with all steps
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const { data: onboarding, error } = await supabase
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email, phone),
        store:client_stores(id, store_name, store_url, platform),
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        ),
        template:onboarding_templates(id, name, estimated_days)
      `)
      .eq("id", id)
      .single()

    if (error || !onboarding) {
      throw new AppError("Onboarding não encontrado", 404)
    }

    // Fetch steps with assignees
    const { data: steps } = await supabase
      .from("client_onboarding_steps")
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .eq("onboarding_id", id)
      .order("position", { ascending: true })

    return NextResponse.json({
      onboarding: {
        ...onboarding,
        steps: steps || [],
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "Onboarding")
  }
}

// PUT - Update onboarding
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

    // Check if this is a phase transition (new flow)
    const PHASE_STATUSES = ["pending_approval", "generating_copies", "design", "implementation", "completed"]
    const isPhaseTransition = body.status && PHASE_STATUSES.includes(body.status)

    if (isPhaseTransition) {
      // Use the phase service for proper transition with side effects
      const { onboardingPhaseService } = await import("@/lib/services/onboarding-phase.service")

      // Get current user's org member id for audit
      const { data: orgMember } = await adminClient
        .from("org_members")
        .select("id")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .maybeSingle()

      const result = await onboardingPhaseService.transition({
        onboardingId: id,
        toPhase: body.status,
        triggeredBy: "manual",
        triggeredByUserId: orgMember?.id,
        metadata: body.notes ? { notes: body.notes } : undefined,
      })

      if (!result.success) {
        throw new AppError(result.error || "Erro na transição de fase", 400)
      }

      // Also update non-phase fields if provided
      const extraUpdate: Record<string, unknown> = {}
      if (body.assigned_to !== undefined) extraUpdate.assigned_to = body.assigned_to
      if (body.target_completion_date !== undefined) extraUpdate.target_completion_date = body.target_completion_date
      if (body.notes !== undefined) extraUpdate.notes = body.notes

      if (Object.keys(extraUpdate).length > 0) {
        await adminClient.from("client_onboardings").update(extraUpdate).eq("id", id)
      }

      return successResponse(request, { onboarding: result.onboarding, message: "Onboarding atualizado" })
    }

    // Legacy/non-phase updates
    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) updateData.status = body.status
    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to
    if (body.target_completion_date !== undefined) updateData.target_completion_date = body.target_completion_date
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.store_analysis !== undefined) updateData.store_analysis = body.store_analysis
    if (body.generated_copies !== undefined) updateData.generated_copies = body.generated_copies
    if (body.current_phase !== undefined) updateData.current_phase = body.current_phase

    // Handle completion
    if (body.status === "completed") {
      updateData.completed_at = new Date().toISOString()
    }

    const { data: onboarding, error: updateError } = await adminClient
      .from("client_onboardings")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      log.error("[Onboarding] Update error:", updateError)
      throw new AppError("Erro ao atualizar onboarding", 500)
    }

    // If completed, update client status
    if (body.status === "completed") {
      await adminClient
        .from("clients")
        .update({ status: "active" })
        .eq("id", onboarding.client_id)
    }

    return successResponse(request, { onboarding, message: "Onboarding atualizado" })
  } catch (error) {
    return errorResponse(request, error, "Onboarding")
  }
}

// DELETE - Cancel onboarding
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const adminClient = createAdminClient()

    // Soft delete - just change status to cancelled
    const { error: updateError } = await adminClient
      .from("client_onboardings")
      .update({ status: "cancelled" })
      .eq("id", id)

    if (updateError) {
      log.error("[Onboarding] Delete error:", updateError)
      throw new AppError("Erro ao cancelar onboarding", 500)
    }

    return successResponse(request, { success: true, message: "Onboarding cancelado" })
  } catch (error) {
    return errorResponse(request, error, "Onboarding")
  }
}
