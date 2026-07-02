import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { withTiming } from "@/lib/api/with-timing"
import { getPortalOnboardingStatus } from "@/lib/services/portal-onboarding-status.service"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/portal/onboarding
 *
 * Returns the active onboarding for the logged-in portal user's client.
 * Includes all steps grouped by category with progress info.
 */
export const GET = withTiming("portal/onboarding", handleGet)

async function handleGet(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get current user
    const user = await requireAuth(supabase)

    // Get portal user (using admin client to bypass RLS)
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const clientId = portalUser.client_id

    const result = await getPortalOnboardingStatus(clientId, adminClient)

    if (!result.onboarding) {
      return NextResponse.json(
        { onboarding: null, message: "Nenhum onboarding encontrado" },
        { headers: corsHeaders(request.headers.get("origin")) }
      )
    }

    return NextResponse.json(
      {
        onboarding: result.onboarding,
        phase_timeline: result.phase_timeline,
        grouped: result.grouped,
      },
      { headers: corsHeaders(request.headers.get("origin")) }
    )
  } catch (error) {
    return errorResponse(request, error, "PortalOnboarding")
  }
}
