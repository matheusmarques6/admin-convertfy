"use client"

import Link from "next/link"
import {
  AlertCircle,
  FileText,
  HeartPulse,
  Calendar,
  Clock,
  CheckCircle2,
  TrendingDown,
  ShieldAlert,
  Mail,
  Zap,
} from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePermissions } from "@/lib/hooks/use-permissions"
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

export function OperationalAlerts({ alerts }: OperationalAlertsProps) {
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
        return "destructive" as const
      case "medium":
        return "warning" as const
      case "low":
        return "secondary" as const
    }
  }

  const highCount = filteredAlerts.filter(a => a.severity === "high").length

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-foreground">Alertas Recentes</CardTitle>
            <CardDescription>Itens que precisam da sua atenção</CardDescription>
          </div>
          {filteredAlerts.length > 0 && (
            <Badge variant={highCount > 0 ? "destructive" : "secondary"} className="bg-destructive/10 text-destructive border-0 text-xs rounded-full">
              {filteredAlerts.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {filteredAlerts.length > 0 ? (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {filteredAlerts.map((alert) => {
                const AlertIcon = ALERT_ICONS[alert.type] || Clock
                const content = (
                  <div
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className={`rounded-md p-1.5 ${
                      alert.severity === "high" ? "bg-destructive/10" :
                      alert.severity === "medium" ? "bg-warning/10" : "bg-muted"
                    }`}>
                      <IconWrapper icon={AlertIcon} customSize={14} className={
                        alert.severity === "high" ? "text-destructive" :
                        alert.severity === "medium" ? "text-warning" : "text-muted-foreground"
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {alert.description}
                      </p>
                    </div>
                    <Badge variant={getSeverityColor(alert.severity)} className="shrink-0 text-[10px] h-5 px-2">
                      {alert.severity === "high" ? "Urgente" :
                       alert.severity === "medium" ? "Atenção" : "Baixo"}
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
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <IconWrapper icon={CheckCircle2} customSize={32} className="mb-2 text-success opacity-50" />
            <p className="text-sm">Sem alertas recentes</p>
          </div>
        )}
      </CardContent>
    </div>
  )
}
