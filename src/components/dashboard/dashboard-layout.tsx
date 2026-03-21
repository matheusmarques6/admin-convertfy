"use client"

import { useMemo, useState, useCallback, useRef } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Users,
  ShieldAlert,
  CalendarClock,
  MessageSquareWarning,
  ClipboardList,
  FileBarChart,
  Send,
  CheckCircle,
  Eye,
  UserPlus,
  CalendarPlus,
  FileText,
} from "lucide-react"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { BoardPreview } from "./board-preview"
import { WeekCalendarPreview } from "./week-calendar-preview"
import { OnboardingPreview } from "./onboarding-preview"
import { RecentActivity } from "./recent-activity"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
import { TopStoresCard } from "./top-stores-card"
import { WorstPerformersCard } from "./worst-performers-card"
import { DashboardAlerts } from "./alerts"
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

interface PendingItems {
  draftReports: number
  draftCampaigns: number
  pendingReviewCampaigns: number
  overdueTasksCount: number
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
    pendingItems: PendingItems
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
                  <p className="text-[11px] text-muted-foreground">{paymentAlerts.length} {paymentAlerts.length === 1 ? "assinatura" : "assinaturas"}</p>
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

function PendingItemsCard({ pendingItems }: { pendingItems: PendingItems }) {
  const total = pendingItems.draftReports + pendingItems.draftCampaigns + pendingItems.pendingReviewCampaigns + pendingItems.overdueTasksCount

  return (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-amber-600" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Pendências</h3>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">{total}</Badge>
          )}
        </div>
      </div>
      <div className="px-5 pb-5 flex-1 space-y-2">
        <div className="space-y-1.5">
          {pendingItems.overdueTasksCount > 0 && (
            <Link href="/admin/board" className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Tarefas vencidas</p>
                  <p className="text-[11px] text-muted-foreground">{pendingItems.overdueTasksCount} {pendingItems.overdueTasksCount === 1 ? "tarefa" : "tarefas"} atrasada(s)</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {pendingItems.draftReports > 0 && (
            <Link href="/admin/reports" className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <FileBarChart className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Relatórios rascunho</p>
                  <p className="text-[11px] text-muted-foreground">{pendingItems.draftReports} aguardando publicação</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {pendingItems.draftCampaigns > 0 && (
            <Link href="/admin/campaigns" className="flex items-center justify-between p-2.5 rounded-lg bg-blue-500/5 hover:bg-blue-500/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Send className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Campanhas rascunho</p>
                  <p className="text-[11px] text-muted-foreground">{pendingItems.draftCampaigns} aguardando envio</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {pendingItems.pendingReviewCampaigns > 0 && (
            <Link href="/admin/campaigns?status=pending_review" className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/5 hover:bg-amber-500/10 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <Eye className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">Campanhas em revisão</p>
                  <p className="text-[11px] text-muted-foreground">{pendingItems.pendingReviewCampaigns} aguardando aprovação</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {total === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-2">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <p className="text-xs text-muted-foreground">Nenhuma pendência</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickActions() {
  const actions = [
    { label: "Novo Cliente", href: "/admin/clients/new", icon: UserPlus, color: "bg-primary/10 text-primary" },
    { label: "Nova Reuniao", href: "/admin/meetings", icon: CalendarPlus, color: "bg-success/10 text-success" },
    { label: "Nova Campanha", href: "/admin/campaigns", icon: Send, color: "bg-info/10 text-info" },
    { label: "Novo Relatorio", href: "/admin/reports/new", icon: FileText, color: "bg-amber-500/10 text-amber-600" },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground mr-1">Acoes rapidas</span>
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors"
        >
          <action.icon className={cn("h-3.5 w-3.5", action.color.split(" ")[1])} />
          <span className="hidden sm:inline">{action.label}</span>
        </Link>
      ))}
    </div>
  )
}

export function DashboardLayout({ data, userRole }: DashboardLayoutProps) {
  const { permissions, hasFeature } = usePermissions()

  const isAdminOrOwner = permissions?.isAdmin || permissions?.isOrgOwner
  const canViewReports = isAdminOrOwner || hasFeature("view_reports")

  // Revenue state for strategic cards
  const [revenuePeriod, setRevenuePeriod] = useState("30d")
  const [revenueData, setRevenueData] = useState<TotalRevenueData | null>(null)
  const revenueResolved = useRef(false)
  const handleRevenueData = useCallback((d: TotalRevenueData | null) => {
    revenueResolved.current = true
    setRevenueData(d)
  }, [])

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

      {/* Quick Actions */}
      <QuickActions />

      {/* Strategic: Revenue Banner */}
      <TotalRevenueBanner period={revenuePeriod} onPeriodChange={setRevenuePeriod} onDataChange={handleRevenueData} />

      {/* Store Performance: Top + Worst */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <TopStoresCard
          stores={revenueData?.topStores}
          allStores={revenueData?.storeBreakdown}
          isLoading={!revenueResolved.current}
          dataStatus={revenueData?.dataStatus}
        />
        <WorstPerformersCard
          stores={revenueData?.bottomStores}
          allStores={revenueData?.storeBreakdown}
          isLoading={!revenueResolved.current}
          dataStatus={revenueData?.dataStatus}
        />
      </div>

      {/* Primary Grid: Board + Calendar side by side */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <BoardPreview tasks={data.activeTasks} />
        <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
      </div>

      {/* Secondary Grid: Health + Pending + Onboarding */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <ClientHealthSummary alerts={data.alerts} />
        <PendingItemsCard pendingItems={data.pendingItems} />
        <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
      </div>

      {/* Alerts + Activity */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
        <RecentActivity activities={data.activities} />
      </div>
    </div>
  )
}
