"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Users2,
  Kanban,
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Logo, LogoIcon } from "@/components/ui/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
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

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Equipe", href: "/team", icon: Users2 },
  { name: "Onboarding", href: "/onboarding", icon: Rocket },
  { name: "Lojas", href: "/stores", icon: Store },
  { name: "Pipeline", href: "/pipeline", icon: Kanban },
  { name: "Financeiro", href: "/financial", icon: DollarSign },
  { name: "Reuniões", href: "/meetings", icon: Calendar },
  { name: "Campanhas", href: "/campaigns", icon: CalendarDays },
  { name: "Relatórios", href: "/reports", icon: BarChart3 },
  { name: "Automações", href: "/automations", icon: Zap },
  { name: "Ferramentas", href: "/tools", icon: Wrench },
]

const bottomNavigation = [
  { name: "Configurações", href: "/settings", icon: Settings },
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
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-screen bg-card border-r border-border transition-all duration-300",
          sidebarCollapsed ? "w-[70px]" : "w-[260px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-border">
          <Link href="/dashboard" className="flex items-center">
            {sidebarCollapsed ? (
              <LogoIcon className="w-10 h-10" />
            ) : (
              <Logo size="md" showText={true} />
            )}
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon

              return sidebarCollapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 h-10 px-3 rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Bottom Section */}
        <div className="mt-auto">
          <Separator />
          <nav className="px-3 py-2">
            {bottomNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon

              return sidebarCollapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-center h-10 w-full rounded-lg transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 h-10 px-3 rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <Separator />

          {/* User Section */}
          <div className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full h-auto p-2",
                    sidebarCollapsed ? "justify-center" : "justify-start"
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user?.name?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {!sidebarCollapsed && (
                    <div className="ml-3 text-left">
                      <p className="text-sm font-medium truncate max-w-[140px]">
                        {user?.name || "Usuário"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {user?.email}
                      </p>
                    </div>
                  )}
                </Button>
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
          <div className="p-3 pt-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full h-8"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  {sidebarCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </Button>
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
