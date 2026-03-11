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
  Link2,
  Truck,
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

interface NavSection {
  label?: string
  items: NavItem[]
}

const navigationSections: NavSection[] = [
  {
    items: [
      { name: "Inicio", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Gestao",
    items: [
      { name: "Clientes", href: "/clients", icon: Users, requiredFeatures: ["create_clients", "onboarding_control"] },
      { name: "Lojas", href: "/stores", icon: Store, requiresStoreAccess: true },
      { name: "Onboarding", href: "/onboarding", icon: Rocket, requiredFeatures: ["onboarding_control", "onboarding_view"] },
    ],
  },
  {
    label: "Marketing",
    items: [
      { name: "Campanhas", href: "/campaigns", icon: Mail, requiredFeatures: ["campaign_control", "campaign_view", "campaign_copy"] },
      { name: "Automacoes", href: "/automations", icon: Workflow, requiredFeatures: ["campaign_control"] },
    ],
  },
  {
    label: "Operacoes",
    items: [
      { name: "Pipeline", href: "/pipeline", icon: Kanban, requiredFeatures: ["request_control", "request_execute"] },
      { name: "Board", href: "/board", icon: ListTodo, requiredFeatures: ["request_control", "request_execute", "calendar_control"] },
      { name: "Reunioes", href: "/meetings", icon: Calendar, requiredFeatures: ["calendar_control"] },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { name: "Financeiro", href: "/financial", icon: CreditCard, requiredFeatures: ["view_financial"] },
      { name: "Relatorios", href: "/reports", icon: BarChart3, requiredFeatures: ["view_reports"] },
    ],
  },
]

const bottomNavItems: NavItem[] = [
  { name: "Integracoes", href: "/integrations", icon: Link2 },
  { name: "Rastreamento", href: "/tracking", icon: Truck },
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

  const allNavItems = useMemo(() => {
    return navigationSections.flatMap(s => s.items)
  }, [])

  const filteredSections = useMemo(() => {
    if (isLoading || !permissions) return []
    if (permissions.isAdmin || permissions.isOrgOwner) return navigationSections

    return navigationSections
      .map(section => ({
        ...section,
        items: section.items.filter(item => {
          if (!item.requiredFeatures || item.requiredFeatures.length === 0) {
            if (item.requiresStoreAccess) return permissions.storeAccess.length > 0
            return true
          }
          return hasAnyFeature(item.requiredFeatures)
        }),
      }))
      .filter(section => section.items.length > 0)
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

  function isActive(href: string) {
    return href.includes("?")
      ? pathname === href.split("?")[0]
      : pathname.startsWith(href)
  }

  function renderNavItem(item: NavItem) {
    const active = isActive(item.href)
    const Icon = item.icon

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger asChild>
            <Link
              href={item.href}
              className={cn(
                "relative flex items-center justify-center h-9 w-9 mx-auto rounded-lg transition-all duration-150",
                active
                  ? "bg-[#f0f1ff] dark:bg-white/[0.08] text-[#5c6ac4] dark:text-white"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.5} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-xs">
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
          "relative flex items-center gap-3 h-8 px-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
          active
            ? "bg-[#f0f1ff] dark:bg-white/[0.08] text-[#5c6ac4] dark:text-white"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-slate-200"
        )}
      >
        <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2 : 1.5} />
        <span>{item.name}</span>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-white dark:bg-[#0C0E16] border-r border-slate-200 dark:border-white/[0.06] transition-all duration-300",
          sidebarCollapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-14 shrink-0 border-b border-slate-100 dark:border-white/[0.06]",
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
            "flex-1 overflow-y-auto py-3",
            sidebarCollapsed ? "px-2" : "px-3"
          )}>
            <div className="space-y-5">
              {filteredSections.map((section, idx) => (
                <div key={idx}>
                  {section.label && !sidebarCollapsed && (
                    <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {section.label}
                    </p>
                  )}
                  {section.label && sidebarCollapsed && (
                    <div className="mx-auto w-5 border-t border-slate-200 dark:border-white/[0.06] mb-2" />
                  )}
                  <div className="space-y-0.5">
                    {section.items.map(renderNavItem)}
                  </div>
                </div>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1 min-h-4" />
          </nav>
        </LayoutGroup>

        {/* Bottom navigation */}
        <div className={cn(
          "shrink-0 border-t border-slate-100 dark:border-white/[0.06] py-2",
          sidebarCollapsed ? "px-2" : "px-3"
        )}>
          <div className="space-y-0.5">
            {bottomNavItems.map(renderNavItem)}
            {renderNavItem({ name: "Configuracoes", href: "/settings", icon: Settings })}
          </div>
        </div>

        {/* User Section */}
        <div className="shrink-0 border-t border-slate-100 dark:border-white/[0.06]">
          <div className={cn("p-2.5", sidebarCollapsed && "px-2")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center w-full rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors duration-150 outline-none",
                    sidebarCollapsed ? "justify-center p-1.5" : "gap-2.5 p-1.5"
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-[#5c6ac4]/10 text-[#5c6ac4] text-[10px] font-semibold">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate">
                        {user?.name || "Usuario"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={sidebarCollapsed ? "center" : "start"} side="top" className="w-52 mb-1">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.name || "Usuario"}</p>
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
                    Notificacoes
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
              "flex items-center mt-1.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.06]",
              sidebarCollapsed ? "flex-col gap-0.5" : "gap-0.5"
            )}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="relative flex items-center justify-center h-7 w-7 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors duration-150"
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
                    className="flex items-center justify-center h-7 w-7 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors duration-150"
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
