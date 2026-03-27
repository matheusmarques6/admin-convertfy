"use client"

import { useEffect, useState } from "react"
import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  Edit,
  Tag,
  Mail,
  Loader2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { Activity } from "@/types"

interface ClientTimelineProps {
  clientId: string
}

const activityIcons: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  client_created: { icon: UserPlus, color: "text-info", bg: "bg-info/10" },
  client_updated: { icon: Edit, color: "text-muted-foreground", bg: "bg-muted" },
  status_changed: { icon: Tag, color: "text-primary", bg: "bg-primary/10" },
  meeting_scheduled: { icon: Calendar, color: "text-info", bg: "bg-info/10" },
  meeting_completed: { icon: Calendar, color: "text-success", bg: "bg-success/10" },
  payment_received: { icon: DollarSign, color: "text-success", bg: "bg-success/10" },
  payment_overdue: { icon: DollarSign, color: "text-destructive", bg: "bg-destructive/10" },
  report_uploaded: { icon: FileText, color: "text-warning", bg: "bg-warning/10" },
  note_added: { icon: MessageSquare, color: "text-muted-foreground", bg: "bg-muted" },
  email_sent: { icon: Mail, color: "text-info", bg: "bg-info/10" },
  whatsapp_sent: { icon: MessageSquare, color: "text-success", bg: "bg-success/10" },
}

export function ClientTimeline({ clientId }: ClientTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadActivities() {
      const supabase = createClient()
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100)
      setActivities(data || [])
      setLoading(false)
    }
    loadActivities()
  }, [clientId])

  const sortedActivities = [...activities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-[8px] border">
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
                    color: "text-muted-foreground",
                    bg: "bg-muted",
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
