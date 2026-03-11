"use client"

import Link from "next/link"
import { Calendar, AlertCircle, Clock, FileText, HeartPulse, TrendingDown, ShieldAlert, Mail, Zap, Bell, ArrowRight, Video } from "lucide-react"
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

  const getSeverityStyles = (severity: "high" | "medium" | "low") => {
    switch (severity) {
      case "high":
        return {
          badge: "bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400 border-0",
          icon: "bg-red-500/10 dark:bg-red-500/20",
          iconColor: "text-red-500 dark:text-red-400"
        }
      case "medium":
        return {
          badge: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-0",
          icon: "bg-amber-500/10 dark:bg-amber-500/20",
          iconColor: "text-amber-600 dark:text-amber-400"
        }
      case "low":
        return {
          badge: "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border-0",
          icon: "bg-slate-500/10 dark:bg-slate-500/20",
          iconColor: "text-slate-500 dark:text-slate-400"
        }
    }
  }

  const hasStoreAlerts = filteredAlerts.some((a) =>
    ["low_revenue", "klaviyo_account_error", "campaign_failure", "low_recovery_rate"].includes(a.type)
  )
  const totalAlerts = filteredAlerts.length

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/20">
              <Bell className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            </div>
            <CardTitle className="text-sm font-semibold">Alertas e Lembretes</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <Badge className="bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400 border-0 rounded-full text-xs px-2.5 h-5 font-semibold">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {filteredAlerts.length > 0 ? (
          <div className="space-y-2">
            {filteredAlerts.map((alert) => {
              const Icon = ALERT_ICONS[alert.type] || Clock
              const styles = getSeverityStyles(alert.severity)
              const content = (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 dark:bg-white/[0.03] hover:bg-muted/40 dark:hover:bg-white/[0.06] transition-all group">
                  <div className={`rounded-lg p-2 ${styles.icon}`}>
                    <Icon className={`h-4 w-4 ${styles.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{alert.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {alert.description}
                    </p>
                  </div>
                  <Badge className={`shrink-0 text-[10px] h-5 px-2 font-medium ${styles.badge}`}>
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
            {hasStoreAlerts && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground hover:text-primary group mt-1"
                asChild
              >
                <Link href="/stores?tab=alerts" className="flex items-center justify-center gap-1.5">
                  Ver todos os alertas de lojas
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="py-6 text-center">
            <div className="p-3 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 w-fit mx-auto mb-3">
              <Bell className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum alerta no momento</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tudo funcionando normalmente</p>
          </div>
        )}

        {/* Upcoming Meetings */}
        {meetings.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 pt-3 mt-3 border-t border-border dark:border-white/[0.08]">
              <div className="p-1.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Video className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">Proximas Reunioes</span>
              <Badge className="bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400 border-0 text-[10px] px-2 h-4">
                {meetings.length}
              </Badge>
            </div>
            <ScrollArea className="h-[140px]">
              <div className="space-y-2">
                {meetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href="/meetings"
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/20 dark:bg-white/[0.03] hover:bg-muted/40 dark:hover:bg-white/[0.06] transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                        <Calendar className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(meeting.scheduled_at)}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </div>
  )
}
