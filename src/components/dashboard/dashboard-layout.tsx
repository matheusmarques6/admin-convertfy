"use client"

import { usePermissions } from "@/lib/hooks/use-permissions"
import { QuickActions } from "./quick-actions"
import { TotalRevenueBanner } from "./total-revenue-banner"
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

  const isAdminOrOwner = permissions?.isAdmin || permissions?.isOrgOwner
  const canViewReports = isAdminOrOwner || hasFeature("view_reports")

  return (
    <div className="space-y-6">
      {/* Quick Actions - adapts per role */}
      <QuickActions />

      {/* Revenue Banner - visible to all (shows store performance metrics) */}
      <TotalRevenueBanner />

      {/* Main Grid: 2 columns */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Board Preview - visible to all */}
        <BoardPreview tasks={data.activeTasks} />

        {/* Calendar - visible to all */}
        <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />

        {/* Top Stores - visible to all */}
        <TopStoresCard />

        {/* Worst Performers - admin, COO and those with reports access */}
        {(isAdminOrOwner || canViewReports) && (
          <WorstPerformersCard />
        )}

        {/* Onboarding Preview - visible to all, filters by role internally */}
        <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />

        {/* Alerts - filters internally by feature */}
        <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
      </div>

      {/* Recent Activity - visible to all */}
      <RecentActivity activities={data.activities} />
    </div>
  )
}
