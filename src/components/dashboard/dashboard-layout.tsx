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
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Quick Actions Row */}
      <QuickActions />

      {/* Revenue Banner - Full Width Hero */}
      <TotalRevenueBanner period={revenuePeriod} onPeriodChange={setRevenuePeriod} onDataChange={handleRevenueData} />

      {/* Primary Grid: Board + Calendar side by side */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <BoardPreview tasks={data.activeTasks} />
        <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
      </div>

      {/* Secondary Grid: Store Performance + Alerts - 3 columns */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
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

        <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
      </div>

      {/* Tertiary Row: Onboarding (for admins) + Activity */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {(isAdminOrOwner || canViewReports) && (
          <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
        )}
        <RecentActivity activities={data.activities} />
      </div>
    </div>
  )
}
