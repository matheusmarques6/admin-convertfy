"use client"

import { useState, useCallback, useRef } from "react"
import { DashboardTopBar } from "./dashboard-top-bar"
import type { DateRange } from "./date-range-panel"
import { DashboardCharts } from "./dashboard-charts"
import { DashboardQuickSections } from "./dashboard-quick-sections"
import { DashboardTopClients } from "./dashboard-top-clients"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
import { KpiCard } from "@/components/ui/kpi-card"
import { KpiCardRow } from "@/components/ui/kpi-card-row"
import { formatCurrency } from "@/lib/utils"
import type { Meeting } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface TaskPreview {
  id: string
  title: string
  status: string
  due_date: string | null
}

interface DashboardLayoutProps {
  data: {
    upcomingMeetings: Meeting[]
    activeTasks: TaskPreview[]
    // Legacy fields — still passed from page.tsx but no longer rendered
    activities?: unknown[]
    alerts?: unknown[]
    weekMeetings?: unknown[]
    weekTasks?: unknown[]
    activeOnboardings?: unknown[]
    pendingItems?: unknown
  }
  userRole: string
  userName: string
}

// ─── Mock KPI data (until real API is connected) ──────────

const MOCK_KPI = {
  totalRevenue: 842567,
  revenueGrowth: 16.4,
  revenueSparkline: [42, 45, 48, 43, 51, 54, 48, 52, 58, 62, 60, 55, 58, 63, 65, 62, 68, 70, 72, 75, 71, 74, 78, 80, 76, 79, 82, 85, 84, 88],
  activeClients: 248,
  clientGrowth: 4.2,
  clientsSparkline: [230, 232, 233, 235, 236, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248],
  openRate: 32.5,
  openRateChange: -1.8,
  avgHealthScore: 87,
  healthChange: 2.1,
}

// ─── Dashboard Layout (Inverted Pyramid — 4 levels) ───────
//
// REMOVED from previous layout:
//   - WeekCalendarPreview → moved to /admin/meetings
//   - OnboardingPreview → moved to /admin/onboarding
//   - DashboardAlerts → moved to notification bell icon
//   - ClientHealthSummary → data visible via Top Clients health column
//   - PendingItemsCard → tasks visible in Quick Sections
//   - QuickActions → simplified away (buttons in top bar)
//   - RecentActivity → moved to notification/activity feed
//   - CommemorativeDatesCard → removed (low priority)
//   - BillingMetrics → moved to /admin/financial
//   - RevenueGoalCard → simplified into KPI delta
//   - RevenueComparisonChart → replaced by DashboardCharts
//   - TopStoresCard / WorstPerformersCard → replaced by TopClients
//
// Reason: Problem #13 — "Dashboard com 6 seções simultâneas,
// sobrecarga cognitiva." DS v3.0 inverted pyramid with 4 clear
// hierarchy levels.
// ──────────────────────────────────────────────────────────

export function DashboardLayout({ data, userRole, userName }: DashboardLayoutProps) {
  // Period & compare state (shared with TopBar + TotalRevenueBanner)
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "7d" | "30d" | "90d" | "custom">("30d")
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)

  // Revenue data from TotalRevenueBanner (fetches from API)
  const [revenueData, setRevenueData] = useState<TotalRevenueData | null>(null)
  const revenueResolved = useRef(false)
  const handleRevenueData = useCallback((d: TotalRevenueData | null) => {
    revenueResolved.current = true
    setRevenueData(d)
  }, [])

  const isLoading = !revenueResolved.current

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ════════════════════════════════════════════════════════ */}
      {/* TOP BAR: Title + Greeting + Period + Compare            */}
      {/* ════════════════════════════════════════════════════════ */}
      <DashboardTopBar
        userName={userName}
        period={revenuePeriod}
        onPeriodChange={setRevenuePeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        compareEnabled={compareEnabled}
        onCompareToggle={setCompareEnabled}
      />

      {/* Hidden: TotalRevenueBanner fetches data but is visually replaced by KPI cards */}
      <div className="hidden">
        <TotalRevenueBanner
          period={revenuePeriod}
          onPeriodChange={(p) => setRevenuePeriod(p as typeof revenuePeriod)}
          onDataChange={handleRevenueData}
        />
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* LEVEL 1: KPI Cards (above the fold)                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <KpiCardRow>
        <KpiCard
          label="Receita Total"
          value={revenueData ? formatCurrency(revenueData.totalRevenue) : formatCurrency(MOCK_KPI.totalRevenue)}
          delta={{
            value: revenueData ? ((revenueData.totalRevenue / (MOCK_KPI.totalRevenue * 0.86) - 1) * 100) : MOCK_KPI.revenueGrowth,
            label: "vs período anterior",
          }}
          sparkData={MOCK_KPI.revenueSparkline}
          variant="gradient"
          loading={isLoading}
        />
        <KpiCard
          label="Clientes Ativos"
          value={MOCK_KPI.activeClients.toLocaleString("pt-BR")}
          delta={{ value: MOCK_KPI.clientGrowth }}
          sparkData={MOCK_KPI.clientsSparkline}
          loading={isLoading}
        />
        <KpiCard
          label="Taxa de Open Rate"
          value={`${MOCK_KPI.openRate}%`}
          delta={{ value: MOCK_KPI.openRateChange }}
          loading={isLoading}
        />
        <KpiCard
          label="Health Score Médio"
          value={`${MOCK_KPI.avgHealthScore}/100`}
          delta={{ value: MOCK_KPI.healthChange }}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* ════════════════════════════════════════════════════════ */}
      {/* LEVEL 2: Charts (Revenue area + Campaign bars)          */}
      {/* ════════════════════════════════════════════════════════ */}
      <DashboardCharts
        compareEnabled={compareEnabled}
        loading={isLoading}
      />

      {/* ════════════════════════════════════════════════════════ */}
      {/* LEVEL 3: Quick Sections (Meetings + Tasks)              */}
      {/* ════════════════════════════════════════════════════════ */}
      <DashboardQuickSections
        meetings={data.upcomingMeetings}
        tasks={data.activeTasks}
      />

      {/* ════════════════════════════════════════════════════════ */}
      {/* LEVEL 4: Top Clients (DataTable)                        */}
      {/* ════════════════════════════════════════════════════════ */}
      <DashboardTopClients loading={isLoading} />
    </div>
  )
}
