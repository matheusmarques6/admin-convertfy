"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
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
  ChevronLeft,
  ChevronRight,
  X,
  Home,
  Columns3,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
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
          "flex flex-col h-full bg-white border-r border-[rgba(0,0,0,0.08)]",
          "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]",
          "transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "relative z-30",
          collapsed ? "w-16" : "w-[240px]"
        )}
      >
        {/* Logo area */}
        <div
          className={cn(
            "flex items-center shrink-0 h-16 border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
            collapsed ? "justify-center px-2" : "px-4 gap-3"
          )}
        >
          <Link href={ROUTES.ADMIN.DASHBOARD} className="flex items-center">
            {collapsed ? <LogoIcon size={28} /> : <Logo size="md" />}
          </Link>
        </div>

        {/* Collapse toggle button — floats on the border */}
        <button
          onClick={toggle}
          className={cn(
            "absolute top-[22px] -right-3 z-40",
            "w-6 h-6 rounded-full flex items-center justify-center",
            "bg-white border border-[rgba(0,0,0,0.08)] shadow-sm",
            "dark:bg-[#242836] dark:border-[rgba(255,255,255,0.08)]",
            "hover:bg-gray-50 dark:hover:bg-[#2E3347]",
            "transition-colors duration-150",
            "hidden md:flex"
          )}
        >
          <Icon
            icon={collapsed ? ChevronRight : ChevronLeft}
            customSize={14}
            className="text-gray-500 dark:text-[#8B92A5]"
          />
        </button>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav>
            {groupedNavigation.map((group, idx) => (
              <div key={group.key} className={cn(idx > 0 && "mt-1")}>
                {/* Group label */}
                {!collapsed && group.label && (
                  <p className="px-5 pt-4 pb-1 text-[10px] font-medium text-gray-400 uppercase tracking-[0.06em] dark:text-[#5C6378]">
                    {group.label}
                  </p>
                )}
                {collapsed && idx > 0 && (
                  <div className="h-px bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.06)] mx-3 my-2" />
                )}
                <div className="space-y-0.5">
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
        <div className="mt-auto shrink-0 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          {/* Settings + Notifications */}
          <div className="py-2 space-y-0.5">
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
          <div className="border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
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
