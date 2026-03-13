import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingSteps")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get all steps for an onboarding
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const { data: steps, error } = await supabase
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

    if (error) {
      log.error("[Onboarding Steps] Error fetching:", error)
      throw new AppError("Erro ao buscar etapas", 500)
    }

    // Group by category
    const grouped = (steps || []).reduce((acc, step) => {
      if (!acc[step.category]) {
        acc[step.category] = []
      }
      acc[step.category].push(step)
      return acc
    }, {} as Record<string, typeof steps>)

    return successResponse(request, { steps: steps || [], grouped })
  } catch (error) {
    return errorResponse(request, error, "OnboardingSteps")
  }
}

// PUT - Update a step (complete, assign, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: onboardingId } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()

    if (!body.step_id) {
      throw new AppError("step_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) {
      updateData.status = body.status

      // Set timestamps based on status
      if (body.status === "in_progress" && !body.started_at) {
        updateData.started_at = new Date().toISOString()
      }

      if (body.status === "completed") {
        updateData.completed_at = new Date().toISOString()
        updateData.completed_by = user.id
      }
    }

    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.blocked_reason !== undefined) updateData.blocked_reason = body.blocked_reason

    const { data: step, error: updateError } = await adminClient
      .from("client_onboarding_steps")
      .update(updateData)
      .eq("id", body.step_id)
      .eq("onboarding_id", onboardingId)
      .select(`
        *,
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .single()

    if (updateError) {
      log.error("[Onboarding Steps] Update error:", updateError)
      throw new AppError("Erro ao atualizar etapa", 500)
    }

    // Get updated onboarding progress
    const { data: onboarding } = await supabase
      .from("client_onboardings")
      .select("id, progress_percent, status")
      .eq("id", onboardingId)
      .single()

    // --- Onboarding sync (non-blocking) ---
    if (body.status && step) {
      try {
        const { OnboardingSyncService } = await import("@/lib/services/onboarding-sync.service")
        if (body.status === "completed") {
          await OnboardingSyncService.onStepCompleted(body.step_id, user.id)
        } else if (body.status === "skipped") {
          await OnboardingSyncService.onStepSkipped(body.step_id, user.id)
        } else {
          await OnboardingSyncService.onStepStatusChanged(body.step_id, body.status, user.id)
        }
      } catch (syncErr) {
        log.error("Onboarding sync failed (non-blocking):", syncErr)
      }
    }

    // --- Step reassignment sync (non-blocking) ---
    if (body.assigned_to !== undefined && step && body.assigned_to !== null) {
      try {
        const { OnboardingSyncService } = await import("@/lib/services/onboarding-sync.service")
        await OnboardingSyncService.onStepReassigned(
          body.step_id,
          body.assigned_to,
          step.org_id ?? "",
        )
      } catch (syncErr) {
        log.error("Onboarding reassignment sync failed (non-blocking):", syncErr)
      }
    }

    return successResponse(request, {
      step,
      onboarding_progress: onboarding?.progress_percent || 0,
      onboarding_status: onboarding?.status,
      message: "Etapa atualizada",
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingSteps")
  }
}
