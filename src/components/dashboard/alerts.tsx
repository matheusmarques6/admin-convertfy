"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import type { Meeting } from "@/types"
import type { LucideIcon } from "lucide-react"

interface AlertItem {
  id: string
  type: "payment_overdue" | "contract_expiring" | "health_low"
  title: string
  description: string
  severity: "high" | "medium" | "low"
}

interface DashboardAlertsProps {
  meetings: Meeting[]
  alerts?: AlertItem[]
}

const ALERT_ICONS: Record<string, LucideIcon> = {
  payment_overdue: AlertCircle,
  contract_expiring: FileText,
  health_low: HeartPulse,
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Alertas e Lembretes</CardTitle>
            <CardDescription>Itens que precisam da sua atenção</CardDescription>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="rounded-full">
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
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className={`rounded-lg p-2 ${
                    alert.severity === "high" ? "bg-red-500/10" :
                    alert.severity === "medium" ? "bg-amber-500/10" : "bg-muted"
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      alert.severity === "high" ? "text-red-500" :
                      alert.severity === "medium" ? "text-amber-500" : "text-muted-foreground"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {alert.description}
                    </p>
                  </div>
                  <Badge variant={getSeverityColor(alert.severity)} className="shrink-0">
                    {alert.severity === "high" ? "Urgente" :
                     alert.severity === "medium" ? "Atenção" : "Baixo"}
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
            <div className="flex items-center gap-2 pt-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Próximas Reuniões</span>
            </div>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{meeting.title}</p>
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
    </Card>
  )
}
