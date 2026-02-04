"use client"

import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Mail,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ActivityType } from "@/types"

interface Activity {
  id: string
  type: ActivityType
  description: string
  created_at: string
  user?: {
    name: string
  } | null
  client?: {
    name: string
  } | null
}

interface RecentActivityProps {
  activities: Activity[]
}

const activityConfig: Record<
  ActivityType,
  { icon: LucideIcon; iconColor: string; iconBg: string }
> = {
  client_created: {
    icon: UserPlus,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
  },
  client_updated: {
    icon: RefreshCw,
    iconColor: "text-slate-500",
    iconBg: "bg-slate-500/10",
  },
  status_changed: {
    icon: RefreshCw,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10",
  },
  meeting_scheduled: {
    icon: Calendar,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-500/10",
  },
  meeting_completed: {
    icon: Calendar,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  payment_received: {
    icon: DollarSign,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  payment_overdue: {
    icon: AlertCircle,
    iconColor: "text-red-500",
    iconBg: "bg-red-500/10",
  },
  report_uploaded: {
    icon: FileText,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10",
  },
  note_added: {
    icon: FileText,
    iconColor: "text-slate-500",
    iconBg: "bg-slate-500/10",
  },
  email_sent: {
    icon: Mail,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
  },
  whatsapp_sent: {
    icon: MessageSquare,
    iconColor: "text-green-500",
    iconBg: "bg-green-500/10",
  },
  deal_created: {
    icon: TrendingUp,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
  },
  deal_updated: {
    icon: RefreshCw,
    iconColor: "text-slate-500",
    iconBg: "bg-slate-500/10",
  },
  deal_won: {
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  deal_lost: {
    icon: AlertCircle,
    iconColor: "text-red-500",
    iconBg: "bg-red-500/10",
  },
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return "agora"
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} min atrás`
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours}h atrás`
  }

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays}d atrás`
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atividade Recente</CardTitle>
          <CardDescription>Últimas ações no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Nenhuma atividade recente
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividade Recente</CardTitle>
        <CardDescription>Últimas ações no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {activities.map((activity) => {
              const config = activityConfig[activity.type] || {
                icon: FileText,
                iconColor: "text-slate-500",
                iconBg: "bg-slate-500/10",
              }
              const Icon = config.icon

              return (
                <div key={activity.id} className="flex gap-3">
                  <div className={cn("rounded-lg p-2 h-fit", config.iconBg)}>
                    <Icon className={cn("h-4 w-4", config.iconColor)} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm leading-tight">{activity.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{activity.user?.name || "Sistema"}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(activity.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
