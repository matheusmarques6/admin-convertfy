"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutGrid,
  Users,
  KanbanSquare,
  ListTodo,
  Zap,
  BarChart2,
  Settings,
  Wrench,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  CircleDollarSign,
  CalendarCheck,
  Store,
  Sparkles,
  Sun,
  Moon,
  LucideIcon,
  UserCircle,
  ChevronDown,
  Search,
  Megaphone,
} from "lucide-react"
import { motion, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useUIStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { ROUTES } from "@/lib/routes"

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
  { key: "crm", label: "CRM" },
  { key: "marketing", label: "Marketing" },
  { key: "operacional", label: "Operacional" },
  { key: "ferramentas", label: "Ferramentas" },
] as const

const navigation: NavItem[] = [
  { name: "Dashboard", href: ROUTES.ADMIN.DASHBOARD, icon: LayoutGrid, group: "principal" },
  { name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: Users, group: "crm", requiredFeatures: ["create_clients", "onboarding_control"] },
  { name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: Store, group: "crm", requiresStoreAccess: true },
  { name: "Onboarding", href: ROUTES.ADMIN.ONBOARDING, icon: Sparkles, group: "crm", requiredFeatures: ["onboarding_control", "onboarding_view"] },
  { name: "Pipeline", href: ROUTES.ADMIN.PIPELINE, icon: KanbanSquare, group: "crm", requiredFeatures: ["request_control", "request_execute"] },
  { name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.LIST, icon: Megaphone, group: "marketing", requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
  { name: "Automacoes", href: ROUTES.ADMIN.AUTOMATIONS.LIST, icon: Zap, group: "marketing", requiredFeatures: ["campaign_control"] },
  { name: "Board", href: ROUTES.ADMIN.BOARD, icon: ListTodo, group: "operacional", requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
  { name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: CalendarCheck, group: "operacional", requiredFeatures: ["calendar_control"] },
  { name: "Financeiro", href: ROUTES.ADMIN.FINANCIAL, icon: CircleDollarSign, group: "operacional", requiredFeatures: ["view_financial"] },
  { name: "Relatorios", href: ROUTES.ADMIN.REPORTS.LIST, icon: BarChart2, group: "operacional", requiredFeatures: ["view_reports"] },
  { name: "Ferramentas", href: ROUTES.ADMIN.TOOLS, icon: Wrench, group: "ferramentas" },
]

const bottomNavigation: NavItem[] = [
  { name: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT, icon: Settings, group: "bottom" },
]

interface SidebarProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { permissions, hasAnyFeature, isLoading } = usePermissions()

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setSidebarCollapsed(true)
    }
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [setSidebarCollapsed])

  const filteredNavigation = useMemo(() => {
    if (isLoading || !permissions) return []
    if (permissions.isAdmin || permissions.isOrgOwner) return navigation
    return navigation.filter(item => {
      if (!item.requiredFeatures || item.requiredFeatures.length === 0) {
        if (item.requiresStoreAccess) return permissions.storeAccess.length > 0
        return true
      }
      return hasAnyFeature(item.requiredFeatures)
    })
  }, [permissions, hasAnyFeature, isLoading])

  const groupedNavigation = useMemo(() => {
    return NAV_GROUPS.map(group => ({
      ...group,
      items: filteredNavigation.filter(item => item.group === group.key),
    })).filter(group => group.items.length > 0)
  }, [filteredNavigation])

  const filteredBottomNavigation = useMemo(() => {
    if (isLoading || !permissions) return []
    return bottomNavigation
  }, [permissions, isLoading])

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push(ROUTES.LOGIN)
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao sair", description: "Tente novamente" })
    } finally {
      setIsLoggingOut(false)
    }
  }

  function checkActive(href: string) {
    if (href === ROUTES.ADMIN.DASHBOARD) return pathname === ROUTES.ADMIN.DASHBOARD || pathname === ROUTES.ADMIN.DASHBOARD_OPERATIONAL
    return pathname.startsWith(href)
  }

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  }

  function renderNavItem(item: NavItem) {
    const active = checkActive(item.href)
    const Icon = item.icon

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={cn(
                "sidebar-nav-item relative flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200",
                active
                  ? "sidebar-nav-item-active bg-white/[0.08] text-white"
                  : "text-sidebar-muted hover:text-sidebar-hover hover:bg-white/[0.05]"
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-bg"
                  className="absolute inset-0 rounded-xl bg-gradient-to-b from-convertfy-blue/20 to-convertfy-blue/5 border border-convertfy-blue/20"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <Icon
                className={cn("h-[18px] w-[18px] relative z-10", active && "text-convertfy-blue")}
                strokeWidth={active ? 2 : 1.5}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-xs px-3 py-1.5 rounded-lg">
            {item.name}
          </TooltipContent>
        </Tooltip>
      )
    }

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "sidebar-nav-item relative flex items-center gap-3 h-9 px-3 rounded-xl text-[13px] transition-all duration-200 group",
          active
            ? "sidebar-nav-item-active text-white font-medium"
            : "text-sidebar-muted hover:text-sidebar-hover hover:bg-white/[0.04]"
        )}
      >
        {active && (
          <motion.div
            layoutId="sidebar-active-bg"
            className="absolute inset-0 rounded-xl bg-gradient-to-r from-convertfy-blue/15 to-convertfy-blue/5 border border-convertfy-blue/15"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <div className={cn(
          "flex items-center justify-center w-7 h-7 rounded-lg shrink-0 relative z-10 transition-all duration-200",
          active
            ? "bg-convertfy-blue/15 text-convertfy-blue"
            : "text-sidebar-icon group-hover:text-sidebar-hover"
        )}>
          <Icon className="h-[16px] w-[16px]" strokeWidth={active ? 2 : 1.5} />
        </div>
        <span className="relative z-10 whitespace-nowrap overflow-hidden">{item.name}</span>
        {item.badge && (
          <span className="relative z-10 ml-auto text-[10px] font-semibold bg-convertfy-blue/20 text-convertfy-blue px-1.5 py-0.5 rounded-md">
            {item.badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen transition-all duration-300 ease-in-out",
          "sidebar-container",
          sidebarCollapsed ? "w-[68px]" : "w-[248px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-[60px] shrink-0",
          sidebarCollapsed ? "justify-center px-2" : "px-5"
        )}>
          <Link href={ROUTES.ADMIN.DASHBOARD} className="flex items-center">
            {sidebarCollapsed ? (
              <LogoIcon size={28} />
            ) : (
              <Logo size="md" />
            )}
          </Link>
        </div>

        {/* Search */}
        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
            <button className="flex items-center gap-2.5 w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sidebar-muted hover:text-sidebar-hover hover:bg-white/[0.06] hover:border-white/[0.10] transition-all duration-200 text-[12px]">
              <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>Buscar...</span>
              <kbd className="ml-auto text-[10px] text-slate-500 bg-white/[0.06] px-1.5 py-0.5 rounded-md font-mono">⌘K</kbd>
            </button>
          </div>
        )}

        {sidebarCollapsed && (
          <div className="px-2 pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-sidebar-muted hover:text-sidebar-hover hover:bg-white/[0.05] transition-all duration-200">
                  <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Buscar (⌘K)</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mx-4 mb-1" />

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <LayoutGroup>
            <nav className={cn("py-2", sidebarCollapsed ? "px-2" : "px-2.5")}>
              {groupedNavigation.map((group, idx) => (
                <div key={group.key} className={cn(idx > 0 && "mt-5")}>
                  {!sidebarCollapsed && group.label && (
                    <div className="px-3 mb-2">
                      <p className="text-[10px] font-semibold tracking-[0.12em] text-sidebar-label/70 uppercase">
                        {group.label}
                      </p>
                    </div>
                  )}
                  {sidebarCollapsed && idx > 0 && (
                    <div className="h-px bg-white/[0.05] mx-2 mb-3 mt-1" />
                  )}
                  <div className="space-y-0.5">
                    {group.items.map(renderNavItem)}
                  </div>
                </div>
              ))}
            </nav>
          </LayoutGroup>
        </ScrollArea>

        {/* Bottom */}
        <div className="mt-auto shrink-0">
          <div className="h-px bg-white/[0.06] mx-4" />

          <LayoutGroup>
            <nav className={cn("py-2", sidebarCollapsed ? "px-2" : "px-2.5")}>
              {filteredBottomNavigation.map(renderNavItem)}
            </nav>
          </LayoutGroup>

          <div className="h-px bg-white/[0.06] mx-4" />

          {/* User */}
          <div className="p-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-xl transition-all duration-200 outline-none",
                    "hover:bg-white/[0.05]",
                    sidebarCollapsed ? "justify-center p-2" : "gap-2.5 p-2"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0 rounded-xl ring-1 ring-white/10">
                    <AvatarImage src={user?.avatar_url} className="rounded-xl" />
                    <AvatarFallback className="rounded-xl bg-gradient-to-br from-convertfy-blue to-convertfy-blue-deep text-white text-[11px] font-semibold">
                      {getInitials(user?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <>
                      <div className="text-left overflow-hidden flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-200 truncate leading-tight">
                          {user?.name || "Usuario"}
                        </p>
                        <p className="text-[11px] text-sidebar-muted truncate leading-tight mt-0.5">
                          {user?.email}
                        </p>
                      </div>
                      <ChevronDown className="h-3 w-3 text-sidebar-muted/60 shrink-0" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={sidebarCollapsed ? "right" : "top"}
                align={sidebarCollapsed ? "start" : "center"}
                className="w-56 rounded-xl"
              >
                <DropdownMenuLabel className="font-normal px-3 py-2.5">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-semibold">{user?.name || "Usuario"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-lg mx-1 px-2.5">
                  <Link href={ROUTES.ADMIN.SETTINGS.PROFILE}>
                    <UserCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-lg mx-1 px-2.5">
                  <Link href={ROUTES.ADMIN.NOTIFICATIONS}>
                    <Bell className="mr-2 h-4 w-4 text-muted-foreground" />
                    Notificacoes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="mx-1 px-2.5 py-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Tema</span>
                  <button
                    className="relative flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="rounded-lg mx-1 px-2.5 text-red-400 focus:text-red-400 focus:bg-red-500/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Collapse Toggle */}
            {!sidebarCollapsed ? (
              <button
                className="flex items-center justify-center w-full h-8 mt-1 rounded-xl text-sidebar-muted/60 hover:text-sidebar-hover hover:bg-white/[0.04] transition-all duration-200"
                onClick={() => setSidebarCollapsed(true)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center w-full h-8 mt-1 rounded-xl text-sidebar-muted/60 hover:text-sidebar-hover hover:bg-white/[0.04] transition-all duration-200"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Expandir</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
