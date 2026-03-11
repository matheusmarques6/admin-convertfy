"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Users,
  Store,
  Rocket,
  Kanban,
  Mail,
  Workflow,
  ListTodo,
  Calendar,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Sun,
  Moon,
  FileText,
  HelpCircle,
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
  badge?: string
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const navigationSections: NavSection[] = [
  {
    items: [
      { name: "Inicio", href: "/dashboard", icon: LayoutDashboard },
    ]
  },
  {
    title: "Gestao",
    items: [
      { name: "Clientes", href: "/clients", icon: Users, requiredFeatures: ["create_clients", "onboarding_control"] },
      { name: "Lojas", href: "/stores", icon: Store, requiresStoreAccess: true },
      { name: "Onboarding", href: "/onboarding", icon: Rocket, requiredFeatures: ["onboarding_control", "onboarding_view"] },
    ]
  },
  {
    title: "Marketing",
    items: [
      { name: "Campanhas", href: "/campaigns", icon: Mail, requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
      { name: "Automacoes", href: "/automations", icon: Workflow, requiredFeatures: ["campaign_control"] },
    ]
  },
  {
    title: "Operacoes",
    items: [
      { name: "Pipeline", href: "/pipeline", icon: Kanban, requiredFeatures: ["request_control", "request_execute"] },
      { name: "Board", href: "/board", icon: ListTodo, requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
      { name: "Reunioes", href: "/meetings", icon: Calendar, requiredFeatures: ["calendar_control"] },
    ]
  },
  {
    title: "Financeiro",
    items: [
      { name: "Financeiro", href: "/financial", icon: CreditCard, requiredFeatures: ["view_financial"] },
      { name: "Relatorios", href: "/reports", icon: BarChart3, requiredFeatures: ["view_reports"] },
    ]
  },
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

  const filteredSections = useMemo(() => {
    if (isLoading || !permissions) return []

    return navigationSections.map(section => {
      if (permissions.isAdmin || permissions.isOrgOwner) return section

      const filteredItems = section.items.filter(item => {
        if (!item.requiredFeatures || item.requiredFeatures.length === 0) {
          if (item.requiresStoreAccess) return permissions.storeAccess.length > 0
          return true
        }
        return hasAnyFeature(item.requiredFeatures)
      })

      return { ...section, items: filteredItems }
    }).filter(section => section.items.length > 0)
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
                "relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-all duration-200",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#05AFF2] rounded-r-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className={cn("h-5 w-5", isActive && "text-[#05AFF2]")} strokeWidth={1.75} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-sm">
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
          "group relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-white/10 text-white"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="nav-indicator"
            className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#05AFF2] rounded-r-full"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        <Icon className={cn("h-5 w-5 flex-shrink-0 transition-colors", isActive ? "text-[#05AFF2]" : "group-hover:text-slate-300")} strokeWidth={1.75} />
        <span className="truncate">{item.name}</span>
        {item.badge && (
          <span className="ml-auto px-2 py-0.5 text-[10px] font-semibold bg-[#05AFF2]/20 text-[#05AFF2] rounded-full">
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
          "flex flex-col h-screen bg-[#0B0D14] border-r border-white/[0.08] transition-all duration-300 ease-out",
          sidebarCollapsed ? "w-[72px]" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-16 shrink-0 border-b border-white/[0.06]",
          sidebarCollapsed ? "justify-center px-3" : "px-5"
        )}>
          <Link href="/dashboard" className="flex items-center">
            {sidebarCollapsed ? (
              <LogoIcon className="w-8 h-8" />
            ) : (
              <Logo size="sm" showText={true} />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <LayoutGroup>
          <nav className={cn(
            "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-4",
            sidebarCollapsed ? "px-2" : "px-3"
          )}>
            {filteredSections.map((section, sectionIndex) => (
              <div key={sectionIndex} className={cn(sectionIndex > 0 && "mt-6")}>
                {section.title && !sidebarCollapsed && (
                  <h3 className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                {section.title && sidebarCollapsed && sectionIndex > 0 && (
                  <div className="mx-3 mb-3 border-t border-white/[0.06]" />
                )}
                <div className="space-y-1">
                  {section.items.map(renderNavItem)}
                </div>
              </div>
            ))}
          </nav>
        </LayoutGroup>

        {/* Bottom Section */}
        <div className="shrink-0 border-t border-white/[0.06]">
          {/* Settings Link */}
          <div className={cn("pt-3", sidebarCollapsed ? "px-2" : "px-3")}>
            <Link
              href="/settings"
              className={cn(
                "group relative flex items-center gap-3 h-10 rounded-lg text-sm font-medium transition-all duration-200",
                pathname.startsWith("/settings")
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                sidebarCollapsed ? "justify-center w-10 mx-auto" : "px-3"
              )}
            >
              {pathname.startsWith("/settings") && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#05AFF2] rounded-r-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Settings className={cn("h-5 w-5 flex-shrink-0", pathname.startsWith("/settings") && "text-[#05AFF2]")} strokeWidth={1.75} />
              {!sidebarCollapsed && <span>Configuracoes</span>}
            </Link>
          </div>

          {/* User Section */}
          <div className={cn("p-3", sidebarCollapsed && "px-2")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-lg hover:bg-white/5 transition-all duration-200 outline-none",
                    sidebarCollapsed ? "justify-center p-2" : "gap-3 p-2"
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/10">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-br from-[#05AFF2] to-[#0284C7] text-white text-xs font-semibold">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {user?.name || "Usuario"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {user?.email}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={sidebarCollapsed ? "center" : "start"} side="top" className="w-56 mb-2 bg-[#151922] border-white/10">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-slate-200">{user?.name || "Usuario"}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem asChild className="text-slate-300 focus:bg-white/10 focus:text-white">
                  <Link href="/settings/profile" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" strokeWidth={1.75} />
                    Perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-slate-300 focus:bg-white/10 focus:text-white">
                  <Link href="/settings/notifications" className="flex items-center">
                    <Bell className="mr-2 h-4 w-4" strokeWidth={1.75} />
                    Notificacoes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-slate-300 focus:bg-white/10 focus:text-white">
                  <Link href="/docs" className="flex items-center">
                    <FileText className="mr-2 h-4 w-4" strokeWidth={1.75} />
                    Documentacao
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-slate-300 focus:bg-white/10 focus:text-white">
                  <Link href="/help" className="flex items-center">
                    <HelpCircle className="mr-2 h-4 w-4" strokeWidth={1.75} />
                    Ajuda
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                >
                  <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme & Collapse Controls */}
            <div className={cn(
              "flex items-center mt-3 pt-3 border-t border-white/[0.06]",
              sidebarCollapsed ? "flex-col gap-2" : "justify-between"
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" strokeWidth={1.75} />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" strokeWidth={1.75} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={sidebarCollapsed ? "right" : "top"} className="text-sm">
                  Alternar tema
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={sidebarCollapsed ? "right" : "top"} className="text-sm">
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
