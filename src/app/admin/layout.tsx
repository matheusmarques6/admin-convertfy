import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar, SidebarMobileDrawer } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { MobileTopBar } from "@/components/layout/mobile-top-bar"
import { DashboardClientWrapper } from "@/components/layout/dashboard-client-wrapper"
import { ErrorBoundary } from "@/components/error-boundary"
import { Permissions, StoreAccess } from "@/lib/hooks/use-permissions"
import { ROUTES } from "@/lib/routes"
import { CommandPalette } from "@/components/ui/command-palette"
import { WelcomeTour } from "@/components/ui/welcome-tour"

async function getPermissions(userId: string): Promise<Permissions | null> {
  try {
    const supabase = await createClient()

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (!profile) return null

    // Check if user is admin (global admin)
    const isAdmin = profile.role === "admin"

    // Get org membership
    const { data: orgMember } = await supabase
      .from("org_members")
      .select(`
        *,
        organization:organizations(id, name, slug, type)
      `)
      .eq("profile_id", userId)
      .eq("is_active", true)
      .order("role", { ascending: true })
      .limit(1)
      .single()

    // Get enabled features
    let features: string[] = []
    let isOrgOwner = false

    if (orgMember) {
      isOrgOwner = orgMember.role === "owner"

      try {
        if (isAdmin || isOrgOwner) {
          const { data: allFeatures } = await supabase
            .from("features_catalog")
            .select("key")
            .eq("is_active", true)

          features = allFeatures?.map((f) => f.key) || []
        } else {
          const { data: memberFeatures } = await supabase
            .from("org_member_features")
            .select("feature_key")
            .eq("org_member_id", orgMember.id)
            .eq("enabled", true)

          features = memberFeatures?.map((f) => f.feature_key) || []
        }
      } catch (err) {
        console.error("[Layout] Error fetching features:", err)
      }
    }

    // Get store access
    let storeAccess: StoreAccess[] = []

    try {
      if (isAdmin || isOrgOwner) {
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
    } catch (err) {
      console.error("[Layout] Error fetching store access:", err)
    }

    // Helper function to check if user has a specific feature
    const hasFeature = (featureKey: string) => {
      if (isAdmin || isOrgOwner) return true
      return features.includes(featureKey)
    }

    return {
      isAdmin,
      isOrgOwner,
      orgRole: orgMember?.role || null,
      features,
      storeAccess,
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
    }
  } catch (error) {
    console.error("[Layout] Error fetching permissions:", error)
    return {
      isAdmin: false,
      isOrgOwner: false,
      orgRole: null,
      features: [],
      storeAccess: [],
      canCreateClients: false,
      canManagePortalUsers: false,
      canViewReports: false,
      canViewFinancial: false,
      canControlOnboarding: false,
      canViewOnboarding: false,
      canControlTeam: false,
      canViewTeam: false,
      canControlCampaigns: false,
      canViewCampaigns: false,
      canGenerateCopy: false,
      canControlRequests: false,
      canExecuteRequests: false,
      canControlCalendar: false,
    }
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(ROUTES.LOGIN)
  }

  // Fetch user profile and permissions
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const permissions = await getPermissions(user.id)

  const userData = profile ? {
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatar_url,
  } : {
    name: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    avatar_url: undefined,
  }

  return (
    <DashboardClientWrapper initialPermissions={permissions}>
      <CommandPalette>
        <div className="flex h-screen overflow-hidden bg-[#FCFCFD] dark:bg-[#0F1117]">
          {/* Sidebar — desktop/tablet (hidden on mobile) */}
          <div className="hidden md:block shrink-0">
            <Sidebar user={userData} />
          </div>

          {/* Sidebar mobile drawer */}
          <SidebarMobileDrawer user={userData} />

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile top bar — only < 768px */}
            <MobileTopBar user={userData} />

            {/* Desktop header — breadcrumbs + notifications (hidden on mobile) */}
            <Header user={userData} />

            {/* Page content with responsive padding */}
            <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </CommandPalette>
      <WelcomeTour />
    </DashboardClientWrapper>
  )
}
