"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Home,
  Users,
  Building2,
  Sparkles,
  Columns3,
  Send,
  Zap,
  LayoutList,
  CalendarDays,
  Wallet,
  LineChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Sun,
  Moon,
  type LucideIcon,
} from "lucide-react"
import { motion, LayoutGroup } from "framer-motion"
import { cn } from "@/lib/utils"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  requiredFeatures?: string[]
  requiresStoreAccess?: boolean
}

const navigation: NavItem[] = [
  { name: "Início", href: "/dashboard", icon: Home },
  { name: "Clientes", href: "/clients", icon: Users, requiredFeatures: ["create_clients", "onboarding_control"] },
  { name: "Lojas", href: "/stores", icon: Building2, requiresStoreAccess: true },
  { name: "Onboarding", href: "/onboarding", icon: Sparkles, requiredFeatures: ["onboarding_control", "onboarding_view"] },
  { name: "Pipeline", href: "/pipeline", icon: Columns3, requiredFeatures: ["request_control", "request_execute"] },
  { name: "Campanhas", href: "/campaigns", icon: Send, requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
  { name: "Automações", href: "/automations", icon: Zap, requiredFeatures: ["campaign_control"] },
  { name: "Board", href: "/board", icon: LayoutList, requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
  { name: "Reuniões", href: "/meetings", icon: CalendarDays, requiredFeatures: ["calendar_control"] },
  { name: "Financeiro", href: "/financial", icon: Wallet, requiredFeatures: ["view_financial"] },
  { name: "Relatórios", href: "/reports", icon: LineChart, requiredFeatures: ["view_reports"] },
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
                "relative flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200",
                isActive
                  ? "text-white bg-gradient-to-br from-[#4e62d8] to-[#2137b6] shadow-lg shadow-[#4e62d8]/25"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", isActive && "text-white")} strokeWidth={1.5} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
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
          "relative flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-medium transition-all duration-200",
          isActive
            ? "text-white bg-gradient-to-r from-[#4e62d8]/20 to-[#2137b6]/10 border border-[#4e62d8]/30"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
            style={{ background: 'linear-gradient(180deg, #4e62d8 0%, #2137b6 100%)' }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <div className={cn(
          "flex items-center justify-center w-7 h-7 rounded-lg transition-all",
          isActive
            ? "bg-gradient-to-br from-[#4e62d8] to-[#2137b6] shadow-md shadow-[#4e62d8]/20"
            : "bg-white/[0.05]"
        )}>
          <Icon className={cn("h-[15px] w-[15px]", isActive ? "text-white" : "text-inherit")} strokeWidth={1.5} />
        </div>
        <span>{item.name}</span>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-[#0C0E14] border-r border-white/[0.06] transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 shrink-0",
          sidebarCollapsed ? "justify-center" : "px-4"
        )}>
          <Link href="/dashboard" className="flex items-center">
            {sidebarCollapsed ? (
              <LogoIcon className="w-7 h-7" />
            ) : (
              <Logo size="sm" showText={true} />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <LayoutGroup>
          <nav className={cn(
            "flex-1 flex flex-col py-2",
            sidebarCollapsed ? "px-2" : "px-3"
          )}>
            <div className="space-y-0.5">
              {filteredNavigation.map(renderNavItem)}
            </div>

            {/* Spacer */}
            <div className="flex-1 min-h-4" />

            {/* Settings */}
            <div className="pt-2 border-t border-white/[0.06]">
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/settings"
                      className={cn(
                        "flex items-center justify-center h-10 w-10 mx-auto rounded-xl transition-all duration-200",
                        pathname.startsWith("/settings")
                          ? "text-white bg-gradient-to-br from-[#4e62d8] to-[#2137b6] shadow-lg shadow-[#4e62d8]/25"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                      )}
                    >
                      <Settings className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    Configuracoes
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href="/settings"
                  className={cn(
                    "relative flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                    pathname.startsWith("/settings")
                      ? "text-white bg-gradient-to-r from-[#4e62d8]/20 to-[#2137b6]/10 border border-[#4e62d8]/30"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  )}
                >
                  {pathname.startsWith("/settings") && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                      style={{ background: 'linear-gradient(180deg, #4e62d8 0%, #2137b6 100%)' }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <div className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-lg transition-all",
                    pathname.startsWith("/settings")
                      ? "bg-gradient-to-br from-[#4e62d8] to-[#2137b6] shadow-md shadow-[#4e62d8]/20"
                      : "bg-white/[0.05]"
                  )}>
                    <Settings className="h-[15px] w-[15px] text-inherit" strokeWidth={1.5} />
                  </div>
                  <span>Configuracoes</span>
                </Link>
              )}
            </div>
          </nav>
        </LayoutGroup>

        {/* Bottom Section */}
        <div className="shrink-0 border-t border-white/[0.06]">
          <div className={cn("p-3", sidebarCollapsed && "px-2")}>
            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-lg hover:bg-white/[0.04] transition-colors duration-150 outline-none",
                    sidebarCollapsed ? "justify-center p-1.5" : "gap-2.5 p-1.5"
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-semibold">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-200 truncate">
                        {user?.name || "Usuário"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={sidebarCollapsed ? "center" : "start"} side="top" className="w-52 mb-1">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/profile">
                    <Settings className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/notifications">
                    <Bell className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Notificações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Controls */}
            <div className={cn(
              "flex items-center mt-2 pt-2 border-t border-white/[0.06]",
              sidebarCollapsed ? "flex-col gap-1" : "gap-1"
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="relative flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors duration-150"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" strokeWidth={1.5} />
                    <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={sidebarCollapsed ? "right" : "top"}>
                  Alternar tema
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center h-7 w-7 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors duration-150"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    ) : (
                      <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={sidebarCollapsed ? "right" : "top"}>
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
