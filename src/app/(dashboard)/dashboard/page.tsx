import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { DashboardCharts } from "@/components/dashboard/charts"
import { DashboardAlerts } from "@/components/dashboard/alerts"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { TotalRevenueBanner } from "@/components/dashboard/total-revenue-banner"
import { TodayAgenda } from "@/components/dashboard/today-agenda"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import type { DashboardAlert } from "@/types"

export const dynamic = "force-dynamic"

const STATUS_COLORS: Record<string, string> = {
  active: "#22C55E",
  prospect: "#3B82F6",
  onboarding: "#5327F2",
  inactive: "#6B7280",
  churned: "#EF4444",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativos",
  prospect: "Prospect",
  onboarding: "Onboarding",
  inactive: "Inativos",
  churned: "Churned",
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

async function getDashboardData() {
  const supabase = await createClient()

  // Fetch upcoming meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5)

  // --- Revenue last 6 months ---
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [{ data: paidCharges }, { data: paidInvoices }] = await Promise.all([
    supabase
      .from("client_charges")
      .select("value, due_date")
      .in("status", ["paid", "RECEIVED", "CONFIRMED"])
      .gte("due_date", sixMonthsAgo.toISOString()),
    supabase
      .from("invoices")
      .select("amount, due_date")
      .eq("status", "paid")
      .gte("due_date", sixMonthsAgo.toISOString()),
  ])

  const revenueByMonth = new Map<string, number>()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    revenueByMonth.set(key, 0)
  }
  paidCharges?.forEach((c) => {
    const key = c.due_date?.slice(0, 7)
    if (key && revenueByMonth.has(key)) {
      revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + (c.value || 0))
    }
  })
  paidInvoices?.forEach((inv) => {
    const key = inv.due_date?.slice(0, 7)
    if (key && revenueByMonth.has(key)) {
      revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + (inv.amount || 0))
    }
  })
  const revenueData = Array.from(revenueByMonth.entries()).map(([key, value]) => ({
    month: MONTH_LABELS[parseInt(key.split("-")[1]) - 1],
    receita: value,
  }))

  // --- Clients by status ---
  const { data: clientRows } = await supabase
    .from("clients")
    .select("status")

  const statusCounts: Record<string, number> = {}
  clientRows?.forEach((c) => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  })
  const clientsData = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "#6B7280",
    }))

  // --- Pipeline by stage ---
  const { data: deals } = await supabase
    .from("deals")
    .select("value, stage:pipeline_stages(name, order)")

  const stageMap = new Map<string, { value: number; deals: number; order: number }>()
  deals?.forEach((d) => {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    const name = stage?.name || "Sem estágio"
    const order = stage?.order ?? 999
    const current = stageMap.get(name) || { value: 0, deals: 0, order }
    stageMap.set(name, {
      value: current.value + (d.value || 0),
      deals: current.deals + 1,
      order: Math.min(current.order, order),
    })
  })
  const pipelineData = Array.from(stageMap.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([stage, data]) => ({
      stage,
      value: data.value,
      deals: data.deals,
    }))

  // --- MRR from active contracts ---
  const { data: activeContracts } = await supabase
    .from("contracts")
    .select("monthly_value")
    .eq("status", "active")

  const mrr = activeContracts?.reduce((sum, c) => sum + (c.monthly_value || 0), 0) || 0

  // --- Recent activities ---
  const { data: activities } = await supabase
    .from("activities")
    .select("id, type, description, created_at, client:clients(name), profile:profiles(name)")
    .order("created_at", { ascending: false })
    .limit(8)

  // --- Alerts: contracts expiring in 30 days ---
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiringContracts } = await supabase
    .from("contracts")
    .select("id, plan_name, end_date, client_id")
    .eq("status", "active")
    .not("end_date", "is", null)
    .lte("end_date", thirtyDaysFromNow)
    .order("end_date", { ascending: true })
    .limit(5)

  // Get client names for expiring contracts
  const expiringClientIds = [...new Set(expiringContracts?.map((c) => c.client_id).filter(Boolean) || [])]
  const { data: expiringClients } = expiringClientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", expiringClientIds)
    : { data: [] }
  const expiringClientMap = new Map(expiringClients?.map((c) => [c.id, c.name]) || [])

  // --- Alerts: clients with low health score ---
  const { data: lowHealthClients } = await supabase
    .from("clients")
    .select("id, name, health_score")
    .eq("status", "active")
    .lt("health_score", 30)
    .order("health_score", { ascending: true })
    .limit(5)

  // --- Alerts: overdue charges ---
  const { data: overdueCharges } = await supabase
    .from("client_charges")
    .select("id, description, value, due_date, client_id")
    .eq("status", "overdue")
    .order("due_date", { ascending: true })
    .limit(5)

  // Get client names for overdue charges
  const overdueClientIds = [...new Set(overdueCharges?.map((c) => c.client_id).filter(Boolean) || [])]
  const { data: overdueClients } = overdueClientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", overdueClientIds)
    : { data: [] }
  const overdueClientMap = new Map(overdueClients?.map((c) => [c.id, c.name]) || [])

  // Build alerts array
  const alerts: DashboardAlert[] = []

  overdueCharges?.forEach((c) => {
    const clientName = overdueClientMap.get(c.client_id) || "Cliente"
    alerts.push({
      id: `overdue-${c.id}`,
      type: "payment_overdue",
      title: "Pagamento vencido",
      description: `${clientName} - ${c.description || "Cobrança"} vencida em ${new Date(c.due_date).toLocaleDateString("pt-BR")}`,
      severity: "high",
    })
  })

  expiringContracts?.forEach((c) => {
    const clientName = expiringClientMap.get(c.client_id) || "Cliente"
    alerts.push({
      id: `contract-${c.id}`,
      type: "contract_expiring",
      title: "Contrato expirando",
      description: `${clientName} - ${c.plan_name} expira em ${new Date(c.end_date!).toLocaleDateString("pt-BR")}`,
      severity: "medium",
    })
  })

  lowHealthClients?.forEach((c) => {
    alerts.push({
      id: `health-${c.id}`,
      type: "health_low",
      title: "Health score baixo",
      description: `${c.name} está com score ${c.health_score}/100`,
      severity: "low",
    })
  })

  return {
    upcomingMeetings: meetings || [],
    revenueData,
    clientsData,
    pipelineData,
    mrr,
    activities: activities || [],
    alerts,
  }
}

function MetricsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-10" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  // Redirect agentes (não-admin/não-owner) para dashboard operacional
  const supabase2 = await createClient()
  const { data: { user: authUser } } = await supabase2.auth.getUser()

  if (!authUser) {
    redirect("/login")
  }

  const { data: authProfile } = await supabase2
    .from("profiles")
    .select("role")
    .eq("id", authUser.id)
    .single()

  const isAdmin = authProfile?.role === "admin"

  if (!isAdmin) {
    const { data: authOrgMember } = await supabase2
      .from("org_members")
      .select("role")
      .eq("profile_id", authUser.id)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (authOrgMember?.role !== "owner") {
      redirect("/dashboard/operational")
    }
  }

  const data = await getDashboardData()

  return (
    <AnimatedContainer className="space-y-6">
      {/* Total Revenue Banner */}
      <AnimatedItem>
        <TotalRevenueBanner />
      </AnimatedItem>

      {/* Quick Actions */}
      <AnimatedItem>
        <QuickActions />
      </AnimatedItem>

      {/* Billing Metrics with Period Selector */}
      <AnimatedItem>
        <Suspense fallback={<MetricsSkeleton />}>
          <BillingMetrics mrr={data.mrr} />
        </Suspense>
      </AnimatedItem>

      {/* Charts and Activity */}
      <AnimatedItem>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-full lg:col-span-4">
            <DashboardCharts
              revenueData={data.revenueData}
              clientsData={data.clientsData}
              pipelineData={data.pipelineData}
            />
          </div>
          <div className="col-span-full lg:col-span-3 space-y-6">
            <TodayAgenda meetings={data.upcomingMeetings} />
            <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
            <RecentActivity activities={data.activities} />
          </div>
        </div>
      </AnimatedItem>
    </AnimatedContainer>
  )
}
