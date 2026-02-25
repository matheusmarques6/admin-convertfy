"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse } from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import type { Meeting, DashboardAlert } from "@/types"
import type { LucideIcon } from "lucide-react"

interface DashboardAlertsProps {
  meetings: Meeting[]
  alerts?: DashboardAlert[]
}

const ALERT_ICONS: Record<string, LucideIcon> = {
  payment_overdue: AlertCircle,
  contract_expiring: FileText,
  health_low: HeartPulse,
  meeting_overdue: Calendar,
  report_pending: Clock,
}

export function DashboardAlerts({ meetings, alerts = [] }: DashboardAlertsProps) {
  const getSeverityColor = (severity: "high" | "medium" | "low") => {
    switch (severity) {
      case "high":
        return "destructive"
      case "medium":
        return "warning"
      case "low":
        return "secondary"
    }
  }

  const totalAlerts = alerts.length

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-foreground">Alertas e Lembretes</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-0 rounded-full text-xs px-2 h-5">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.type] || Clock
              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={`rounded-md p-1.5 ${
                    alert.severity === "high" ? "bg-destructive/10" :
                    alert.severity === "medium" ? "bg-warning/10" : "bg-muted"
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      alert.severity === "high" ? "text-destructive" :
                      alert.severity === "medium" ? "text-warning" : "text-muted-foreground"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{alert.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {alert.description}
                    </p>
                  </div>
                  <Badge variant={getSeverityColor(alert.severity)} className="shrink-0 text-[10px] h-5 px-2">
                    {alert.severity === "high" ? "Urgente" :
                     alert.severity === "medium" ? "Atencao" : "Baixo"}
                  </Badge>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4">
            Nenhum alerta no momento
          </div>
        )}

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Proximas Reunioes</span>
            </div>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(meeting.scheduled_at)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/meetings">
                        Ver
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </div>
  )
}
