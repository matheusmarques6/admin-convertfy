"use client"

import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Edit,
  Kanban,
  LucideIcon,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Activity {
  id: string
  type: string
  description: string
  created_at: string
  client?: { name: string } | { name: string }[] | null
  profile?: { name: string } | { name: string }[] | null
}

interface RecentActivityProps {
  activities?: Activity[]
}

function getActivityIcon(type: string): { icon: LucideIcon; color: string; bg: string } {
  switch (type) {
    case "client_created":
      return { icon: UserPlus, color: "text-primary", bg: "bg-primary/10" }
    case "payment_received":
    case "payment_confirmed":
      return { icon: DollarSign, color: "text-success", bg: "bg-success/10" }
    case "payment_overdue":
      return { icon: DollarSign, color: "text-destructive", bg: "bg-destructive/10" }
    case "meeting_scheduled":
    case "meeting_completed":
      return { icon: Calendar, color: "text-warning", bg: "bg-warning/10" }
    case "report_uploaded":
      return { icon: FileText, color: "text-warning", bg: "bg-warning/10" }
    case "deal_created":
    case "deal_updated":
      return { icon: Kanban, color: "text-primary", bg: "bg-primary/10" }
    case "deal_won":
      return { icon: TrendingUp, color: "text-success", bg: "bg-success/10" }
    case "deal_lost":
      return { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" }
    case "client_updated":
    case "status_changed":
      return { icon: Edit, color: "text-muted-foreground", bg: "bg-muted" }
    case "email_sent":
    case "whatsapp_sent":
      return { icon: MessageSquare, color: "text-success", bg: "bg-success/10" }
    default:
      return { icon: FileText, color: "text-muted-foreground", bg: "bg-muted" }
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min atrás`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d atrás`

  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const hasActivities = activities.length > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col relative group">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Atividade Recente</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Últimas ações no sistema</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 pr-4 -mr-4">
          {hasActivities ? (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px before:h-full before:w-px before:bg-border/60">
              {activities.map((activity) => {
                const { icon: Icon, color, bg } = getActivityIcon(activity.type)
                const profileName = Array.isArray(activity.profile)
                  ? activity.profile[0]?.name
                  : activity.profile?.name
                return (
                  <div key={activity.id} className="relative flex items-start gap-4 group/item">
                    <div className={cn("relative z-10 flex h-[2.8rem] w-[2.8rem] shrink-0 items-center justify-center rounded-full ring-8 ring-card", bg)}>
                      <Icon className={cn("h-4 w-4", color)} />
                    </div>
                    <div className="flex flex-col flex-1 pt-1.5 pb-2">
                      <p className="text-sm font-medium text-foreground leading-relaxed group-hover/item:text-primary transition-colors">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{profileName || "Sistema"}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-border" />
                        <span>{timeAgo(activity.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
              <Calendar className="h-8 w-8 mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhuma atividade recente</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
