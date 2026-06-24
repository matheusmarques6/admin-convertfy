import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar, SidebarMobileDrawer } from "@/components/layout/sidebar"
import { MobileTopBar } from "@/components/layout/mobile-top-bar"
import { DashboardClientWrapper } from "@/components/layout/dashboard-client-wrapper"
import { ErrorBoundary } from "@/components/error-boundary"
import { Permissions, StoreAccess } from "@/lib/hooks/use-permissions"
import type { OrgRole } from "@/types/organization"
import { ROUTES } from "@/lib/routes"
import { CommandPalette } from "@/components/ui/command-palette"
import { WelcomeTour } from "@/components/ui/welcome-tour"
import { CrmKeyboardShortcuts } from "@/components/crm/keyboard-shortcuts"
import { AiChatDrawer } from "@/components/ai/ai-chat-drawer"
import { AiChatTrigger } from "@/components/ai/ai-chat-trigger"
import { AiContextWatcher } from "@/components/ai/ai-context-watcher"

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

    // Carrega TODAS as funções da conta a partir da junction org_member_roles.
    // Acesso = união. Admin/Dev são bypass.
    let roles: OrgRole[] = []
    let isOrgOwner = false

    if (orgMember) {
      try {
        const { data: roleRows } = await supabase
          .from("org_member_roles")
          .select("role")
          .eq("org_member_id", orgMember.id)

        roles = (roleRows?.map((r) => r.role as OrgRole) ?? []).filter(Boolean)

        // Fallback: se a junction não tem entradas para esta conta, usa a
        // role canônica que está em org_members.role. Cobre o gap entre o
        // momento do backfill da migration e a primeira atribuição via UI.
        if (roles.length === 0 && orgMember.role) {
          roles = [orgMember.role as OrgRole]
        }
      } catch (err) {
        console.error("[Layout] Error fetching roles:", err)
        if (orgMember.role) roles = [orgMember.role as OrgRole]
      }

      isOrgOwner = roles.includes("admin")
    }

    // Sistema de features está desativado (tabelas inertes). Mantido vazio
    // para preservar a interface de Permissions até a próxima limpeza.
    const features: string[] = []

    // Get store access. Bypass para admin/dev (acesso a todas as lojas).
    const hasStoreBypass = isAdmin || roles.includes("admin") || roles.includes("dev")
    let storeAccess: StoreAccess[] = []

    try {
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
    } catch (err) {
      console.error("[Layout] Error fetching store access:", err)
    }

    return {
      roles,
      isAdmin,
      isOrgOwner,
      orgRole: orgMember?.role || null,
      features,
      storeAccess,
    }
  } catch (error) {
    console.error("[Layout] Error fetching permissions:", error)
    return {
      roles: [],
      isAdmin: false,
      isOrgOwner: false,
      orgRole: null,
      features: [],
      storeAccess: [],
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
        {/* Layout 100dvh + flex row. Cada filho gerencia sua propria altura
            sem depender de flex-col + min-h-0 (essa cadeia quebra o scroll
            em varios browsers). Sidebar sticky a esquerda; main com altura
            explicita = 100dvh + overflow-y-auto direto.

            100dvh > 100vh porque inclui ajuste dinamico de URL bar mobile
            (Safari/Chrome iOS) e nao "salta" quando barra some/aparece. */}
        <div className="flex h-[100dvh] w-full overflow-hidden bg-[#FCFCFD] dark:bg-[#0F1117]">
          {/* Sidebar — desktop/tablet (oculta em mobile) */}
          <aside className="hidden md:block shrink-0 h-[100dvh] sticky top-0">
            <Sidebar user={userData} />
          </aside>

          {/* Sidebar mobile drawer (overlay, nao toma espaco) */}
          <SidebarMobileDrawer user={userData} />

          {/* Main content — h-[100dvh] explicito + overflow-y-auto = scroll
              GARANTIDO em todos os browsers. Sem dependencia de flex-col
              ancestral propagar altura corretamente. */}
          <main className="flex-1 min-w-0 h-[100dvh] overflow-y-auto overscroll-contain">
            {/* Mobile top bar sticky no topo do scroller (some quando rola) */}
            <MobileTopBar user={userData} />
            <div className="p-4 md:p-6 lg:p-8">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </CommandPalette>
      <WelcomeTour />
      <CrmKeyboardShortcuts />
      <AiChatDrawer />
      <AiChatTrigger />
      <AiContextWatcher />
    </DashboardClientWrapper>
  )
}
