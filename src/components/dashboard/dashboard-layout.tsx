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
    <div className="space-y-6 lg:space-y-8 animate-fade-in">
      {/* Quick Actions - adapts per role */}
      <QuickActions />

      {/* Revenue Banner - massive typography focus */}
      <div className="animate-slide-in-from-bottom flex flex-col pt-4">
        <TotalRevenueBanner period={revenuePeriod} onPeriodChange={setRevenuePeriod} onDataChange={handleRevenueData} />
      </div>

      {/* Main Asymmetric Grid: 12 columns */}
      <div className="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-12">
        {/* Board Preview - Dominant 8 columns */}
        <div className="lg:col-span-8 animate-fade-in delay-100">
          <BoardPreview tasks={data.activeTasks} />
        </div>

        {/* Calendar - Subordinate 4 columns */}
        <div className="lg:col-span-4 animate-fade-in delay-200">
          <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
        </div>

        {/* Top Stores - 7 cols */}
        <div className="lg:col-span-7 animate-fade-in delay-300">
          <TopStoresCard
            stores={revenueData?.topStores}
            allStores={revenueData?.storeBreakdown}
            isLoading={!revenueResolved.current}
            dataStatus={revenueData?.dataStatus}
          />
        </div>

        {/* Worst Performers - 5 cols */}
        {(isAdminOrOwner || canViewReports) && (
          <div className="lg:col-span-5 animate-fade-in delay-500">
            <WorstPerformersCard
              stores={revenueData?.bottomStores}
              allStores={revenueData?.storeBreakdown}
              isLoading={!revenueResolved.current}
              dataStatus={revenueData?.dataStatus}
            />
          </div>
        )}

        {/* Onboarding Preview - Full Width Interstitial */}
        <div className="lg:col-span-12 animate-fade-in delay-700">
          <OnboardingPreview onboardings={data.activeOnboardings} userRole={userRole} />
        </div>

        {/* Alerts - 5 cols */}
        <div className="lg:col-span-5 animate-fade-in delay-700">
          <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
        </div>

        {/* Recent Activity - 7 cols */}
        <div className="lg:col-span-7 animate-fade-in delay-1000">
          <RecentActivity activities={data.activities} />
        </div>
      </div>
    </div>
  )
}
