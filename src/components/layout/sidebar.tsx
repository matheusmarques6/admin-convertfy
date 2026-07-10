"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, X, Search } from "lucide-react"
import type { LucideIcon } from "lucide-react"
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
import { useWorkspace, WORKSPACES } from "@/hooks/use-workspace"
import { NAV_BY_WORKSPACE, type NavGroup, type NavItem } from "./nav-config"
import { SidebarItem } from "./sidebar-item"
import { SidebarUser } from "./sidebar-user"
import { WorkspaceSwitcher } from "./workspace-switcher"

// ---------------------------------------------------------------------------
// Navigation config — UM array por workspace, em ./nav-config.ts (fonte
// única, compartilhada com a CommandPalette/⌘K).
//
// Cada workspace e um "sistema separado": comercial mostra so itens
// comerciais, operacional so operacionais. Inbox aparece nos dois.
//
// O gate de cada item e por FUNCAO (role-set), centralizado em
// `src/lib/permissions/role-access.ts`. Cada NavItem declara um `id`
// estavel; o filtro abaixo consulta `canAccess(id, roles)`.
// ---------------------------------------------------------------------------

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

        {/* Footer — tema/configurações/notificações moraram aqui até jul/2026;
            hoje vivem no menu da conta (SidebarUser). Só a busca fica global. */}
        <div className="mt-auto shrink-0 border-t border-white/[0.06]">
          {commandPalette && (
            <div className="py-2 space-y-[2px]">
              <SidebarActionButton
                icon={Search}
                label="Buscar"
                shortcut="⌘K"
                collapsed={collapsed}
                onClick={commandPalette.open}
              />
            </div>
          )}

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
