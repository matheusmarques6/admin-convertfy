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

  // Fetch deals
  const { data: deals } = await supabase
    .from("deals")
    .select("value, stage_id")

  // Fetch invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, status, due_date")

  // Fetch upcoming meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5)

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
          <DashboardCharts />
        </div>
        <div className="col-span-full lg:col-span-3 space-y-6">
          <DashboardAlerts meetings={data.upcomingMeetings} />
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}
