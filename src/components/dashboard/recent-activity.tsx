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
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8 bg-background/50 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-colors">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Atividade Recente</CardTitle>
              <CardDescription className="text-sm font-medium text-muted-foreground mt-0.5">Últimas ações no sistema</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 sm:px-8 py-6 sm:py-8 relative z-10 flex-1">
        <ScrollArea className="h-[300px] pr-4 flex-1">
          {hasActivities ? (
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-border before:via-border/50 before:to-transparent">
              {activities.map((activity) => {
                const { icon: Icon, color, bg } = getActivityIcon(activity.type)
                const profileName = Array.isArray(activity.profile)
                  ? activity.profile[0]?.name
                  : activity.profile?.name
                return (
                  <div key={activity.id} className="relative flex items-start gap-4 group/item">
                    <div className={cn("relative z-10 flex shrink-0 items-center justify-center rounded-full p-2 ring-4 ring-card", bg)}>
                      <Icon className={cn("h-4 w-4", color)} />
                    </div>
                    <div className="flex flex-col flex-1 pl-1 pt-0.5">
                      <p className="text-sm font-semibold text-foreground leading-tight group-hover/item:text-primary transition-colors">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs font-medium text-muted-foreground">
                        <span className="bg-background px-2 py-0.5 border border-border/50 rounded-md">{profileName || "Sistema"}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span>{timeAgo(activity.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground py-10 opacity-50 bg-background rounded-[16px] border border-border/40 border-dashed">
              <Calendar className="h-8 w-8 mb-3 opacity-50" />
              <p className="font-medium">Nenhuma atividade recente</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </div>
  )
}
