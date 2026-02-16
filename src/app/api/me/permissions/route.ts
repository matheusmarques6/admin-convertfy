import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("MePermissions")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - Get current user's permissions, features, and store access
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profile) {
      throw new AppError("Perfil não encontrado", 404)
    }

    // Check if user is admin (global admin)
    const isAdmin = profile.role === "admin"

    // Get org membership
    const { data: orgMember } = await supabase
      .from("org_members")
      .select(`
        *,
        organization:organizations(id, name, slug, type)
      `)
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("role", { ascending: true }) // 'owner' comes first alphabetically
      .limit(1)
      .single()

    // Get enabled features
    let features: string[] = []
    let isOrgOwner = false

    if (orgMember) {
      isOrgOwner = orgMember.role === "owner"

      if (isAdmin || isOrgOwner) {
        // Admins and owners have all features
        const { data: allFeatures } = await supabase
          .from("features_catalog")
          .select("key")
          .eq("is_active", true)

        features = allFeatures?.map((f) => f.key) || []
      } else {
        // Get assigned features
        const { data: memberFeatures } = await supabase
          .from("org_member_features")
          .select("feature_key")
          .eq("org_member_id", orgMember.id)
          .eq("enabled", true)

        features = memberFeatures?.map((f) => f.feature_key) || []
      }
    }

    // Get store access
    let storeAccess: Array<{
      store_id: string
      store_name: string
      client_id: string
      client_name: string
      can_view: boolean
      can_edit: boolean
      can_manage_onboarding: boolean
      can_manage_campaigns: boolean
      can_manage_reports: boolean
    }> = []

    if (isAdmin || isOrgOwner) {
      // Admins and owners can access all stores
      const { data: allStores } = await supabase
        .from("client_stores")
        .select(`
          id,
          store_name,
          client:clients(id, name)
        `)
        .eq("is_active", true)

      storeAccess = (allStores || []).map((store) => {
        const client = Array.isArray(store.client) ? store.client[0] : store.client
        return {
          store_id: store.id,
          store_name: store.store_name,
          client_id: client?.id || "",
          client_name: client?.name || "",
          can_view: true,
          can_edit: true,
          can_manage_onboarding: true,
          can_manage_campaigns: true,
          can_manage_reports: true,
        }
      })
    } else if (orgMember) {
      // Get specific store access
      const { data: access } = await supabase
        .from("agent_store_access")
        .select(`
          *,
          store:client_stores(id, store_name, client:clients(id, name))
        `)
        .eq("org_member_id", orgMember.id)
        .eq("can_view", true)

      storeAccess = (access || []).map((a) => {
        const store = Array.isArray(a.store) ? a.store[0] : a.store
        const client = store?.client ? (Array.isArray(store.client) ? store.client[0] : store.client) : null
        return {
          store_id: store?.id || "",
          store_name: store?.store_name || "",
          client_id: client?.id || "",
          client_name: client?.name || "",
          can_view: a.can_view,
          can_edit: a.can_edit,
          can_manage_onboarding: a.can_manage_onboarding,
          can_manage_campaigns: a.can_manage_campaigns,
          can_manage_reports: a.can_manage_reports,
        }
      })
    }

    // Helper function to check if user has a specific feature
    const hasFeature = (featureKey: string) => {
      if (isAdmin || isOrgOwner) return true
      return features.includes(featureKey)
    }

    return NextResponse.json({
      profile,
      orgMember: orgMember || null,
      permissions: {
        isAdmin,
        isOrgOwner,
        orgRole: orgMember?.role || null,
        features,
        storeAccess,
        // Computed permissions for quick checks
        canCreateClients: hasFeature("create_clients"),
        canManagePortalUsers: hasFeature("manage_portal_users"),
        canViewReports: hasFeature("view_reports"),
        canViewFinancial: hasFeature("view_financial"),
        canControlOnboarding: hasFeature("onboarding_control"),
        canViewOnboarding: hasFeature("onboarding_view") || hasFeature("onboarding_control"),
        canControlTeam: hasFeature("team_control"),
        canViewTeam: hasFeature("team_view") || hasFeature("team_control"),
        canControlCampaigns: hasFeature("campaign_control"),
        canViewCampaigns: hasFeature("campaign_view") || hasFeature("campaign_control"),
        canGenerateCopy: hasFeature("campaign_copy"),
        canControlRequests: hasFeature("request_control"),
        canExecuteRequests: hasFeature("request_execute"),
        canControlCalendar: hasFeature("calendar_control"),
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "MePermissions")
  }
}
