import { NextRequest, NextResponse } from "next/server"
import { errorResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import type { OrgRole } from "@/types/organization"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Get current user's roles, permissions and store access
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
      .order("role", { ascending: true })
      .limit(1)
      .single()

    // Carrega todas as funções da conta (multi-função via org_member_roles).
    let roles: OrgRole[] = []
    let isOrgOwner = false

    if (orgMember) {
      const { data: roleRows } = await supabase
        .from("org_member_roles")
        .select("role")
        .eq("org_member_id", orgMember.id)

      roles = (roleRows?.map((r) => r.role as OrgRole) ?? []).filter(Boolean)

      if (roles.length === 0 && orgMember.role) {
        roles = [orgMember.role as OrgRole]
      }

      isOrgOwner = roles.includes("admin")
    }

    const hasStoreBypass = isAdmin || roles.includes("admin") || roles.includes("dev")

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

    if (hasStoreBypass) {
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

    return NextResponse.json({
      profile,
      orgMember: orgMember || null,
      permissions: {
        roles,
        isAdmin,
        isOrgOwner,
        orgRole: orgMember?.role || null,
        features: [],
        storeAccess,
      },
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "MePermissions")
  }
}
