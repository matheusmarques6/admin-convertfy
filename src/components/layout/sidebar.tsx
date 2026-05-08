"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Users,
  Store,
  Calendar,
  Mail,
  DollarSign,
  FileBarChart,
  Rocket,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  X,
  Columns3,
  LayoutDashboard,
  Heart,
  Sparkles,
  ListFilter,
  Briefcase,
  HeartHandshake,
  Inbox,
  Workflow,
  BarChart3,
  UserPlus,
  Phone,
  Users2,
  Wrench,
  Coins,
  FileText,
  Search,
  Sun,
  Moon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCommandPaletteSafe } from "@/components/ui/command-palette"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { ROUTES } from "@/lib/routes"
import { useSidebar, useSidebarStore } from "@/hooks/use-sidebar"
import { useWorkspace, WORKSPACES, type WorkspaceKey } from "@/hooks/use-workspace"
import { useReportNotifications } from "@/hooks/use-report-notifications"
import { SidebarItem } from "./sidebar-item"
import { SidebarUser } from "./sidebar-user"
import { WorkspaceSwitcher } from "./workspace-switcher"

// ---------------------------------------------------------------------------
// Navigation config — UM array por workspace.
//
// Cada workspace e um "sistema separado": comercial mostra so itens
// comerciais, operacional so operacionais. Inbox aparece nos dois.
// Cada item pode ter requiredFeatures pra esconder de quem nao tem
// permissao.
// ---------------------------------------------------------------------------

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  group?: string
  requiredFeatures?: string[]
  requiresStoreAccess?: boolean
  badge?: string
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

