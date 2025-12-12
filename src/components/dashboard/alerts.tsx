"use client"

import { Calendar, AlertCircle, Clock, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import type { Meeting } from "@/types"

interface DashboardAlertsProps {
  meetings: Meeting[]
}

export function DashboardAlerts({ meetings }: DashboardAlertsProps) {
  const alerts = [
    {
      id: 1,
      type: "payment_overdue",
      title: "Pagamento em atraso",
      description: "Cliente Loja ABC está com pagamento vencido há 5 dias",
      severity: "high" as const,
      icon: AlertCircle,
    },
    {
      id: 2,
      type: "contract_expiring",
      title: "Contrato expirando",
      description: "Contrato da Loja XYZ vence em 7 dias",
      severity: "medium" as const,
      icon: FileText,
    },
    {
      id: 3,
      type: "report_pending",
      title: "Relatório pendente",
      description: "Relatório mensal de 3 clientes ainda não foi enviado",
      severity: "low" as const,
      icon: Clock,
    },
  ]

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Alertas e Lembretes</CardTitle>
            <CardDescription>Itens que precisam da sua atenção</CardDescription>
          </div>
          <Badge variant="destructive" className="rounded-full">
            {alerts.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className={`rounded-lg p-2 ${
                alert.severity === "high" ? "bg-red-500/10" :
                alert.severity === "medium" ? "bg-amber-500/10" : "bg-muted"
              }`}>
                <alert.icon className={`h-4 w-4 ${
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
          ))}
        </div>

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
                    <Button variant="ghost" size="sm">
                      Ver
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
