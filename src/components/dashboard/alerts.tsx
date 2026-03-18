"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse, TrendingDown, ShieldAlert, Mail, Zap } from "lucide-react"
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
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-tr from-warning/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8 bg-background/50 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-2.5 border border-warning/20 group-hover:bg-warning group-hover:text-warning-foreground text-warning transition-colors">
              <AlertCircle className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg font-bold tracking-tight">Alertas e Lembretes</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="bg-destructive/10 text-destructive border-0 rounded-full px-3 py-1 font-bold">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-6 sm:px-8 py-6 sm:py-8 relative z-10 flex-1 flex flex-col">
        {/* Alerts */}
        {filteredAlerts.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAlerts.map((alert) => {
                const Icon = ALERT_ICONS[alert.type] || Clock
                const isHigh = alert.severity === "high"
                const isMed = alert.severity === "medium"
                
                const content = (
                  <div className={cn(
                    "flex flex-col gap-3 p-4 rounded-[16px] border transition-all h-full",
                    isHigh ? "bg-destructive/5 border-destructive/20 hover:border-destructive/40" : 
                    isMed ? "bg-warning/5 border-warning/20 hover:border-warning/40" : 
                    "bg-background border-border/40 hover:border-border"
                  )}>
                    <div className="flex items-start justify-between">
                      <div className={cn("rounded-xl p-2 h-fit border", 
                        isHigh ? "bg-destructive/10 text-destructive border-destructive/20" : 
                        isMed ? "bg-warning/10 text-warning border-warning/20" : 
                        "bg-muted text-muted-foreground border-border/50"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <Badge variant={getSeverityColor(alert.severity)} className="shrink-0 text-[10px] uppercase font-bold tracking-wider">
                        {isHigh ? "Urgente" : isMed ? "Atenção" : "Baixo"}
                      </Badge>
                    </div>
                    <div className="flex-1 mt-1">
                      <p className={cn("text-sm font-bold mb-1", isHigh ? "text-destructive" : isMed ? "text-warning" : "text-foreground")}>{alert.title}</p>
                      <p className="text-xs text-muted-foreground py-0.5 line-clamp-2 leading-relaxed">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                )
                return alert.action_url ? (
                  <Link key={alert.id} href={alert.action_url} className="block group/alert h-full hover:-translate-y-0.5 transition-transform">
                    {content}
                  </Link>
                ) : (
                  <div key={alert.id} className="h-full">{content}</div>
                )
              })}
            </div>
            
            {hasStoreAlerts && (
              <Button variant="outline" size="sm" className="w-full text-xs rounded-xl border-border" asChild>
                <Link href="/stores?tab=alerts">Ver todos os alertas de lojas</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 opacity-50 bg-background rounded-[16px] border border-border/40 border-dashed">
            <ShieldAlert className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Tudo tranquilo! Nenhum alerta no momento.</p>
          </div>
        )}

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <div className="pt-6 mt-auto border-t border-border/40">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Próximas Reuniões</span>
            </div>
            <ScrollArea className="h-[140px] pr-4 flex-1">
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href="/meetings"
                    className="flex items-center justify-between p-3 rounded-[12px] bg-background border border-border/40 hover:border-primary/40 transition-colors group/mtg"
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-md text-xs font-bold font-mono border border-primary/20">
                        {new Date(meeting.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover/mtg:text-primary transition-colors">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(meeting.scheduled_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </div>
  )
}
