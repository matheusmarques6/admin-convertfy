"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Users,
  Kanban,
  ClipboardList,
  Zap,
  BarChart3,
  Settings,
  Wrench,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  DollarSign,
  Calendar,
  CalendarDays,
  Store,
  Rocket,
  Sun,
  Moon,
  LucideIcon,
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
  { key: "crm", label: "Gestão" },
  { key: "marketing", label: "Marketing" },
  { key: "operacional", label: "Operações" },
  { key: "ferramentas", label: "Ferramentas" },
] as const

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "principal" },
  { name: "Clientes", href: "/clients", icon: Users, group: "crm", requiredFeatures: ["create_clients"] },
  { name: "Lojas", href: "/stores", icon: Store, group: "crm", requiresStoreAccess: true },
  { name: "Onboarding", href: "/onboarding", icon: Rocket, group: "crm", requiredFeatures: ["onboarding_control", "onboarding_view"] },
  { name: "Pipeline", href: "/pipeline", icon: Kanban, group: "crm", requiredFeatures: ["request_control", "request_execute"] },
  { name: "Campanhas", href: "/campaigns", icon: CalendarDays, group: "marketing", requiredFeatures: ["campaign_control", "campaign_view"] },
  { name: "Automações", href: "/automations", icon: Zap, group: "marketing", requiredFeatures: ["campaign_control"] },
  { name: "Board", href: "/board", icon: ClipboardList, group: "operacional", requiredFeatures: ["request_control", "request_execute"] },
  { name: "Reuniões", href: "/meetings", icon: Calendar, group: "operacional", requiredFeatures: ["calendar_control"] },

  { name: "Financeiro", href: "/financial", icon: DollarSign, group: "operacional", requiredFeatures: ["view_financial"] },
  { name: "Relatórios", href: "/reports", icon: BarChart3, group: "operacional", requiredFeatures: ["view_reports"] },
  { name: "Ferramentas", href: "/tools", icon: Wrench, group: "ferramentas" },
]

const bottomNavigation: NavItem[] = [
  { name: "Configurações", href: "/settings", icon: Settings, group: "bottom" },
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
      router.push("/login")
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: "Tente novamente",
      })
    } finally {
      setIsLoggingOut(false)
    }
  }

  function renderNavItem(item: NavItem) {
    const isActive = item.href.includes("?")
      ? pathname === item.href.split("?")[0]
      : pathname.startsWith(item.href)
    const Icon = item.icon

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={cn(
                "relative flex items-center justify-center h-9 w-full rounded-lg transition-colors duration-150",
                isActive
                  ? "text-primary"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-primary rounded-r-full"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
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
          isActive
            ? "text-white font-medium"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-primary rounded-r-full"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive && "text-primary")} />
        <span className="whitespace-nowrap overflow-hidden">{item.name}</span>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-[#0C0E16] border-r border-white/[0.06] transition-all duration-300",
          sidebarCollapsed ? "w-[70px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 shrink-0",
          sidebarCollapsed ? "justify-center px-2" : "px-5"
        )}>
          <Link href="/dashboard" className="flex items-center">
            {sidebarCollapsed ? (
              <LogoIcon className="w-8 h-8" />
            ) : (
              <Logo size="lg" showText={true} />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <LayoutGroup>
          <nav className={cn("space-y-5", sidebarCollapsed ? "px-2" : "px-3")}>
            {groupedNavigation.map((group, idx) => (
              <div key={group.key}>
                {/* Group label - only for non-first groups when expanded */}
                {!sidebarCollapsed && group.label && (
                  <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
                    {group.label}
                  </p>
                )}
                {/* Divider for collapsed mode */}
                {sidebarCollapsed && idx > 0 && (
                  <div className="h-px bg-white/[0.06] mx-1 mb-2" />
                )}
                <div className="space-y-0.5">
                  {group.items.map(renderNavItem)}
                </div>
              </div>
            ))}
          </nav>
          </LayoutGroup>
        </ScrollArea>

        {/* Bottom Section */}
        <div className="mt-auto shrink-0">
          <div className="h-px bg-white/[0.06] mx-3" />

          {/* Settings */}
          <nav className={cn("py-2", sidebarCollapsed ? "px-2" : "px-3")}>
            {filteredBottomNavigation.map(renderNavItem)}
          </nav>

          <div className="h-px bg-white/[0.06] mx-3" />

          {/* User & Controls */}
          <div className="p-3 space-y-2">
            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-lg hover:bg-white/[0.06] transition-colors duration-150 outline-none",
                    sidebarCollapsed ? "justify-center p-2" : "gap-3 p-2"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden flex-1">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {user?.name || "Usuário"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {user?.email}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/profile">
                    <Settings className="mr-2 h-4 w-4" />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/notifications">
                    <Bell className="mr-2 h-4 w-4" />
                    Notificações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Controls row */}
            <div className={cn(
              "flex items-center",
              sidebarCollapsed ? "flex-col gap-1" : "gap-1"
            )}>
              {/* Theme Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors duration-150"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {theme === "dark" ? "Modo claro" : "Modo escuro"}
                </TooltipContent>
              </Tooltip>

              {/* Collapse Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors duration-150"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {sidebarCollapsed ? "Expandir" : "Recolher"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
