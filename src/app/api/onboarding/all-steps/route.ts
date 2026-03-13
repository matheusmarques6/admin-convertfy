import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingAllSteps")

/**
 * GET /api/onboarding/all-steps
 *
 * Fetches ALL onboarding steps across all onboardings for the org,
 * with related onboarding, client, store, and assignee data.
 * Used by the Steps Kanban view.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)

    const { data: steps, error } = await supabase
      .from("client_onboarding_steps")
      .select(`
        *,
        onboarding:client_onboardings(
          id,
          status,
          current_phase,
          client:clients(id, name, company),
          store:client_stores(id, store_name)
        ),
        assignee:org_members(
          id,
          role,
          profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)
        )
      `)
      .in("status", ["waiting", "pending", "in_progress", "review", "blocked", "completed"])
      .order("position", { ascending: true })

    if (error) {
      log.error("[AllSteps] Error fetching:", error)
      throw new AppError("Erro ao buscar etapas", 500)
    }

    // Filter out steps from completed/cancelled onboardings (keep active pipeline steps only)
    const activeSteps = (steps || []).filter((step) => {
      const onboarding = step.onboarding
      if (!onboarding) return false
      return onboarding.status !== "completed" && onboarding.status !== "cancelled"
    })

    return successResponse(request, { steps: activeSteps })
  } catch (error) {
    return errorResponse(request, error, "OnboardingAllSteps")
  }
}
