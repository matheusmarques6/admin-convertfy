"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Moon,
  Sun,
  Menu,
  Check,
  Loader2,
  PartyPopper,
  AlertTriangle,
  XCircle,
  Megaphone,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { notificationService, type Notification } from "@/lib/services"
import { useAuthStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients/new": "Novo Cliente",
  "/clients": "Clientes",
  "/pipeline": "Pipeline de Vendas",
  "/board": "Quadro de Tarefas",
  "/financial": "Financeiro",
  "/meetings/new": "Nova Reunião",
  "/meetings": "Reuniões",
  "/reports/new": "Novo Relatório",
  "/reports": "Relatórios",
  "/automations/new": "Nova Automação",
  "/automations": "Automações",
  "/campaigns": "Campanhas",
  "/stores": "Lojas",
  "/onboarding": "Onboarding",
  "/tools": "Ferramentas",
  "/notifications": "Notificações",
  "/team": "Equipe",
  "/settings/appearance": "Aparência",
  "/settings/profile": "Perfil",
  "/settings/company": "Empresa",
  "/settings/integrations": "Integrações",
  "/settings/users": "Usuários",
  "/settings/permissions": "Permissões",
  "/settings/tags": "Tags",
  "/settings/custom-fields": "Campos Personalizados",
  "/settings/notifications": "Notificações",
  "/settings/email-templates": "Templates de Email",
  "/settings": "Configurações",
}

interface HeaderProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
}

export function Header({ user: userProp }: HeaderProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return

    try {
      const [notifs, count] = await Promise.all([
        notificationService.getUnread(user.id, 5),
        notificationService.getUnreadCount(user.id),
      ])
      setNotifications(notifs)
      setUnreadCount(count)
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchNotifications()

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  async function markAllAsRead() {
    if (!user?.id) return

    try {
      await notificationService.markAllAsRead(user.id)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      toast({
        title: "Notificações lidas",
        description: "Todas as notificações foram marcadas como lidas.",
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível marcar as notificações como lidas.",
      })
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await notificationService.markAsRead(notificationId)
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Silent fail for individual marks
    }
  }

  function getTimeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "agora"
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    return `${diffDays}d`
  }

  function getNotificationIcon(type: string) {
    const baseClass = "h-4 w-4"
    switch (type) {
      case "success":
        return <PartyPopper className={`${baseClass} text-success`} />
      case "warning":
        return <AlertTriangle className={`${baseClass} text-warning`} />
      case "error":
        return <XCircle className={`${baseClass} text-destructive`} />
      default:
        return <Megaphone className={`${baseClass} text-info`} />
    }
  }

  const getPageTitle = () => {
    const sortedPaths = Object.keys(pageTitles).sort((a, b) => b.length - a.length)
    for (const path of sortedPaths) {
      if (pathname.startsWith(path)) {
        return pageTitles[path]
      }
    }
    return "Convertfy Admin"
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-6">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[240px]">
          <Sidebar user={userProp} />
        </SheetContent>
      </Sheet>

      {/* Page Title */}
      <h1 className="text-base font-semibold text-foreground truncate">{getPageTitle()}</h1>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Alternar tema</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center text-[10px] font-medium text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-sm">Notificações</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-primary hover:text-primary/80"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
              >
                Marcar todas como lidas
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex flex-col items-start p-3 cursor-pointer ${notification.read ? 'opacity-50' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-sm flex items-center gap-2">
                      {getNotificationIcon(notification.type)}
                      {notification.title}
                      {notification.read && <Check className="h-3 w-3 text-muted-foreground" />}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {getTimeAgo(notification.created_at)}
                    </span>
                  </div>
                  {notification.body && (
                    <span className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.body}
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary cursor-pointer text-xs">
              <Link href="/notifications">
                Ver todas as notificações
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
