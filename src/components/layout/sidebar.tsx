"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Home,
  UsersRound,
  ShoppingBag,
  Layers,
  Columns3,
  Send,
  Workflow,
  LayoutList,
  CalendarDays,
  Wallet,
  PieChart,
  Puzzle,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Sun,
  Moon,
  LucideIcon,
  UserCircle,
  ChevronDown,
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
  { key: "crm", label: "Gestao" },
  { key: "marketing", label: "Marketing" },
  { key: "operacional", label: "Operacional" },
] as const

const navigation: NavItem[] = [
  { name: "Inicio", href: ROUTES.ADMIN.DASHBOARD, icon: Home, group: "principal" },
  { name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: UsersRound, group: "crm", requiredFeatures: ["create_clients", "onboarding_control"] },
  { name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: ShoppingBag, group: "crm", requiresStoreAccess: true },
  { name: "Onboarding", href: ROUTES.ADMIN.ONBOARDING, icon: Layers, group: "crm", requiredFeatures: ["onboarding_control", "onboarding_view"] },
  { name: "Pipeline", href: ROUTES.ADMIN.PIPELINE, icon: Columns3, group: "crm", requiredFeatures: ["request_control", "request_execute"] },
  { name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.LIST, icon: Send, group: "marketing", requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
  { name: "Automacoes", href: ROUTES.ADMIN.AUTOMATIONS.LIST, icon: Workflow, group: "marketing", requiredFeatures: ["campaign_control"] },
  { name: "Board", href: ROUTES.ADMIN.BOARD, icon: LayoutList, group: "operacional", requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
  { name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: CalendarDays, group: "operacional", requiredFeatures: ["calendar_control"] },
  { name: "Financeiro", href: ROUTES.ADMIN.FINANCIAL, icon: Wallet, group: "operacional", requiredFeatures: ["view_financial"] },
  { name: "Relatorios", href: ROUTES.ADMIN.REPORTS.LIST, icon: PieChart, group: "operacional", requiredFeatures: ["view_reports"] },
  { name: "Ferramentas", href: ROUTES.ADMIN.TOOLS, icon: Puzzle, group: "operacional" },
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
                "relative flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-colors duration-150",
                active
                  ? "text-white"
                  : "text-[#b0b8c1] hover:text-white hover:bg-white/[0.07]"
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/[0.06]"
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                />
              )}
              <Icon className="h-[18px] w-[18px] relative z-10" strokeWidth={1.8} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs font-medium px-2.5 py-1.5">
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
          "relative flex items-center gap-3 h-9 px-3 rounded-lg text-[13px] transition-colors duration-150",
          active
            ? "text-white font-medium"
            : "text-[#b0b8c1] hover:text-white hover:bg-white/[0.07]"
        )}
      >
        {active && (
          <motion.div
            layoutId="nav-active"
            className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/[0.06]"
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          />
        )}
        <Icon className="h-[18px] w-[18px] shrink-0 relative z-10" strokeWidth={1.7} />
        <span className="relative z-10 truncate">{item.name}</span>
        {item.badge && (
          <span className="relative z-10 ml-auto text-[10px] font-medium bg-convertfy-blue/20 text-convertfy-blue px-1.5 py-0.5 rounded">
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
          "flex flex-col h-screen transition-all duration-300 ease-in-out sidebar-container",
          sidebarCollapsed ? "w-[64px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center shrink-0 h-14",
          sidebarCollapsed ? "justify-center" : "px-5"
        )}>
          <Link href={ROUTES.ADMIN.DASHBOARD} className="flex items-center">
            {sidebarCollapsed ? <LogoIcon size={26} /> : <Logo size="lg" />}
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3">
          <LayoutGroup>
            <nav className="py-1">
              {groupedNavigation.map((group, idx) => (
                <div key={group.key} className={cn(idx > 0 && "mt-6")}>
                  {!sidebarCollapsed && group.label && (
                    <p className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[#6e7681] uppercase">
                      {group.label}
                    </p>
                  )}
                  {sidebarCollapsed && idx > 0 && (
                    <div className="h-px bg-white/[0.06] mx-1.5 mb-2" />
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
        <div className="mt-auto shrink-0 px-3 pb-2.5">
          <div className="h-px bg-white/[0.06] mx-1 mb-2" />

          <LayoutGroup>
            <nav className="mb-2">
              {filteredBottomNavigation.map(renderNavItem)}
            </nav>
          </LayoutGroup>

          {/* User */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center w-full rounded-lg transition-colors duration-150 outline-none",
                  "hover:bg-white/[0.06]",
                  sidebarCollapsed ? "justify-center p-1.5" : "gap-2.5 px-2 py-1.5"
                )}
              >
                <Avatar className="h-7 w-7 shrink-0 rounded-full">
                  <AvatarImage src={user?.avatar_url} />
                  <AvatarFallback className="rounded-full bg-[#21262d] text-[#c9d1d9] text-[10px] font-semibold">
                    {getInitials(user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <>
                    <div className="text-left overflow-hidden flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#e6edf3] truncate leading-tight">
                        {user?.name || "Usuario"}
                      </p>
                      <p className="text-[10px] text-[#6e7681] truncate leading-tight">
                        {user?.email}
                      </p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-[#6e7681] shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={sidebarCollapsed ? "right" : "top"}
              align={sidebarCollapsed ? "start" : "center"}
              className="w-52 rounded-lg"
            >
              <DropdownMenuLabel className="font-normal px-3 py-2">
                <p className="text-sm font-medium">{user?.name || "Usuario"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="rounded-md mx-1 px-2">
                <Link href={ROUTES.ADMIN.SETTINGS.PROFILE}>
                  <UserCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                  Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-md mx-1 px-2">
                <Link href={ROUTES.ADMIN.NOTIFICATIONS}>
                  <Bell className="mr-2 h-4 w-4 text-muted-foreground" />
                  Notificacoes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="mx-1 px-2 py-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tema</span>
                <button
                  className="relative flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
                className="rounded-md mx-1 px-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Collapse */}
          {!sidebarCollapsed ? (
            <button
              className="flex items-center justify-center w-full h-7 mt-1 rounded-md text-[#6e7681] hover:text-[#b0b8c1] hover:bg-white/[0.06] transition-colors duration-150"
              onClick={() => setSidebarCollapsed(true)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center justify-center w-full h-7 mt-1 rounded-md text-[#6e7681] hover:text-[#b0b8c1] hover:bg-white/[0.06] transition-colors duration-150"
                  onClick={() => setSidebarCollapsed(false)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Expandir</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
