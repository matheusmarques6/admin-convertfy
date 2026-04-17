"use client"

import { useEffect, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Users,
  Store,
  GitBranch,
  SquareKanban,
  Calendar,
  Mail,
  DollarSign,
  FileBarChart,
  Rocket,
  Settings,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Columns3,
  LayoutDashboard,
  Target,
  Flame,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { LogoIcon } from "@/components/ui/logo"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { ROUTES } from "@/lib/routes"
import { useSidebar, useSidebarStore } from "@/hooks/use-sidebar"
import { SidebarItem } from "./sidebar-item"
import { SidebarUser } from "./sidebar-user"

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  group: string
  requiredFeatures?: string[]
  requiresStoreAccess?: boolean
  badge?: string
}

const NAV_GROUPS = [
  { key: "principal", label: "" },
  { key: "produtividade", label: "Produtividade" },
  { key: "gestao", label: "Gestao" },
  { key: "marketing", label: "Marketing" },
  { key: "operacional", label: "Operacional" },
] as const

const navigation: NavItem[] = [
  // PRINCIPAL
  { name: "Dashboard", href: ROUTES.ADMIN.DASHBOARD, icon: LayoutDashboard, group: "principal" },
  // PRODUTIVIDADE
  { name: "Inicio", href: ROUTES.ADMIN.PRODUCTIVITY.HOME, icon: Home, group: "produtividade" },
  { name: "Projetos", href: ROUTES.ADMIN.PRODUCTIVITY.BOARD, icon: Columns3, group: "produtividade" },
  { name: "Metas", href: ROUTES.ADMIN.PRODUCTIVITY.GOALS, icon: Target, group: "produtividade" },
  { name: "Habitos", href: ROUTES.ADMIN.PRODUCTIVITY.HABITS, icon: Flame, group: "produtividade" },
  { name: "Foco", href: ROUTES.ADMIN.PRODUCTIVITY.FOCUS, icon: Zap, group: "produtividade" },
  // GESTÃO
  { name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: Users, group: "gestao", requiredFeatures: ["create_clients", "onboarding_control"] },
  { name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: Store, group: "gestao", requiresStoreAccess: true },
  { name: "Pipeline", href: ROUTES.ADMIN.PIPELINE, icon: GitBranch, group: "gestao", requiredFeatures: ["request_control", "request_execute"] },
  { name: "Board", href: ROUTES.ADMIN.BOARD, icon: SquareKanban, group: "gestao", requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
  { name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: Calendar, group: "gestao", requiredFeatures: ["calendar_control"] },
  // MARKETING
  { name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.LIST, icon: Mail, group: "marketing", requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
  // OPERACIONAL
  { name: "Financeiro", href: ROUTES.ADMIN.FINANCIAL, icon: DollarSign, group: "operacional", requiredFeatures: ["view_financial"] },
  { name: "Reports", href: ROUTES.ADMIN.REPORTS.LIST, icon: FileBarChart, group: "operacional", requiredFeatures: ["view_reports"] },
  { name: "Onboarding", href: ROUTES.ADMIN.ONBOARDING, icon: Rocket, group: "operacional", requiredFeatures: ["onboarding_control", "onboarding_view"] },
]

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

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobileOpen) closeMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Filter navigation by permissions
  const filteredNavigation = useMemo(() => {
    if (isLoading || !permissions) return []
    if (permissions.isAdmin || permissions.isOrgOwner) return navigation
    return navigation.filter((item) => {
      if (!item.requiredFeatures || item.requiredFeatures.length === 0) {
        if (item.requiresStoreAccess) return permissions.storeAccess.length > 0
        return true
      }
      return hasAnyFeature(item.requiredFeatures)
    })
  }, [permissions, hasAnyFeature, isLoading])

  // Group navigation items
  const groupedNavigation = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: filteredNavigation.filter((item) => item.group === group.key),
    })).filter((group) => group.items.length > 0)
  }, [filteredNavigation])

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "dark",
          "flex flex-col h-full border-r",
          "bg-black border-white/[0.06]",
          "transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "relative z-30",
          collapsed ? "w-[68px]" : "w-[248px]"
        )}
      >
        {/* Header — logo grande + toggle discreto dentro do sidebar */}
        <div
          className={cn(
            "flex items-center shrink-0 h-[84px]",
            collapsed ? "justify-center px-2" : "justify-between pl-6 pr-3"
          )}
        >
          <Link
            href={ROUTES.ADMIN.DASHBOARD}
            className="flex items-center"
            aria-label="Convertfy"
          >
            {collapsed ? (
              <LogoIcon size={32} />
            ) : (
              <Image
                src="/images/logo-da-convertfy-com-escrito-branco.svg"
                alt="Convertfy"
                width={180}
                height={48}
                priority
                className="h-12 w-auto select-none"
              />
            )}
          </Link>

          {/* Collapse toggle — dentro do sidebar, visual clean, so quando expandido */}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Recolher menu"
                  className={cn(
                    "hidden md:flex items-center justify-center",
                    "w-8 h-8 rounded-[8px]",
                    "text-white/50 hover:text-white",
                    "hover:bg-white/[0.06] active:bg-white/[0.1]",
                    "transition-all duration-150"
                  )}
                >
                  <Icon icon={PanelLeftClose} size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="text-xs">
                Recolher
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Quando collapsed, mostra o toggle na borda esquerda do conteudo
            principal (via botao flutuante) para nao conflitar com a logo */}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                aria-label="Expandir menu"
                className={cn(
                  "absolute top-7 -right-[14px] z-40",
                  "hidden md:flex items-center justify-center",
                  "w-7 h-7 rounded-full",
                  "bg-white text-black shadow-[0_2px_8px_rgba(0,0,0,0.2)]",
                  "hover:bg-gray-50",
                  "transition-all duration-150",
                  "ring-1 ring-black/5"
                )}
              >
                <Icon icon={PanelLeftOpen} customSize={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={16} className="text-xs">
              Expandir
            </TooltipContent>
          </Tooltip>
        )}

        {/* Navigation */}
        <ScrollArea className="flex-1 pt-2 pb-4">
          <nav>
            {groupedNavigation.map((group, idx) => (
              <div key={group.key} className={cn(idx > 0 && "mt-5")}>
                {/* Group label */}
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
                      key={item.name}
                      icon={item.icon}
                      label={item.name}
                      href={item.href}
                      collapsed={collapsed}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="mt-auto shrink-0 border-t border-white/[0.06]">
          <div className="py-2 space-y-[2px]">
            <SidebarItem
              icon={Settings}
              label="Configuracoes"
              href={ROUTES.ADMIN.SETTINGS.ROOT}
              collapsed={collapsed}
            />
            <SidebarItem
              icon={Bell}
              label="Notificacoes"
              href={ROUTES.ADMIN.NOTIFICATIONS}
              collapsed={collapsed}
            />
          </div>

          {/* User */}
          <div className="border-t border-white/[0.06]">
            <SidebarUser user={user} collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Mobile drawer wrapper
// ---------------------------------------------------------------------------

export function SidebarMobileDrawer({ user }: Pick<SidebarProps, "user">) {
  const { isMobileOpen, closeMobile } = useSidebarStore()

  return (
    <>
      {/* Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] md:hidden",
          "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
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
