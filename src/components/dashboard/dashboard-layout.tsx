"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Users,
  ShieldAlert,
  CalendarClock,
  MessageSquareWarning,
} from "lucide-react"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
import { BoardPreview } from "./board-preview"
import { WeekCalendarPreview } from "./week-calendar-preview"
import { TopStoresCard } from "./top-stores-card"
import { WorstPerformersCard } from "./worst-performers-card"
import { OnboardingPreview } from "./onboarding-preview"
import { RecentActivity } from "./recent-activity"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Meeting, DashboardAlert } from "@/types"

interface Activity {
  id: string
  type: string
  description: string
  created_at: string
  client?: { name: string } | { name: string }[] | null
  profile?: { name: string } | { name: string }[] | null
}

interface TaskPreview {
  id: string
  status: string
  due_date: string | null
}

interface WeekMeeting {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number | null
  meeting_url: string | null
  status: string
}

interface WeekTask {
  id: string
  title: string
  due_date: string
  status: string
  priority: string
  type: string
}

interface OnboardingItem {
  id: string
  status: string
  current_phase: string | null
  progress_percent: number
  target_completion_date: string | null
  client?: { id: string; name: string } | { id: string; name: string }[] | null
  store?: { id: string; store_name: string } | { id: string; store_name: string }[] | null
}

interface DashboardLayoutProps {
  data: {
    upcomingMeetings: Meeting[]
    activities: Activity[]
    alerts: DashboardAlert[]
    activeTasks: TaskPreview[]
    weekMeetings: WeekMeeting[]
    weekTasks: WeekTask[]
    activeOnboardings: OnboardingItem[]
  }
  userRole: string
}

// Compact client health summary
function ClientHealthSummary({ alerts }: { alerts: DashboardAlert[] }) {
  const healthAlerts = alerts.filter(a => a.type === "health_low")
  const paymentAlerts = alerts.filter(a => a.type === "payment_overdue")
  const contractAlerts = alerts.filter(a => a.type === "contract_expiring")

  return (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Saúde dos Clientes</h3>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 flex-1 space-y-2">
        <div className="space-y-1.5">
          {paymentAlerts.length > 0 && (
            <Link href="/admin/financial" className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Pagamentos vencidos</p>
                  <p className="text-[11px] text-muted-foreground">{paymentAlerts.length} {paymentAlerts.length === 1 ? "cobrança" : "cobranças"}</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {contractAlerts.length > 0 && (
            <Link href="/admin/clients" className="flex items-center justify-between p-2.5 rounded-lg bg-warning/5 hover:bg-warning/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                  <CalendarClock className="h-3.5 w-3.5 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Contratos expirando</p>
                  <p className="text-[11px] text-muted-foreground">{contractAlerts.length} nos próximos 30 dias</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {healthAlerts.length > 0 && (
            <Link href="/admin/clients?health=critical" className="flex items-center justify-between p-2.5 rounded-lg bg-warning/5 hover:bg-warning/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                  <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Health score baixo</p>
                  <p className="text-[11px] text-muted-foreground">{healthAlerts.length} {healthAlerts.length === 1 ? "cliente" : "clientes"} em risco</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {paymentAlerts.length === 0 && contractAlerts.length === 0 && healthAlerts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-success" />
              </div>
              <p className="text-xs text-muted-foreground">Tudo em ordem</p>
            </div>
          )}
        </div>

        <div className="mt-auto pt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs text-primary group" asChild>
            <Link href="/admin/clients">
              Ver todos os clientes
              <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DashboardLayout({ data, userRole }: DashboardLayoutProps) {
  const { permissions, hasFeature } = usePermissions()
  const [revenuePeriod, setRevenuePeriod] = useState("30d")
  const [revenueData, setRevenueData] = useState<TotalRevenueData | null>(null)
  const revenueResolved = useRef(false)
  const handleRevenueData = useCallback((d: TotalRevenueData | null) => {
    revenueResolved.current = true
    setRevenueData(d)
  }, [])

  const isAdminOrOwner = permissions?.isAdmin || permissions?.isOrgOwner
  const canViewReports = isAdminOrOwner || hasFeature("view_reports")

  // Compute critical alerts for top banner
  const criticalAlerts = useMemo(() => {
    const items: Array<{ label: string; href: string; count: number; variant: "destructive" | "warning" }> = []

    const overdueTasks = data.activeTasks.filter(
      t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed" && t.status !== "cancelled"
    ).length
    if (overdueTasks > 0) {
      items.push({ label: `${overdueTasks} ${overdueTasks === 1 ? "tarefa vencida" : "tarefas vencidas"}`, href: "/admin/board", count: overdueTasks, variant: "warning" })
    }

    const highAlerts = data.alerts.filter(a => a.severity === "high").length
    if (highAlerts > 0) {
      items.push({ label: `${highAlerts} ${highAlerts === 1 ? "alerta urgente" : "alertas urgentes"}`, href: "/admin/stores?tab=alerts", count: highAlerts, variant: "destructive" })
    }

    const activeOnboardings = data.activeOnboardings.length
    if (activeOnboardings > 0) {
      items.push({ label: `${activeOnboardings} ${activeOnboardings === 1 ? "onboarding ativo" : "onboardings ativos"}`, href: "/admin/onboarding", count: activeOnboardings, variant: "info" as "warning" })
    }

    return items
  }, [data])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Actionable Alerts Banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mr-1">
            <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
              <MessageSquareWarning className="h-4 w-4 text-warning" />
            </div>
            <span className="text-xs font-semibold text-foreground">Atenção</span>
          </div>
          {criticalAlerts.map((alert, i) => (
            <Link key={i} href={alert.href}>
              <Badge
                variant={alert.variant === "destructive" ? "destructive" : "secondary"}
                className={cn(
                  "text-xs cursor-pointer transition-all hover:scale-105",
                  alert.variant === "warning" && "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20",
                )}
              >
                {alert.label}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Revenue Banner - Compact with period selector */}
      <TotalRevenueBanner period={revenuePeriod} onPeriodChange={setRevenuePeriod} onDataChange={handleRevenueData} />

      {/* Primary Grid: Board + Calendar side by side */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <BoardPreview tasks={data.activeTasks} />
        <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
      </div>

      {/* Secondary Grid: Store Performance + Health + Alerts - 3 columns */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <TopStoresCard
          stores={revenueData?.topStores}
          allStores={revenueData?.storeBreakdown}
          isLoading={!revenueResolved.current}
          dataStatus={revenueData?.dataStatus}
        />

        {(isAdminOrOwner || canViewReports) ? (
          <WorstPerformersCard
            stores={revenueData?.bottomStores}
            allStores={revenueData?.storeBreakdown}
            isLoading={!revenueResolved.current}
            dataStatus={revenueData?.dataStatus}
          />
        ) : (
          <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
        )}

        <ClientHealthSummary alerts={data.alerts} />
      </div>

      {/* Tertiary Row: Onboarding + Activity */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {(isAdminOrOwner || canViewReports) && (
          <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
        )}
        <RecentActivity activities={data.activities} />
      </div>
    </div>
  )
}
