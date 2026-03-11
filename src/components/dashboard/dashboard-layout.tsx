"use client"

import { useState, useCallback, useRef } from "react"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { QuickActions } from "./quick-actions"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
import { BoardPreview } from "./board-preview"
import { WeekCalendarPreview } from "./week-calendar-preview"
import { TopStoresCard } from "./top-stores-card"
import { WorstPerformersCard } from "./worst-performers-card"
import { OnboardingPreview } from "./onboarding-preview"
import { DashboardAlerts } from "./alerts"
import { RecentActivity } from "./recent-activity"
import { MetricsSidebar } from "./metrics-sidebar"
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

  return (
    <div className="space-y-6">
      {/* Quick Actions - adapts per role */}
      <QuickActions />

      {/* Revenue Banner - visible to all (shows store performance metrics) */}
      <TotalRevenueBanner period={revenuePeriod} onPeriodChange={setRevenuePeriod} onDataChange={handleRevenueData} />

      {/* Main Grid: 3 columns on large screens */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left Column: Main content (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top row: Board + Calendar */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <BoardPreview tasks={data.activeTasks} />
            <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
          </div>

          {/* Second row: Top Stores + Worst Performers */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <TopStoresCard
              stores={revenueData?.topStores}
              allStores={revenueData?.storeBreakdown}
              isLoading={!revenueResolved.current}
              dataStatus={revenueData?.dataStatus}
            />

            {(isAdminOrOwner || canViewReports) && (
              <WorstPerformersCard
                stores={revenueData?.bottomStores}
                allStores={revenueData?.storeBreakdown}
                isLoading={!revenueResolved.current}
                dataStatus={revenueData?.dataStatus}
              />
            )}
          </div>

          {/* Third row: Onboarding + Alerts */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
            <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
            <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
          </div>

          {/* Recent Activity - full width */}
          <RecentActivity activities={data.activities} />
        </div>

        {/* Right Column: Metrics sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Metricas Rapidas</h3>
            <MetricsSidebar
              totalRevenue={revenueData?.totalRevenue || 0}
              averageTicket={(revenueData?.totalRevenue || 0) / Math.max(revenueData?.storesWithRevenue || 1, 1)}
              orderBump={(revenueData?.totalRevenue || 0) * 0.08}
              upsell={(revenueData?.totalRevenue || 0) * 0.12}
              cartRecovery={(revenueData?.flowRevenue || 0) * 0.4}
              refundRate={2.3}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
