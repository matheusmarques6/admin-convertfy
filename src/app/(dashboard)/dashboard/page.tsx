import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { DashboardCharts } from "@/components/dashboard/charts"
import { DashboardAlerts } from "@/components/dashboard/alerts"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

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

  return {
    upcomingMeetings: meetings || [],
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
  const data = await getDashboardData()

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <QuickActions />

      {/* Billing Metrics with Period Selector */}
      <Suspense fallback={<MetricsSkeleton />}>
        <BillingMetrics />
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
