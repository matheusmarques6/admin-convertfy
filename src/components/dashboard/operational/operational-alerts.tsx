"use client"

import {
  AlertCircle,
  FileText,
  HeartPulse,
  Calendar,
  Clock,
  CheckCircle2,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DashboardAlert } from "@/types"
import type { LucideIcon } from "lucide-react"

interface OperationalAlertsProps {
  alerts: DashboardAlert[]
}

const ALERT_ICONS: Record<string, LucideIcon> = {
  payment_overdue: AlertCircle,
  contract_expiring: FileText,
  health_low: HeartPulse,
  meeting_overdue: Calendar,
  report_pending: Clock,
}

export function OperationalAlerts({ alerts }: OperationalAlertsProps) {
  const getSeverityColor = (severity: "high" | "medium" | "low") => {
    switch (severity) {
      case "high":
        return "destructive" as const
      case "medium":
        return "warning" as const
      case "low":
        return "secondary" as const
    }
  }

  const highCount = alerts.filter(a => a.severity === "high").length

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-foreground">Alertas Recentes</CardTitle>
            <CardDescription>Itens que precisam da sua atencao</CardDescription>
          </div>
          {alerts.length > 0 && (
            <Badge variant={highCount > 0 ? "destructive" : "secondary"} className="bg-destructive/10 text-destructive border-0 text-xs rounded-full">
              {alerts.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {alerts.length > 0 ? (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
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
                      <Icon className={`h-3.5 w-3.5 ${
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
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-success opacity-50" />
            <p className="text-sm">Sem alertas recentes</p>
          </div>
        )}
      </CardContent>
    </div>
  )
}
