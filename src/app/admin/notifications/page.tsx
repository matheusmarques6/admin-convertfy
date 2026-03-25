"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  Users,
  DollarSign,
  FileBarChart,
  AlertTriangle,
  RefreshCw,
  Calendar,
  CheckSquare,
  Mail,
  Settings2,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { notificationService, type Notification } from "@/lib/services"
import { useAuthStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

// ─── Helpers ─────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Agora"
  if (diffMins < 60) return `${diffMins}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function getNotifIcon(type: string): LucideIcon {
  const icons: Record<string, LucideIcon> = {
    client: Users,
    payment: DollarSign,
    report: FileBarChart,
    health: AlertTriangle,
    sync: RefreshCw,
    meeting: Calendar,
    task: CheckSquare,
    campaign: Mail,
    system: Settings2,
    success: CheckSquare,
    warning: AlertTriangle,
    error: AlertTriangle,
    info: Bell,
  }
  return icons[type] ?? Bell
}

// ─── Types ───────────────────────────────────────────────

type NotifFilter = "all" | "unread" | "read"

// ─── Page ────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<NotifFilter>("all")

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

  const unreadCount = notifications.filter((n) => !n.read).length

  const filtered =
    filter === "all"
      ? notifications
      : filter === "unread"
        ? notifications.filter((n) => !n.read)
        : notifications.filter((n) => n.read)

  async function handleMarkAllRead() {
    if (!user?.id) return
    try {
      await notificationService.markAllAsRead(user.id)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      toast({ title: "Todas marcadas como lidas" })
    } catch {
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleNotifClick(notif: Notification) {
    if (!notif.read) {
      try {
        await notificationService.markAsRead(notif.id)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        )
      } catch {
        // Silent fail
      }
    }
    // Navigate if link exists
    if (notif.link) {
      window.location.href = notif.link
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    try {
      await notificationService.delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      toast({ title: "Notificação removida" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao remover" })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notificações"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            <Icon icon={CheckCheck} size={16} className="mr-1.5" />
            Marcar todas como lidas
          </Button>
        }
      >
        <SegmentedTabs
          value={filter}
          onValueChange={(v) => setFilter(v as NotifFilter)}
        >
          <SegmentedTabItem value="all">Todas</SegmentedTabItem>
          <SegmentedTabItem value="unread">
            Não lidas{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </SegmentedTabItem>
          <SegmentedTabItem value="read">Lidas</SegmentedTabItem>
        </SegmentedTabs>
      </PageHeader>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Icon icon={Loader2} size={24} className="animate-spin text-gray-400 dark:text-[#5C6378]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Icon
            icon={BellOff}
            size={24}
            className="text-gray-300 dark:text-[#5C6378] mx-auto mb-3"
          />
          <p className="text-sm font-medium text-gray-500 dark:text-[#8B92A5]">
            {filter === "unread"
              ? "Nenhuma notificação não lida"
              : "Nenhuma notificação"}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((notif) => {
            const NotifIcon = getNotifIcon(notif.type)
            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleNotifClick(notif)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-[8px] transition-colors duration-150",
                  "flex items-start gap-3",
                  "min-h-[44px]",
                  "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
                  "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
                  "group",
                  notif.read
                    ? "bg-transparent hover:bg-gray-50 dark:hover:bg-[#1A1D27]"
                    : "bg-[#EEF0FB] dark:bg-[rgba(123,140,234,0.06)] hover:bg-[#E0E4F7] dark:hover:bg-[rgba(123,140,234,0.1)]"
                )}
              >
                {/* Unread dot */}
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-[#4E62D8] dark:bg-[#7B8CEA] shrink-0 mt-2" />
                )}
                {/* Icon — inline naked (Rule 1) */}
                <Icon
                  icon={NotifIcon}
                  size={16}
                  className={cn(
                    "shrink-0 mt-0.5",
                    notif.read
                      ? "text-gray-400 dark:text-[#5C6378]"
                      : "text-[#4E62D8] dark:text-[#7B8CEA]"
                  )}
                />
                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      notif.read
                        ? "text-gray-600 dark:text-[#8B92A5]"
                        : "text-gray-900 dark:text-[#EAEDF3] font-medium"
                    )}
                  >
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-0.5 line-clamp-2">
                      {notif.body}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1 font-mono tabular-nums">
                    {formatRelativeTime(notif.created_at)}
                  </p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!notif.read && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        notificationService.markAsRead(notif.id)
                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notif.id ? { ...n, read: true } : n
                          )
                        )
                      }}
                      title="Marcar como lida"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-gray-400 hover:text-[#991B1B] dark:hover:text-[#FCA5A5]"
                    onClick={(e) => handleDelete(e, notif.id)}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
