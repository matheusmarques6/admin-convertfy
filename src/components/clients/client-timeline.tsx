"use client"

import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  Edit,
  Tag,
  Mail,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Activity } from "@/types"

interface ClientTimelineProps {
  activities: Activity[]
}

const activityIcons: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  client_created: { icon: UserPlus, color: "text-blue-500", bg: "bg-blue-500/10" },
  client_updated: { icon: Edit, color: "text-gray-500", bg: "bg-gray-500/10" },
  status_changed: { icon: Tag, color: "text-purple-500", bg: "bg-purple-500/10" },
  meeting_scheduled: { icon: Calendar, color: "text-blue-500", bg: "bg-blue-500/10" },
  meeting_completed: { icon: Calendar, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  payment_received: { icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  payment_overdue: { icon: DollarSign, color: "text-red-500", bg: "bg-red-500/10" },
  report_uploaded: { icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
  note_added: { icon: MessageSquare, color: "text-gray-500", bg: "bg-gray-500/10" },
  email_sent: { icon: Mail, color: "text-blue-500", bg: "bg-blue-500/10" },
  whatsapp_sent: { icon: MessageSquare, color: "text-green-500", bg: "bg-green-500/10" },
}

export function ClientTimeline({ activities }: ClientTimelineProps) {
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de Atividades</CardTitle>
      </CardHeader>
      <CardContent>
        {sortedActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma atividade registrada
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              {/* Activities */}
              <div className="space-y-6">
              {sortedActivities.map((activity) => {
                  const config = activityIcons[activity.type] || {
                    icon: Edit,
                    color: "text-gray-500",
                    bg: "bg-gray-500/10",
                  }
                  const Icon = config.icon

                  return (
                    <div key={activity.id} className="relative flex gap-4 pl-8">
                      {/* Icon */}
                      <div
                        className={cn(
                          "absolute left-0 rounded-full p-2",
                          config.bg
                        )}
                      >
                        <Icon className={cn("h-4 w-4", config.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
