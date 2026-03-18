"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse, TrendingDown, ShieldAlert, Mail, Zap } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDateTime, cn } from "@/lib/utils"
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

// Alert types that require specific features
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

  // Filter alerts based on user features
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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col relative group">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Alertas e Lembretes</h2>
        </div>
        {totalAlerts > 0 && (
          <div className="flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-destructive/10 text-destructive text-xs font-bold">
            {totalAlerts}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {/* Alerts */}
        {filteredAlerts.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              {filteredAlerts.slice(0, 3).map((alert) => {
                const Icon = ALERT_ICONS[alert.type] || Clock
                const isHigh = alert.severity === "high"
                const isMed = alert.severity === "medium"
                
                const content = (
                  <div className={cn(
                    "flex flex-col gap-2 p-3 rounded-xl border transition-colors",
                    isHigh ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10" : 
                    isMed ? "bg-warning/5 border-warning/20 hover:bg-warning/10" : 
                    "bg-background border-border hover:bg-muted/30"
                  )}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded-lg", 
                          isHigh ? "bg-destructive/10 text-destructive" : 
                          isMed ? "bg-warning/10 text-warning" : 
                          "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className={cn("text-sm font-semibold", 
                          isHigh ? "text-destructive" : isMed ? "text-warning" : "text-foreground"
                        )}>
                          {alert.title}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed pl-9">
                      {alert.description}
                    </p>
                  </div>
                )

                return alert.action_url ? (
                  <Link key={alert.id} href={alert.action_url} className="block outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                    {content}
                  </Link>
                ) : (
                  <div key={alert.id}>{content}</div>
                )
              })}
            </div>
            
            {hasStoreAlerts && (
              <Button variant="outline" className="w-full mt-2" asChild>
                <Link href="/stores?tab=alerts">Ver todos os alertas de lojas</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
            <ShieldAlert className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Tudo tranquilo! Nenhum alerta no momento.</p>
          </div>
        )}

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <div className="pt-6 border-t border-border mt-auto">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Próximas Reuniões
            </h3>
            <ScrollArea className="h-[140px] pr-4">
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href="/meetings"
                    className="flex flex-col gap-1.5 p-3 rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors group/mtg"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground group-hover/mtg:underline truncate pr-4">{meeting.title}</span>
                      <span className="text-xs font-mono font-bold text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-md">
                        {new Date(meeting.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(meeting.scheduled_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                    </span>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
