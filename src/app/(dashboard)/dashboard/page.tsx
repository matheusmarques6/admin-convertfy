import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { DashboardMetrics } from "@/components/dashboard/metrics"
import { DashboardCharts } from "@/components/dashboard/charts"
import { DashboardAlerts } from "@/components/dashboard/alerts"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

async function getDashboardData() {
  const supabase = await createClient()

  // Fetch clients count
  const { count: clientsCount } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")

  // Fetch all clients for status chart
  const { data: allClients } = await supabase
    .from("clients")
    .select("status")

  // Fetch deals with stages
  const { data: deals } = await supabase
    .from("deals")
    .select("value, stage_id, stage:pipeline_stages(name)")

  // Fetch invoices with payment date for revenue chart
  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, status, due_date, payment_date, created_at")

  // Fetch upcoming meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5)

  // Fetch recent activities
  const { data: activities } = await supabase
    .from("activities")
    .select(`
      id,
      type,
      description,
      created_at,
      user:profiles!activities_user_id_fkey (
        name
      ),
      client:clients (
        name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(10)

  // Calculate metrics
  const totalRevenue = invoices
    ?.filter((i) => i.status === "paid")
    ?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  const pendingPayments = invoices
    ?.filter((i) => i.status === "pending")
    ?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  const overduePayments = invoices
    ?.filter((i) => i.status === "overdue")
    ?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  const pipelineValue = deals?.reduce((sum, d) => sum + Number(d.value), 0) || 0

  // Calculate revenue by month (last 6 months)
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const revenueByMonth: { month: string; receita: number }[] = []

  for (let i = 5; i >= 0; i--) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const year = date.getFullYear()
    const month = date.getMonth()

    const monthRevenue = invoices
      ?.filter((inv) => {
        if (inv.status !== "paid") return false
        const paymentDate = inv.payment_date ? new Date(inv.payment_date) : new Date(inv.created_at)
        return paymentDate.getFullYear() === year && paymentDate.getMonth() === month
      })
      ?.reduce((sum, inv) => sum + Number(inv.amount), 0) || 0

    revenueByMonth.push({
      month: monthNames[month],
      receita: monthRevenue,
    })
  }

  // Calculate clients by status
  const clientsByStatus = [
    { name: "Ativos", value: allClients?.filter((c) => c.status === "active").length || 0, color: "#22C55E" },
    { name: "Em Onboarding", value: allClients?.filter((c) => c.status === "onboarding").length || 0, color: "#3B82F6" },
    { name: "Inativos", value: allClients?.filter((c) => c.status === "inactive").length || 0, color: "#94A3B8" },
    { name: "Churned", value: allClients?.filter((c) => c.status === "churned").length || 0, color: "#EF4444" },
    { name: "Prospect", value: allClients?.filter((c) => c.status === "prospect").length || 0, color: "#F59E0B" },
  ].filter((c) => c.value > 0)

  // Calculate pipeline by stage
  const stageMap = new Map<string, { value: number; deals: number }>()
  deals?.forEach((deal) => {
    const stageName = (deal.stage as { name: string } | null)?.name || "Sem estágio"
    const existing = stageMap.get(stageName) || { value: 0, deals: 0 }
    stageMap.set(stageName, {
      value: existing.value + Number(deal.value),
      deals: existing.deals + 1,
    })
  })

  const pipelineByStage = Array.from(stageMap.entries()).map(([stage, data]) => ({
    stage,
    value: data.value,
    deals: data.deals,
  }))

  return {
    metrics: {
      activeClients: clientsCount || 0,
      totalRevenue,
      pendingPayments,
      overduePayments,
      pipelineValue,
      totalDeals: deals?.length || 0,
    },
    upcomingMeetings: meetings || [],
    chartsData: {
      revenueByMonth,
      clientsByStatus,
      pipelineByStage,
    },
    recentActivities: activities || [],
  }
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  )
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <QuickActions />

      {/* Metrics Cards */}
      <Suspense fallback={<MetricsSkeleton />}>
        <DashboardMetrics metrics={data.metrics} />
      </Suspense>

      {/* Charts and Activity */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-full lg:col-span-4">
          <DashboardCharts
            revenueData={data.chartsData.revenueByMonth}
            clientsData={data.chartsData.clientsByStatus}
            pipelineData={data.chartsData.pipelineByStage}
          />
        </div>
        <div className="col-span-full lg:col-span-3 space-y-6">
          <DashboardAlerts meetings={data.upcomingMeetings} />
          <RecentActivity activities={data.recentActivities} />
        </div>
      </div>
    </div>
  )
}
