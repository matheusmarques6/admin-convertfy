"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Moon,
  Sun,
  Check,
  Loader2,
  PartyPopper,
  AlertTriangle,
  XCircle,
  Megaphone,
  ChevronRight,
  Search,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useCommandPaletteSafe } from "@/components/ui/command-palette"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { notificationService, type Notification } from "@/lib/services"
import { useAuthStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/routes"

const pageTitles: Record<string, string> = {
  [ROUTES.ADMIN.DASHBOARD]: "Dashboard",
  [ROUTES.ADMIN.DASHBOARD_OPERATIONAL]: "Operacional",
  [ROUTES.ADMIN.CLIENTS.NEW]: "Novo Cliente",
  [ROUTES.ADMIN.CLIENTS.LIST]: "Clientes",
  [ROUTES.ADMIN.PIPELINE]: "Pipeline de Vendas",
  [ROUTES.ADMIN.BOARD]: "Quadro de Tarefas",
  [ROUTES.ADMIN.FINANCIAL]: "Financeiro",
  [ROUTES.ADMIN.MEETINGS.NEW]: "Nova Reuniao",
  [ROUTES.ADMIN.MEETINGS.LIST]: "Reunioes",
  [ROUTES.ADMIN.REPORTS.NEW]: "Novo Relatorio",
  [ROUTES.ADMIN.REPORTS.LIST]: "Relatorios",
  [ROUTES.ADMIN.AUTOMATIONS.NEW]: "Nova Automacao",
  [ROUTES.ADMIN.AUTOMATIONS.LIST]: "Automacoes",
  [ROUTES.ADMIN.CAMPAIGNS.LIST]: "Campanhas",
  [ROUTES.ADMIN.STORES.LIST]: "Lojas",
  [ROUTES.ADMIN.ONBOARDING]: "Onboarding",
  [ROUTES.ADMIN.TOOLS]: "Ferramentas",
  [ROUTES.ADMIN.NOTIFICATIONS]: "Notificacoes",
  [ROUTES.ADMIN.TEAM]: "Equipe",
  [ROUTES.ADMIN.SETTINGS.APPEARANCE]: "Aparencia",
  [ROUTES.ADMIN.SETTINGS.PROFILE]: "Perfil",
  [ROUTES.ADMIN.SETTINGS.COMPANY]: "Empresa",
  [ROUTES.ADMIN.SETTINGS.INTEGRATIONS]: "Integracoes",
  [ROUTES.ADMIN.SETTINGS.USERS]: "Usuarios",
  [ROUTES.ADMIN.SETTINGS.PERMISSIONS]: "Permissoes",
  [ROUTES.ADMIN.SETTINGS.TAGS]: "Tags",
  [ROUTES.ADMIN.SETTINGS.CUSTOM_FIELDS]: "Campos Personalizados",
  [ROUTES.ADMIN.SETTINGS.NOTIFICATIONS]: "Notificacoes",
  [ROUTES.ADMIN.SETTINGS.EMAIL_TEMPLATES]: "Templates de Email",
  [ROUTES.ADMIN.SETTINGS.ROOT]: "Configuracoes",
}

const parentRoutes: Record<string, { label: string; href: string }> = {
  [ROUTES.ADMIN.CLIENTS.NEW]: { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
  [ROUTES.ADMIN.MEETINGS.NEW]: { label: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST },
  [ROUTES.ADMIN.REPORTS.NEW]: { label: "Relatorios", href: ROUTES.ADMIN.REPORTS.LIST },
  [ROUTES.ADMIN.AUTOMATIONS.NEW]: { label: "Automacoes", href: ROUTES.ADMIN.AUTOMATIONS.LIST },
  [ROUTES.ADMIN.SETTINGS.APPEARANCE]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.PROFILE]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.COMPANY]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.INTEGRATIONS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.USERS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.PERMISSIONS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.TAGS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.CUSTOM_FIELDS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.NOTIFICATIONS]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.SETTINGS.EMAIL_TEMPLATES]: { label: "Configuracoes", href: ROUTES.ADMIN.SETTINGS.ROOT },
  [ROUTES.ADMIN.DASHBOARD_OPERATIONAL]: { label: "Dashboard", href: ROUTES.ADMIN.DASHBOARD },
  [ROUTES.ADMIN.TOOLS + "/copy"]: { label: "Ferramentas", href: ROUTES.ADMIN.TOOLS },
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
  const commandPalette = useCommandPaletteSafe()
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
        title: "Notificacoes lidas",
        description: "Todas as notificacoes foram marcadas como lidas.",
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Nao foi possivel marcar as notificacoes como lidas.",
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

  const pageInfo = useMemo(() => {
    const sortedPaths = Object.keys(pageTitles).sort((a, b) => b.length - a.length)
    let title = "Convertfy Admin"
    for (const path of sortedPaths) {
      if (pathname.startsWith(path)) {
        title = pageTitles[path]
        break
      }
    }

    const segments = pathname.split("/").filter(Boolean)
    const breadcrumbs: Array<{ label: string; href: string; current?: boolean }> = []

    const matchedParent = Object.keys(parentRoutes).sort((a, b) => b.length - a.length).find(p => pathname.startsWith(p))
    if (matchedParent) {
      const parent = parentRoutes[matchedParent]
      breadcrumbs.push({ label: parent.label, href: parent.href })
      breadcrumbs.push({ label: title, href: pathname, current: true })
    } else if (segments.length > 2) {
      // For /admin/clients/[id] etc. - segments[0] is "admin", segments[1] is resource
      const basePath = `/${segments[0]}/${segments[1]}`
      const baseTitle = pageTitles[basePath]
      if (baseTitle) {
        breadcrumbs.push({ label: baseTitle, href: basePath })
        if (segments.length === 3 && segments[2] !== "new") {
          breadcrumbs.push({ label: "Detalhes", href: pathname, current: true })
        } else if (segments.length === 4) {
          breadcrumbs.push({ label: "Detalhes", href: `/${segments[0]}/${segments[1]}/${segments[2]}` })
          const lastSegment = segments[3]
          const subTitle = lastSegment === "edit" ? "Editar" : lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1)
          breadcrumbs.push({ label: subTitle, href: pathname, current: true })
        }
      }
    }

    return { title, breadcrumbs }
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 hidden md:flex h-14 items-center gap-2 sm:gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-3 sm:px-6">
      {/* Page Title with Breadcrumbs */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
        {pageInfo.breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1 text-sm min-w-0">
            {pageInfo.breadcrumbs.map((crumb, idx) => (
              <span key={crumb.href} className="flex items-center gap-1 min-w-0">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                {crumb.current ? (
                  <span className="font-semibold text-foreground truncate">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="text-base font-semibold text-foreground truncate">{pageInfo.title}</h1>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Search / Command Palette */}
        {commandPalette && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex items-center gap-2 h-9 px-3 text-muted-foreground hover:text-foreground rounded-[8px] border border-border bg-muted/50"
            onClick={commandPalette.open}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs">Buscar...</span>
            <kbd className="ml-1 text-[10px] font-medium text-muted-foreground/70 border border-border rounded px-1 py-0.5 bg-background">
              Ctrl K
            </kbd>
          </Button>
        )}
        {commandPalette && (
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9 text-muted-foreground hover:text-foreground rounded-[8px]"
            onClick={commandPalette.open}
          >
            <Search className="h-4 w-4" />
          </Button>
        )}

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-[8px]"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Alternar tema</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground rounded-[8px]">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-sm font-semibold">Notificacoes</span>
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
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma notificacao</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={cn(
                    "flex flex-col items-start p-3 cursor-pointer rounded-lg",
                    notification.read ? "opacity-50" : ""
                  )}
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
            <DropdownMenuItem asChild className="justify-center text-primary cursor-pointer text-xs font-medium">
              <Link href={ROUTES.ADMIN.NOTIFICATIONS}>
                Ver todas as notificacoes
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
