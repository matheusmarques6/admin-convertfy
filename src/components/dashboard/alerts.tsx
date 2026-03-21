"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse, TrendingDown, ShieldAlert, Mail, Zap, AlertTriangle } from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime } from "@/lib/utils"
import { usePermissions } from "@/lib/hooks/use-permissions"
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
  low_revenue: TrendingDown,
  klaviyo_account_error: ShieldAlert,
  campaign_failure: Mail,
  low_recovery_rate: Zap,
}

const ALERT_FEATURE_MAP: Record<string, string> = {
  payment_overdue: "view_financial",
  report_pending: "view_reports",
  low_revenue: "view_stores",
  klaviyo_account_error: "view_stores",
  campaign_failure: "view_stores",
  low_recovery_rate: "view_stores",
}

export function DashboardAlerts({ meetings, alerts = [] }: DashboardAlertsProps) {
  const { permissions, hasFeature } = usePermissions()

  const filteredAlerts = alerts.filter((alert) => {
    const requiredFeature = ALERT_FEATURE_MAP[alert.type]
    if (!requiredFeature) return true
    if (permissions?.isAdmin || permissions?.isOrgOwner) return true
    return hasFeature(requiredFeature)
  })

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

  const hasStoreAlerts = filteredAlerts.some((a) =>
    ["low_revenue", "klaviyo_account_error", "campaign_failure", "low_recovery_rate"].includes(a.type)
  )
  const totalAlerts = filteredAlerts.length

  return (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">Alertas</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-0 rounded-full text-xs px-2.5 h-6 font-semibold">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Alerts */}
        {filteredAlerts.length > 0 ? (
          <ScrollArea className="flex-1 max-h-[280px]">
            <div className="space-y-2">
              {filteredAlerts.map((alert) => {
                const Icon = ALERT_ICONS[alert.type] || Clock
                const content = (
                  <div
                    className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-200"
                  >
                    <div className={`rounded-lg p-2 shrink-0 ${
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
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {alert.description}
                      </p>
                    </div>
                    <Badge variant={getSeverityColor(alert.severity)} className="shrink-0 text-[10px] h-5 px-2">
                      {alert.severity === "high" ? "Urgente" :
                       alert.severity === "medium" ? "Atencao" : "Baixo"}
                    </Badge>
                  </div>
                )
                return alert.action_url ? (
                  <Link key={alert.id} href={alert.action_url} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={alert.id}>{content}</div>
                )
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center py-4">
            Nenhum alerta no momento
          </div>
        )}

        {hasStoreAlerts && (
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" asChild>
            <Link href="/admin/stores?tab=alerts">Ver todos os alertas de lojas</Link>
          </Button>
        )}

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-2 mt-auto border-t border-border">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Proximas Reunioes</span>
            </div>
            <div className="space-y-1.5">
              {meetings.slice(0, 3).map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(meeting.scheduled_at)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs shrink-0" asChild>
                    <Link href="/admin/meetings">Ver</Link>
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </div>
  )
}
