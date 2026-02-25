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
    <div className="rounded-xl border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm font-medium text-foreground">Atividade Recente</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">Últimas ações no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          {hasActivities ? (
            <div className="space-y-3">
              {activities.map((activity) => {
                const { icon: Icon, color, bg } = getActivityIcon(activity.type)
                const profileName = Array.isArray(activity.profile)
                  ? activity.profile[0]?.name
                  : activity.profile?.name
                return (
                  <div key={activity.id} className="flex gap-3">
                    <div className={cn("rounded-md p-1.5 h-fit", bg)}>
                      <Icon className={cn("h-3.5 w-3.5", color)} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-tight text-foreground">{activity.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{profileName || "Sistema"}</span>
                        <span>·</span>
                        <span>{timeAgo(activity.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground text-center">
              Nenhuma atividade recente
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </div>
  )
}
