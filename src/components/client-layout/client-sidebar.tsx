"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BarChart3,
  Store,
  Mail,
  Zap,
  Receipt,
  Plug,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Icon } from "@/components/ui/icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ROUTES } from "@/lib/routes"
import { useSidebar, useSidebarStore } from "@/hooks/use-sidebar"
import { SidebarItem } from "@/components/layout/sidebar-item"
import { ClientSidebarUser } from "./client-sidebar-user"

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  group: string
}

const NAV_GROUPS = [
  { key: "principal", label: "" },
  { key: "lojas", label: "Lojas" },
  { key: "financeiro", label: "Financeiro" },
  { key: "configuracao", label: "Configuracao" },
] as const

const navigation: NavItem[] = [
  // PRINCIPAL
  { name: "Dashboard", href: ROUTES.CLIENT.DASHBOARD, icon: LayoutDashboard, group: "principal" },
  { name: "Analytics", href: ROUTES.CLIENT.ANALYTICS, icon: BarChart3, group: "principal" },
  // LOJAS
  { name: "Minhas Lojas", href: ROUTES.CLIENT.STORES.LIST, icon: Store, group: "lojas" },
  { name: "Campanhas", href: ROUTES.CLIENT.CAMPAIGNS, icon: Mail, group: "lojas" },
  { name: "Flows", href: ROUTES.CLIENT.FLOWS, icon: Zap, group: "lojas" },
  // FINANCEIRO
  { name: "Faturas", href: ROUTES.CLIENT.INVOICES, icon: Receipt, group: "financeiro" },
  // CONFIGURAÇÃO
  { name: "Integracoes", href: ROUTES.CLIENT.INTEGRATIONS, icon: Plug, group: "configuracao" },
  { name: "Rastreamento", href: ROUTES.CLIENT.TRACKING.ROOT, icon: Package, group: "configuracao" },
  { name: "Configuracoes", href: ROUTES.CLIENT.SETTINGS, icon: Settings, group: "configuracao" },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ClientSidebarProps {
  user?: {
    name: string
    email: string
    clientName: string
    avatar_url?: string | null
  }
  /** Force expanded mode (used in mobile drawer) */
  forceExpanded?: boolean
}

export function ClientSidebar({ user, forceExpanded }: ClientSidebarProps) {
  const pathname = usePathname()
  const { isExpanded, isMobileOpen, toggle, closeMobile } = useSidebar()
  const collapsed = forceExpanded ? false : !isExpanded

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobileOpen) closeMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Group navigation items
  const groupedNavigation = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: navigation.filter((item) => item.group === group.key),
    })).filter((group) => group.items.length > 0)
  }, [])

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-full bg-white border-r border-[rgba(0,0,0,0.08)]",
          "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]",
          "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
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
          <Link href={ROUTES.CLIENT.DASHBOARD} className="flex items-center">
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

        {/* Footer — User section */}
        <div className="mt-auto shrink-0 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <ClientSidebarUser user={user} collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Mobile drawer wrapper
// ---------------------------------------------------------------------------

export function ClientSidebarMobileDrawer({ user }: Pick<ClientSidebarProps, "user">) {
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
          "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
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
        <ClientSidebar user={user} forceExpanded />
      </div>
    </>
  )
}
