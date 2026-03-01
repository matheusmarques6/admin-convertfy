import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingPendingApproval")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - List onboardings pending approval
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const adminClient = createAdminClient()

    // Check permission
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Membro da organização não encontrado", 403)
    }

    // Check for onboarding_approve feature or owner/manager role
    const { data: feature } = await adminClient
      .from("org_member_features")
      .select("id")
      .eq("org_member_id", orgMember.id)
      .eq("feature_key", "onboarding_approve")
      .eq("enabled", true)
      .maybeSingle()

    const hasPermission = !!feature || ["owner", "manager", "coo"].includes(orgMember.role)

    if (!hasPermission) {
      throw new AppError("Sem permissão para visualizar aprovações", 403)
    }

    // Fetch pending onboardings with full data
    const { data: onboardings, error } = await adminClient
      .from("client_onboardings")
      .select(`
        *,
        client:clients(id, name, company, email, phone, cpf_cnpj),
        store:client_stores(id, store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code)
      `)
      .or("current_phase.eq.pending_approval,status.eq.pending_approval")
      .order("submitted_at", { ascending: true })

    if (error) {
      log.error("Error fetching pending approvals", error)
      throw new AppError("Erro ao buscar aprovações pendentes", 500)
    }

    // For each onboarding, also get store_onboarding_data
    const enrichedOnboardings = await Promise.all(
      (onboardings || []).map(async (onb) => {
        if (!onb.store_id) return { ...onb, store_onboarding_data: null }

        const { data: storeData } = await adminClient
          .from("store_onboarding_data")
          .select("*")
          .eq("store_id", onb.store_id)
          .maybeSingle()

        return { ...onb, store_onboarding_data: storeData }
      })
    )

    // Also get approval history
    const onboardingIds = (onboardings || []).map((o) => o.id)
    let approvalHistory: Record<string, unknown>[] = []

    if (onboardingIds.length > 0) {
      const { data: history } = await adminClient
        .from("onboarding_approvals")
        .select("*")
        .in("onboarding_id", onboardingIds)
        .order("created_at", { ascending: false })

      approvalHistory = history || []
    }

    return successResponse(request, {
      onboardings: enrichedOnboardings,
      approval_history: approvalHistory,
      count: enrichedOnboardings.length,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingPendingApproval")
  }
}
