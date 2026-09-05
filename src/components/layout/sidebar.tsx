"use client"

/**
 * Sidebar do admin — shell variante C (design ago/2026): clara/flat no
 * modo claro, grafite no escuro, acento do workspace no TEXTO do item
 * ativo (sem pílula de fundo). Theme-aware via tokens --sidebar-* de
 * globals.css — a versão anterior forçava `dark` + bg-black e não tinha
 * modo claro possível.
 *
 * Estrutura: logo → abas de workspace → nav (grupos separados só por
 * espaço) → footer (Buscar ⌘K · Notificações · Configurações · conta).
 * Colapsa para 64px (chevron flutuante na borda direita).
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronLeft, ChevronRight, X, Search, Bell, Settings } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
import { useSettingsModalSafe } from "@/components/settings/settings-modal"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { ROUTES } from "@/lib/routes"
import { useSidebar, useSidebarStore } from "@/hooks/use-sidebar"
import { useWorkspace, WORKSPACES } from "@/hooks/use-workspace"
import { useInboxUnread } from "@/hooks/use-inbox-unread"
import { useUnifiedNotifications } from "@/hooks/use-unified-notifications"
import { filterNavGroups, NAV_BY_WORKSPACE, type NavGroup, type NavItem } from "./nav-config"
import { SidebarUser } from "./sidebar-user"
import { WorkspaceTabs } from "./workspace-switcher"

// ---------------------------------------------------------------------------
// Active-route matching (regras herdadas do sidebar-item antigo):
//  - href com query (ex.: ?scope=mine) compara o param `scope`;
//  - dashboards casam por igualdade exata (evita 3 itens ativos);
//  - resto casa por prefixo.
// ---------------------------------------------------------------------------

const EXACT_MATCH_HREFS = new Set<string>([
  ROUTES.ADMIN.DASHBOARD,
  ROUTES.ADMIN.COMERCIAL.DASHBOARD,
  ROUTES.ADMIN.OPERACIONAL.DASHBOARD,
])

function isActiveHref(
  pathname: string,
  scopeParam: string | null,
  href: string,
): boolean {
  const [hrefPath, hrefQuery] = href.split("?")
  if (hrefQuery) {
    const wanted = new URLSearchParams(hrefQuery).get("scope")
    return pathname === hrefPath && scopeParam === wanted
  }
  // Rota compartilhada: sem query no href, só ativa quando a URL também
  // não carrega scope (senão "Reuniões" e "Minhas reuniões" acendem juntas).
  if (pathname === hrefPath) {
    if (hrefPath === ROUTES.ADMIN.MEETINGS.LIST) return scopeParam === null
    return true
  }
  if (EXACT_MATCH_HREFS.has(href)) return false
  return pathname.startsWith(hrefPath + "/")
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
  const pathname = usePathname() || ""
  const searchParams = useSearchParams()
  const scopeParam = searchParams.get("scope")
  const { isExpanded, isMobileOpen, toggle, closeMobile } = useSidebar()
  const collapsed = forceExpanded ? false : !isExpanded
  const { permissions, canAccess, isLoading } = usePermissions()
  const workspace = useWorkspace()
  const wsMeta = WORKSPACES[workspace]
  const commandPalette = useCommandPaletteSafe()
  const settingsModal = useSettingsModalSafe()
  const { unreadTotal: notificationsUnread } = useUnifiedNotifications()
  const inboxUnread = useInboxUnread(Boolean(permissions) && canAccess("comercial.inbox"))

  // Close mobile drawer on navigation
  useEffect(() => {
    if (isMobileOpen) closeMobile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Gate por função — régua única em nav-config.filterNavGroups.
  const filteredGroups = useMemo<NavGroup[]>(() => {
    if (isLoading || !permissions) return []
    return filterNavGroups(NAV_BY_WORKSPACE[workspace], {
      canAccess,
      isAdmin: permissions.isAdmin,
      roles: permissions.roles,
      storeAccessCount: permissions.storeAccess.length,
    })
  }, [workspace, permissions, canAccess, isLoading])

  const badgeFor = (item: NavItem): number | undefined =>
    item.id === "comercial.inbox" && inboxUnread > 0 ? inboxUnread : undefined

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative flex flex-col h-full border-r",
          "bg-[var(--sidebar-background)] border-[var(--sidebar-border)]",
          "transition-all duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          "z-30",
          collapsed ? "w-16" : "w-[232px]",
        )}
        style={{
          // Acento do workspace disponível pra toda a árvore (item ativo).
          ["--ws-accent" as string]: wsMeta.color,
          ["--ws-accent-dark" as string]: wsMeta.colorDark,
        }}
      >
        {/* Chevron flutuante de colapso (desktop; o drawer não colapsa) */}
        {!forceExpanded && (
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "hidden md:flex absolute -right-[11px] top-16 z-40",
              "w-[22px] h-[22px] rounded-full items-center justify-center",
              "bg-popover border border-[var(--sidebar-border)] shadow-sm",
              "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]",
              "transition-colors duration-150",
            )}
          >
            <Icon icon={collapsed ? ChevronRight : ChevronLeft} customSize={12} />
          </button>
        )}

        {/* Logo */}
        <div
          className={cn(
            "flex items-center shrink-0",
            collapsed ? "justify-center pt-[22px] pb-4" : "pl-[18px] pr-4 pt-6 pb-[18px]",
          )}
        >
          <Link href={ROUTES.ADMIN.DASHBOARD} className="flex items-center">
            {collapsed ? <LogoIcon size={30} /> : <Logo size="md" />}
          </Link>
        </div>

        {/* Switcher de workspaces (abas). Colapsado: ícone do ativo — o
            clique expande pra trocar. */}
        <div
          className={cn(
            "shrink-0",
            collapsed ? "flex justify-center pb-2.5" : "px-3 pb-3",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label={`${wsMeta.label} — expandir menu`}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: wsMeta.colorBg }}
                >
                  <span className="flex text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]">
                    <Icon icon={wsMeta.icon} customSize={15} />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
                {wsMeta.label} — expandir pra trocar
              </TooltipContent>
            </Tooltip>
          ) : (
            <WorkspaceTabs current={workspace} />
          )}
        </div>

        {/* Navegação — grupos separados por espaço (sem labels, design C) */}
        <ScrollArea className="flex-1">
          <nav className={cn("pt-1.5 pb-3", collapsed ? "px-0" : "px-3")}>
            {filteredGroups.map((group, idx) => (
              <div
                key={group.key}
                className={cn(
                  "flex flex-col gap-[3px]",
                  collapsed && "items-center",
                  idx > 0 && "mt-[18px]",
                )}
              >
                {group.items.map((item) =>
                  item.children ? (
                    <NavRowWithChildren
                      key={item.id}
                      item={item}
                      collapsed={collapsed}
                      pathname={pathname}
                      scopeParam={scopeParam}
                    />
                  ) : (
                    <NavRow
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      active={isActiveHref(pathname, scopeParam, item.href)}
                      badge={badgeFor(item)}
                    />
                  ),
                )}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer — ações globais + conta */}
        <div
          className={cn(
            "mt-auto shrink-0 flex flex-col gap-[2px] pt-1.5 pb-2",
            collapsed ? "items-center px-0" : "px-3",
          )}
        >
          {commandPalette && (
            <FooterAction
              icon={Search}
              label="Buscar"
              shortcut="⌘K"
              collapsed={collapsed}
              onClick={commandPalette.open}
            />
          )}
          <FooterAction
            icon={Bell}
            label="Notificações"
            collapsed={collapsed}
            href={ROUTES.ADMIN.NOTIFICATIONS}
            dot={notificationsUnread > 0}
          />
          <FooterAction
            icon={Settings}
            label="Configurações"
            collapsed={collapsed}
            onClick={() => {
              if (settingsModal) settingsModal.open()
            }}
            href={settingsModal ? undefined : ROUTES.ADMIN.SETTINGS.ROOT}
          />
          <div
            className={cn(
              "mt-1 pt-1 border-t border-[var(--sidebar-border)]",
              collapsed ? "w-9 flex justify-center" : "w-full",
            )}
          >
            <SidebarUser user={user} collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Item de navegação (variante C): acento no TEXTO quando ativo, hover de
// fundo sutil. Colapsado: 36px, tooltip, dot de badge.
// ---------------------------------------------------------------------------

function NavRow({
  item,
  collapsed,
  active,
  badge,
}: {
  item: NavItem
  collapsed: boolean
  active: boolean
  badge?: number
}) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-md text-[13px] transition-colors duration-150",
        "hover:bg-[var(--sidebar-hover)]",
        collapsed ? "w-9 h-[33px] justify-center" : "w-full h-[33px] gap-[11px] px-2.5",
        active
          ? "font-semibold text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
          : "font-medium text-[var(--sidebar-foreground)]",
      )}
    >
      <span
        className={cn(
          "flex shrink-0",
          active
            ? "text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
            : "text-[var(--sidebar-muted-foreground)]",
        )}
      >
        <Icon icon={item.icon} customSize={16} />
      </span>
      {!collapsed && <span className="flex-1 truncate">{item.name}</span>}
      {!collapsed && badge != null && (
        <span className="min-w-[18px] h-[18px] px-[5px] rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {collapsed && badge != null && (
        <span className="absolute top-[3px] right-[3px] w-[7px] h-[7px] rounded-full bg-[#DC2626]" />
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
          {item.name}
          {badge != null && ` (${badge})`}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

// ---------------------------------------------------------------------------
// Item com submenu suspenso (ex.: Conteúdo). Expandido: o rótulo abre/fecha
// a lista de filhos embaixo (abre sozinho quando um filho está ativo).
// Colapsado: o ícone abre um flyout à direita com os filhos.
// ---------------------------------------------------------------------------

function NavRowWithChildren({
  item,
  collapsed,
  pathname,
  scopeParam,
}: {
  item: NavItem
  collapsed: boolean
  pathname: string
  scopeParam: string | null
}) {
  const children = item.children ?? []
  const childActive = children.some((c) => isActiveHref(pathname, scopeParam, c.href))
  const parentPath = item.href.split("?")[0].split("/").slice(0, 4).join("/")
  const active = childActive || pathname.startsWith(parentPath)
  const [open, setOpen] = useState(active)
  const [flyout, setFlyout] = useState(false)

  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  useEffect(() => {
    setFlyout(false)
  }, [pathname])

  const iconEl = (
    <span
      className={cn(
        "flex shrink-0",
        active
          ? "text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
          : "text-[var(--sidebar-muted-foreground)]",
      )}
    >
      <Icon icon={item.icon} customSize={16} />
    </span>
  )

  const childRows = (indent: boolean) =>
    children.map((c) => {
      const on = isActiveHref(pathname, scopeParam, c.href)
      return (
        <Link
          key={c.id}
          href={c.href}
          aria-current={on ? "page" : undefined}
          className={cn(
            "flex items-center h-[30px] rounded-md text-[12.5px] transition-colors duration-150",
            "hover:bg-[var(--sidebar-hover)]",
            indent ? "pl-[37px] pr-2.5" : "px-2.5",
            on
              ? "font-semibold text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
              : "font-medium text-[var(--sidebar-foreground)]",
          )}
        >
          <span className="truncate">{c.name}</span>
        </Link>
      )
    })

  if (collapsed) {
    return (
      <Popover open={flyout} onOpenChange={setFlyout}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={item.name}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center justify-center w-9 h-[33px] rounded-md transition-colors duration-150",
                  "hover:bg-[var(--sidebar-hover)]",
                  flyout && "bg-[var(--sidebar-hover)]",
                )}
              >
                {iconEl}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          {!flyout && (
            <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
              {item.name}
            </TooltipContent>
          )}
        </Tooltip>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={10}
          className="w-[184px] p-1.5 rounded-lg border-[var(--sidebar-border)] bg-[var(--sidebar-background)] shadow-lg"
        >
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--sidebar-muted-foreground)]">
            {item.name}
          </div>
          <div className="flex flex-col gap-[2px]">{childRows(false)}</div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="flex flex-col gap-[2px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-current={active && !open ? "page" : undefined}
        className={cn(
          "relative flex items-center w-full h-[33px] gap-[11px] px-2.5 rounded-md text-[13px] transition-colors duration-150 text-left",
          "hover:bg-[var(--sidebar-hover)]",
          active
            ? "font-semibold text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
            : "font-medium text-[var(--sidebar-foreground)]",
        )}
      >
        {iconEl}
        <span className="flex-1 truncate">{item.name}</span>
        <span
          className={cn(
            "flex text-[var(--sidebar-muted-foreground)] transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <Icon icon={ChevronDown} customSize={12} />
        </span>
      </button>
      {open && <div className="flex flex-col gap-[2px]">{childRows(true)}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ação do footer (Buscar/Notificações/Configurações) — botão ou link com o
// mesmo visual do item de nav.
// ---------------------------------------------------------------------------

function FooterAction({
  icon,
  label,
  collapsed,
  onClick,
  href,
  shortcut,
  dot,
}: {
  icon: LucideIcon
  label: string
  collapsed: boolean
  onClick?: () => void
  href?: string
  shortcut?: string
  dot?: boolean
}) {
  const inner = (
    <>
      <span className="relative flex shrink-0 text-[var(--sidebar-muted-foreground)]">
        <Icon icon={icon} customSize={16} />
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full bg-[#DC2626]" />
        )}
      </span>
      {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
      {!collapsed && shortcut && (
        <kbd className="text-[9.5px] font-semibold text-[var(--sidebar-muted-foreground)] border border-[var(--sidebar-border)] rounded px-[5px] py-px">
          {shortcut}
        </kbd>
      )}
    </>
  )
  const className = cn(
    "relative flex items-center rounded-md text-[13px] font-medium transition-colors duration-150",
    "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)]",
    collapsed ? "w-9 h-[33px] justify-center" : "w-full h-[33px] gap-[11px] px-2.5",
  )

  const el = href ? (
    <Link href={href} className={className} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{el}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
          {label}
          {shortcut && ` (${shortcut})`}
        </TooltipContent>
      </Tooltip>
    )
  }
  return el
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
            aria-label="Fechar menu"
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-[6px] flex items-center justify-center bg-[var(--sidebar-hover)] text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Sidebar user={user} forceExpanded />
      </div>
    </>
  )
}
