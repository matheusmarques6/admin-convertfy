"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Users,
  Users2,
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
  Receipt,
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
  { key: "principal", label: "Principal" },
  { key: "crm", label: "CRM & Vendas" },
  { key: "marketing", label: "Marketing" },
  { key: "operacional", label: "Operacional" },
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
  { name: "Equipe", href: "/team", icon: Users2, group: "operacional", requiredFeatures: ["team_control", "team_view"] },
  { name: "Financeiro", href: "/financial", icon: DollarSign, group: "operacional", requiredFeatures: ["view_financial"] },
  { name: "Faturas", href: "/financial?tab=charges", icon: Receipt, group: "operacional", requiredFeatures: ["view_financial"] },
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
                "flex items-center justify-center h-9 w-full rounded-md transition-colors duration-150",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
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
          "relative flex items-center gap-3 h-9 px-3 rounded-md transition-colors duration-150",
          isActive
            ? "bg-white/10 text-white font-medium"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-primary rounded-full"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <Icon className="h-[18px] w-[18px] flex-shrink-0" />
        <span className="text-sm whitespace-nowrap overflow-hidden">{item.name}</span>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-[#0C0E16] border-r border-white/[0.08] transition-all duration-300",
          sidebarCollapsed ? "w-[70px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 border-b border-white/[0.08]",
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
        <ScrollArea className="flex-1 py-3">
          <LayoutGroup>
          <nav className="px-3 space-y-4">
            {groupedNavigation.map((group) => (
              <div key={group.key}>
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {group.label}
                  </p>
                )}
                {sidebarCollapsed && group.key !== "principal" && (
                  <div className="h-px bg-white/[0.06] mx-2 my-2" />
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
        <div className="mt-auto">
          <div className="h-px bg-white/[0.08] mx-3" />
          <nav className="px-3 py-2">
            {filteredBottomNavigation.map(renderNavItem)}
          </nav>

          <div className="h-px bg-white/[0.08] mx-3" />

          <div className="p-3">
            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-center h-8 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors duration-150 mb-2",
                    sidebarCollapsed ? "w-full" : "w-8"
                  )}
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

            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full p-2 rounded-md hover:bg-white/5 transition-colors duration-150 outline-none",
                    sidebarCollapsed ? "justify-center" : "justify-start gap-3"
                  )}
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-slate-700 text-slate-300 text-xs font-medium">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden">
                      <p className="text-sm font-medium text-slate-200 truncate max-w-[140px]">
                        {user?.name || "Usuário"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[140px]">
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
          </div>

          {/* Collapse Button */}
          <div className="px-3 pb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center justify-center w-full h-7 rounded-md text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-colors duration-150"
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
      </aside>
    </TooltipProvider>
  )
}
