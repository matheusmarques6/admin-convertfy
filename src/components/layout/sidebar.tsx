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
  LifeBuoy,
  Megaphone,
  Cpu,
  ListChecks,
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
import type { NavItemId } from "@/lib/permissions/role-access"
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
//
// O gate de cada item e por FUNCAO (role-set), centralizado em
// `src/lib/permissions/role-access.ts`. Cada NavItem declara um `id`
// estavel; o filtro abaixo consulta `canAccess(id, roles)`.
// ---------------------------------------------------------------------------

interface NavItem {
  id: NavItemId
  name: string
  href: string
  icon: LucideIcon
  group?: string
  requiresStoreAccess?: boolean
  badge?: string
}

interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// ─────────────────────────────────────────────────────────────────────
// Estrutura padrao de cada workspace (consistencia visual):
//
//   1. Visao geral   — Dashboard, métricas top
//   2. Operacoes     — fluxos principais do workspace
//   3. Relacionados  — coisas auxiliares (agenda, inbox, etc)
//   4. Analise       — reports, BI
//
// Os 3 workspaces seguem essa hierarquia. Item "Dashboard" sempre
// primeiro, "Reports" sempre ultimo.
// ─────────────────────────────────────────────────────────────────────

const COMERCIAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "comercial.dashboard", name: "Dashboard", href: ROUTES.ADMIN.COMERCIAL.DASHBOARD, icon: LayoutDashboard },
    ],
  },
  {
    key: "vendas",
    label: "Vendas",
    items: [
      { id: "comercial.pipelines", name: "Pipelines", href: ROUTES.ADMIN.COMERCIAL.PIPELINES, icon: Briefcase },
      { id: "comercial.leads", name: "Leads", href: ROUTES.ADMIN.COMERCIAL.LEADS, icon: UserPlus },
      { id: "comercial.forms", name: "Formularios", href: ROUTES.ADMIN.COMERCIAL.FORMS, icon: FileText },
    ],
  },
  {
    key: "atendimento",
    label: "Atendimento",
    items: [
      { id: "comercial.inbox", name: "Inbox", href: ROUTES.ADMIN.INBOX, icon: Inbox },
      { id: "comercial.canais", name: "Canais", href: ROUTES.ADMIN.COMERCIAL.CANAIS, icon: Phone },
      { id: "comercial.automacoes", name: "Automacoes", href: ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST, icon: Workflow },
      { id: "comercial.meetings", name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: Calendar },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { id: "comercial.reports", name: "Reports", href: ROUTES.ADMIN.COMERCIAL.REPORTS, icon: BarChart3 },
    ],
  },
]

const OPERACIONAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "ops.dashboard", name: "Dashboard", href: ROUTES.ADMIN.OPERACIONAL.DASHBOARD, icon: LayoutDashboard },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    items: [
      { id: "ops.clients", name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: Users },
      { id: "ops.stores", name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: Store, requiresStoreAccess: true },
      { id: "ops.health", name: "Saude", href: ROUTES.ADMIN.HEALTH, icon: Heart },
    ],
  },
  {
    key: "customer-success",
    label: "Customer Success",
    items: [
      { id: "ops.cs.forms", name: "Formulários CS", href: ROUTES.ADMIN.OPERACIONAL.FORMS, icon: FileText },
    ],
  },
  {
    key: "workflows",
    label: "Workflows",
    items: [
      { id: "ops.cs.pipelines", name: "Pipelines CS", href: ROUTES.ADMIN.OPERACIONAL.PIPELINES, icon: HeartHandshake },
      { id: "ops.cs.ritual", name: "Ritual de Sexta", href: ROUTES.ADMIN.OPERACIONAL.CS.RITUAL, icon: Sparkles },
    ],
  },
  {
    key: "onboarding",
    label: "Onboarding",
    items: [
      { id: "ops.onboarding", name: "Onboarding", href: ROUTES.ADMIN.ONBOARDING_V2.LIST, icon: Rocket },
      { id: "ops.cs.cadences", name: "Cadências", href: ROUTES.ADMIN.OPERACIONAL.CS.CADENCES, icon: Settings },
      { id: "ops.onboarding.tutorial", name: "Tutorial cliente", href: ROUTES.ADMIN.ONBOARDING_HELP.LIST, icon: LifeBuoy },
    ],
  },
  {
    key: "pipelines",
    label: "Pipelines",
    items: [
      { id: "ops.pipelines.admin", name: "Configurar pipelines", href: ROUTES.ADMIN.OPERACIONAL.PIPELINES_ADMIN, icon: Settings },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    items: [
      { id: "ops.campaigns.central", name: "Central de Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.CENTRAL, icon: Megaphone },
      { id: "ops.campaigns.list", name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.LIST, icon: Mail },
      { id: "ops.insights", name: "Insights IA", href: ROUTES.ADMIN.INSIGHTS, icon: Sparkles },
      { id: "ops.list_hygiene", name: "Limpeza", href: ROUTES.ADMIN.LIST_HYGIENE, icon: ListFilter },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { id: "ops.reports", name: "Reports", href: ROUTES.ADMIN.OPERACIONAL.REPORTS, icon: BarChart3 },
    ],
  },
]

const GERAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "geral.home", name: "Inicio", href: ROUTES.ADMIN.PRODUCTIVITY.HOME, icon: Home },
      { id: "geral.board", name: "Projetos", href: ROUTES.ADMIN.PRODUCTIVITY.BOARD, icon: Columns3 },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    items: [
      { id: "geral.meetings", name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: Calendar },
    ],
  },
  {
    key: "time",
    label: "Time",
    items: [
      { id: "geral.team", name: "Equipe", href: ROUTES.ADMIN.TEAM, icon: Users2 },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    items: [
      { id: "geral.financial", name: "Financeiro", href: ROUTES.ADMIN.FINANCIAL, icon: DollarSign },
      { id: "geral.reports", name: "Relatorios", href: ROUTES.ADMIN.REPORTS.LIST, icon: FileBarChart },
    ],
  },
  {
    key: "ferramentas",
    label: "Ferramentas",
    items: [
      // Grupo restrito a admin/dev — gate centralizado em role-access.ts.
      { id: "tools.tools", name: "Ferramentas", href: ROUTES.ADMIN.TOOLS, icon: Wrench },
      { id: "tools.currency_audit", name: "Auditoria moeda", href: ROUTES.ADMIN.TOOLS_CURRENCY_AUDIT, icon: Coins },
      { id: "tools.email_generation", name: "Geração de Emails", href: ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION, icon: Mail },
      { id: "tools.ai_usage", name: "Custo de IA", href: ROUTES.ADMIN.AI_USAGE, icon: Cpu },
      { id: "tools.email_logs", name: "Logs de geração", href: ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION_LOGS, icon: ListChecks },
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
  const { permissions, canAccess, isLoading } = usePermissions()
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

  // Filter nav by role (gate centralizado em role-access.ts), dentro do workspace ativo.
  const filteredGroups = useMemo<NavGroup[]>(() => {
    const groups = NAV_BY_WORKSPACE[workspace]
    if (isLoading || !permissions) return []

    const checkPermission = (item: NavItem): boolean => {
      if (!canAccess(item.id)) return false
      if (item.requiresStoreAccess && !permissions.isAdmin && !permissions.roles.includes("dev")) {
        return permissions.storeAccess.length > 0
      }
      return true
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(checkPermission),
      }))
      .filter((group) => group.items.length > 0)
  }, [workspace, permissions, canAccess, isLoading])

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