const COMERCIAL_NAV: NavGroup[] = [
  {
    key: "main",
    label: "",
    items: [
      { name: "Dashboard", href: ROUTES.ADMIN.COMERCIAL.DASHBOARD, icon: LayoutDashboard },
      { name: "Pipelines", href: ROUTES.ADMIN.COMERCIAL.PIPELINES, icon: Briefcase },
      { name: "Leads", href: ROUTES.ADMIN.COMERCIAL.LEADS, icon: UserPlus },
      { name: "Formularios", href: ROUTES.ADMIN.COMERCIAL.FORMS, icon: FileText },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    items: [
      {
        name: "Reunioes",
        href: ROUTES.ADMIN.MEETINGS.LIST,
        icon: Calendar,
        requiredFeatures: ["calendar_control"],
      },
    ],
  },
  {
    key: "atendimento",
    label: "Atendimento",
    items: [
      { name: "Inbox", href: ROUTES.ADMIN.INBOX, icon: Inbox },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { name: "Reports", href: ROUTES.ADMIN.COMERCIAL.REPORTS, icon: BarChart3 },
    ],
  },
]

const OPERACIONAL_NAV: NavGroup[] = [
  {
    key: "main",
    label: "",
    items: [
      { name: "Dashboard", href: ROUTES.ADMIN.OPERACIONAL.DASHBOARD, icon: LayoutDashboard },
      { name: "Pipelines CS", href: ROUTES.ADMIN.OPERACIONAL.PIPELINES, icon: HeartHandshake },
    ],
  },
  {
    key: "carteira",
    label: "Carteira",
    items: [
      {
        name: "Clientes",
        href: ROUTES.ADMIN.CLIENTS.LIST,
        icon: Users,
        requiredFeatures: ["create_clients", "onboarding_control"],
      },
      {
        name: "Lojas",
        href: ROUTES.ADMIN.STORES.LIST,
        icon: Store,
        requiresStoreAccess: true,
      },
      {
        name: "Onboarding",
        href: ROUTES.ADMIN.ONBOARDING,
        icon: Rocket,
        requiredFeatures: ["onboarding_control", "onboarding_view"],
      },
      { name: "Saude", href: ROUTES.ADMIN.HEALTH, icon: Heart },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    items: [
      {
        name: "Campanhas",
        href: ROUTES.ADMIN.CAMPAIGNS.LIST,
        icon: Mail,
        requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"],
      },
      { name: "Insights IA", href: ROUTES.ADMIN.INSIGHTS, icon: Sparkles },
      { name: "Limpeza", href: ROUTES.ADMIN.LIST_HYGIENE, icon: ListFilter },
    ],
  },
  {
    key: "atendimento",
    label: "Atendimento",
    items: [
      { name: "Canais", href: ROUTES.ADMIN.OPERACIONAL.CANAIS, icon: Phone },
      { name: "Automacoes", href: ROUTES.ADMIN.OPERACIONAL.AUTOMACOES.LIST, icon: Workflow },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { name: "Reports", href: ROUTES.ADMIN.OPERACIONAL.REPORTS, icon: BarChart3 },
    ],
  },
]

const GERAL_NAV: NavGroup[] = [
  {
    key: "produtividade",
    label: "Produtividade",
    items: [
      { name: "Inicio", href: ROUTES.ADMIN.PRODUCTIVITY.HOME, icon: Home },
      { name: "Projetos", href: ROUTES.ADMIN.PRODUCTIVITY.BOARD, icon: Columns3 },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    items: [
      {
        name: "Reunioes",
        href: ROUTES.ADMIN.MEETINGS.LIST,
        icon: Calendar,
        requiredFeatures: ["calendar_control"],
      },
    ],
  },
  {
    key: "time",
    label: "Time",
    items: [
      { name: "Equipe", href: ROUTES.ADMIN.TEAM, icon: Users2 },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    items: [
      {
        name: "Financeiro",
        href: ROUTES.ADMIN.FINANCIAL,
        icon: DollarSign,
        requiredFeatures: ["view_financial"],
      },
      {
        name: "Relatorios",
        href: ROUTES.ADMIN.REPORTS.LIST,
        icon: FileBarChart,
        requiredFeatures: ["view_reports"],
      },
    ],
  },
  {
    key: "ferramentas",
    label: "Ferramentas",
    items: [
      { name: "Ferramentas", href: ROUTES.ADMIN.TOOLS, icon: Wrench },
      { name: "Auditoria moeda", href: ROUTES.ADMIN.TOOLS_CURRENCY_AUDIT, icon: Coins },
    ],
  },
]

const NAV_BY_WORKSPACE: Record<WorkspaceKey, NavGroup[]> = {
  comercial: COMERCIAL_NAV,
  operacional: OPERACIONAL_NAV,
  geral: GERAL_NAV,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
  /** Force expanded mode (used in mobile drawer) */
  forceExpanded?: boolean
}

export function Sidebar({ user, forceExpanded }: SidebarProps) {
  const pathname = usePathname()
  const { isExpanded, isMobileOpen, toggle, closeMobile } = useSidebar()
  const collapsed = forceExpanded ? false : !isExpanded
  const { permissions, hasAnyFeature, isLoading } = usePermissions()
  const workspace = useWorkspace()
  const wsMeta = WORKSPACES[workspace]
  const { unreadCount: notificationsUnread } = useReportNotifications()
  const { theme, setTheme } = useTheme()
  const commandPalette = useCommandPaletteSafe()

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobileOpen) closeMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Filter nav by permissions, dentro do workspace ativo
  const filteredGroups = useMemo<NavGroup[]>(() => {
    const groups = NAV_BY_WORKSPACE[workspace]
    if (isLoading || !permissions) return []

    const checkPermission = (item: NavItem): boolean => {
      if (permissions.isAdmin || permissions.isOrgOwner) return true
      if (!item.requiredFeatures || item.requiredFeatures.length === 0) {
        if (item.requiresStoreAccess) return permissions.storeAccess.length > 0
        return true
      }
      return hasAnyFeature(item.requiredFeatures)
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(checkPermission),
      }))
      .filter((group) => group.items.length > 0)
  }, [workspace, permissions, hasAnyFeature, isLoading])

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "dark",
          "flex flex-col h-full border-r",
          "bg-black border-white/[0.06]",
          "transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "relative z-30",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
        // Borda esquerda colorida no topo dando identidade ao workspace
        style={{
          borderTop: `2px solid ${wsMeta.color}`,
        }}
      >
        {/* Header: logo (+ toggle interno quando expandido) */}
        <div
          className={cn(
            "flex items-center shrink-0 h-14",
            collapsed ? "justify-center px-2" : "justify-between pl-5 pr-2",
          )}
        >
          <Link href={ROUTES.ADMIN.DASHBOARD} className="flex items-center">
            {collapsed ? <LogoIcon size={24} /> : <Logo size="lg" />}
          </Link>

          {!collapsed && (
            <button
              onClick={toggle}
              aria-label="Recolher menu"
              className={cn(
                "hidden md:flex items-center justify-center shrink-0",
                "w-8 h-8 rounded-[6px]",
                "text-white/60 hover:text-white",
                "hover:bg-white/[0.06] active:bg-white/[0.1]",
                "transition-colors duration-150",
              )}
            >
              <Icon icon={ChevronLeft} customSize={16} />
            </button>
          )}
        </div>

        {/* Workspace switcher — separa visualmente os "3 sistemas" */}
        <div className="pb-2">
          <WorkspaceSwitcher current={workspace} collapsed={collapsed} />
        </div>

        {/* Toggle quando colapsado */}
        {collapsed && (
          <div className="hidden md:flex justify-center pb-2">
            <button
              onClick={toggle}
              aria-label="Expandir menu"
              className={cn(
                "flex items-center justify-center",
                "w-9 h-9 rounded-[6px]",
                "text-white/60 hover:text-white",
                "hover:bg-white/[0.06] active:bg-white/[0.1]",
                "transition-colors duration-150",
              )}
            >
              <Icon icon={ChevronRight} customSize={16} />
            </button>
          </div>
        )}

        {/* Separator antes do nav */}
        <div className="h-px bg-white/[0.06] mx-3 mb-2" />

        {/* Navigation — apenas itens do workspace ativo */}
        <ScrollArea className="flex-1 pt-1 pb-4">
          <nav>
            {filteredGroups.map((group, idx) => (
              <div key={group.key} className={cn(idx > 0 && "mt-4")}>
                {!collapsed && group.label && (
                  <p className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
                    {group.label}
                  </p>
                )}
                {collapsed && idx > 0 && (
                  <div className="h-px bg-white/[0.06] mx-3 my-3" />
                )}
                <div className="space-y-[2px]">
                  {group.items.map((item) => (
                    <SidebarItem
                      key={item.href}
                      icon={item.icon}
                      label={item.name}
                      href={item.href}
                      collapsed={collapsed}
                      accentColor={wsMeta.color}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="mt-auto shrink-0 border-t border-white/[0.06]">
          {/* Acoes globais — busca + tema */}
          <div className="py-2 space-y-[2px]">
            {commandPalette && (
              <SidebarActionButton
                icon={Search}
                label="Buscar"
                shortcut="⌘K"
                collapsed={collapsed}
                onClick={commandPalette.open}
              />
            )}
            <SidebarActionButton
              icon={theme === "dark" ? Sun : Moon}
              label={theme === "dark" ? "Tema claro" : "Tema escuro"}
              collapsed={collapsed}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            />
          </div>

          <div className="border-t border-white/[0.06] py-2 space-y-[2px]">
            <SidebarItem
              icon={Settings}
              label="Configuracoes"
              href={ROUTES.ADMIN.SETTINGS.ROOT}
              collapsed={collapsed}
              accentColor={wsMeta.color}
            />
            <SidebarItem
              icon={Bell}
              label="Notificacoes"
              href={ROUTES.ADMIN.NOTIFICATIONS}
              collapsed={collapsed}
              accentColor={wsMeta.color}
              badge={notificationsUnread}
            />
          </div>

          <div className="border-t border-white/[0.06]">
            <SidebarUser user={user} collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Action button (busca, tema) — visual igual ao SidebarItem mas como <button>
// porque sao acoes globais, nao rotas.
// ---------------------------------------------------------------------------

interface SidebarActionButtonProps {
  icon: LucideIcon
  label: string
  collapsed: boolean
  onClick: () => void
  shortcut?: string
}

function SidebarActionButton({
  icon,
  label,
  collapsed,
  onClick,
  shortcut,
}: SidebarActionButtonProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "relative flex items-center rounded-md text-[13px] font-medium",
        "transition-all duration-150",
        "text-white/70 hover:bg-white/[0.05] hover:text-white",
        collapsed
          ? "w-9 h-9 justify-center mx-auto"
          : "mx-3 gap-3 px-3 h-9 w-[calc(100%-1.5rem)]",
      )}
    >
      <Icon icon={icon} size={16} className="shrink-0 text-white/60" />
      {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
      {!collapsed && shortcut && (
        <kbd className="text-[10px] font-medium text-white/40 border border-white/[0.08] rounded px-1.5 py-0.5 bg-white/[0.03]">
          {shortcut}
        </kbd>
      )}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="text-xs font-medium px-2.5 py-1.5"
        >
          {label}
          {shortcut && ` (${shortcut})`}
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}

// ---------------------------------------------------------------------------
// Mobile drawer wrapper
// ---------------------------------------------------------------------------

export function SidebarMobileDrawer({ user }: Pick<SidebarProps, "user">) {
  const { isMobileOpen, closeMobile } = useSidebarStore()

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] md:hidden",
          "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {isMobileOpen && (
          <button
            onClick={closeMobile}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-[6px] flex items-center justify-center bg-gray-100 dark:bg-[#242836] text-gray-500 dark:text-[#8B92A5] hover:bg-gray-200 dark:hover:bg-[#2E3347] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Sidebar user={user} forceExpanded />
      </div>
    </>
  )
}
