"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, Check, CheckCheck, Trash2, Loader2, Info, AlertTriangle, XCircle, PartyPopper } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { notificationService, type Notification } from "@/lib/services"
import { useAuthStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"

function getNotificationIcon(type: string) {
  switch (type) {
    case "success":
      return <Icon icon={PartyPopper} size={16} className="text-success" />
    case "warning":
      return <Icon icon={AlertTriangle} size={16} className="text-warning" />
    case "error":
      return <Icon icon={XCircle} size={16} className="text-destructive" />
    default:
      return <Icon icon={Info} size={16} className="text-info" />
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Agora"
  if (diffMins < 60) return `${diffMins} min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState("all")

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const data = await notificationService.getAll(user.id, 100)
      setNotifications(data)
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar notificações" })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  async function handleMarkAllAsRead() {
    if (!user?.id) return
    try {
      await notificationService.markAllAsRead(user.id)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      toast({ title: "Todas marcadas como lidas" })
    } catch {
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleMarkAsRead(id: string) {
    try {
      await notificationService.markAsRead(id)
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      )
    } catch {
      // Silent fail
    }
  }

  async function handleDelete(id: string) {
    try {
      await notificationService.delete(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      toast({ title: "Notificação removida" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao remover" })
    }
  }

  const filtered = tab === "unread"
    ? notifications.filter(n => !n.read)
    : notifications

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-primary/10">
            <Icon icon={Bell} size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Notificações</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "Nenhuma notificação pendente"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={handleMarkAllAsRead} className="self-end sm:self-auto">
            <Icon icon={CheckCheck} size={16} className="mr-2" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Icon icon={Bell} size={16} />
            Todas
            <Badge variant="neutral" className="ml-1">{notifications.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="unread" className="gap-2">
            Não lidas
            {unreadCount > 0 && (
              <Badge variant="negative" className="ml-1">{unreadCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Icon icon={Loader2} size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Icon icon={Bell} customSize={40} className="text-muted-foreground/50 mb-3" />
                <p className="text-lg font-medium">
                  {tab === "unread" ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Suas notificações aparecerão aqui
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((notification) => (
                <Card
                  key={notification.id}
                  className={`rounded-[8px] border bg-card transition-colors ${!notification.read ? "bg-primary/5 border-primary/20" : ""}`}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${!notification.read ? "font-semibold" : "font-medium"}`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      {notification.body && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(notification.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleMarkAsRead(notification.id)}
                          title="Marcar como lida"
                        >
                          <Icon icon={Check} size={16} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(notification.id)}
                        title="Remover"
                      >
                        <Icon icon={Trash2} size={16} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
