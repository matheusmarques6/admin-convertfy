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
  Activity,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface ActivityItem {
  id: string
  type: string
  description: string
  created_at: string
  client?: { name: string } | { name: string }[] | null
  profile?: { name: string } | { name: string }[] | null
}

interface RecentActivityProps {
  activities?: ActivityItem[]
}

function getActivityIcon(type: string): { icon: LucideIcon; color: string; bg: string; darkBg: string } {
  switch (type) {
    case "client_created":
      return { icon: UserPlus, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/10", darkBg: "dark:bg-blue-500/20" }
    case "payment_received":
    case "payment_confirmed":
      return { icon: DollarSign, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10", darkBg: "dark:bg-emerald-500/20" }
    case "payment_overdue":
      return { icon: DollarSign, color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10", darkBg: "dark:bg-red-500/20" }
    case "meeting_scheduled":
    case "meeting_completed":
      return { icon: Calendar, color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10", darkBg: "dark:bg-amber-500/20" }
    case "report_uploaded":
      return { icon: FileText, color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10", darkBg: "dark:bg-amber-500/20" }
    case "deal_created":
    case "deal_updated":
      return { icon: Kanban, color: "text-indigo-500 dark:text-indigo-400", bg: "bg-indigo-500/10", darkBg: "dark:bg-indigo-500/20" }
    case "deal_won":
      return { icon: TrendingUp, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10", darkBg: "dark:bg-emerald-500/20" }
    case "deal_lost":
      return { icon: TrendingDown, color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10", darkBg: "dark:bg-red-500/20" }
    case "client_updated":
    case "status_changed":
      return { icon: Edit, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-500/10", darkBg: "dark:bg-slate-500/20" }
    case "email_sent":
    case "whatsapp_sent":
      return { icon: MessageSquare, color: "text-green-500 dark:text-green-400", bg: "bg-green-500/10", darkBg: "dark:bg-green-500/20" }
    default:
      return { icon: FileText, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-500/10", darkBg: "dark:bg-slate-500/20" }
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`

  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const hasActivities = activities.length > 0

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-violet-500/10 dark:bg-violet-500/20">
            <Activity className="h-4 w-4 text-violet-500 dark:text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">Atividade Recente</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Ultimas acoes no sistema</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[280px] pr-2">
          {hasActivities ? (
            <div className="space-y-2">
              {activities.map((activity, index) => {
                const { icon: Icon, color, bg, darkBg } = getActivityIcon(activity.type)
                const profileName = Array.isArray(activity.profile)
                  ? activity.profile[0]?.name
                  : activity.profile?.name
                return (
                  <div
                    key={activity.id}
                    className="flex gap-3 p-3 rounded-lg bg-muted/20 dark:bg-white/[0.02] hover:bg-muted/40 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <div className={cn("rounded-lg p-2 h-fit", bg, darkBg)}>
                      <Icon className={cn("h-4 w-4", color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug text-foreground line-clamp-2">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium">{profileName || "Sistema"}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className="tabular-nums">{timeAgo(activity.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <div className="p-3 rounded-full bg-muted/50 dark:bg-white/[0.05] mb-3">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma atividade recente</p>
              <p className="text-xs text-muted-foreground/60 mt-1">As acoes aparecerao aqui</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </div>
  )
}
