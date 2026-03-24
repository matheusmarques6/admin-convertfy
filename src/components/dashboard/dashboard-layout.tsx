"use client"

import { useState, useCallback, useRef, lazy, Suspense } from "react"
import { DashboardTopBar } from "./dashboard-top-bar"
import type { DateRange } from "./date-range-panel"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
import { KpiCard } from "@/components/ui/kpi-card"
import { KpiCardRow } from "@/components/ui/kpi-card-row"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { formatCurrency } from "@/lib/utils"
import type { Meeting } from "@/types"

// ─── Lazy-loaded components (below the fold) ──────────────
const DashboardRevenueChart = lazy(() =>
  import("./dashboard-revenue-chart").then((m) => ({ default: m.DashboardRevenueChart }))
)
const DashboardWeeklyPerf = lazy(() =>
  import("./dashboard-weekly-perf").then((m) => ({ default: m.DashboardWeeklyPerf }))
)
const DashboardEmailPerf = lazy(() =>
  import("./dashboard-email-perf").then((m) => ({ default: m.DashboardEmailPerf }))
)
const DashboardClientHealth = lazy(() =>
  import("./dashboard-client-health").then((m) => ({ default: m.DashboardClientHealth }))
)
const DashboardFlowPerf = lazy(() =>
  import("./dashboard-flow-perf").then((m) => ({ default: m.DashboardFlowPerf }))
)
const DashboardOnboarding = lazy(() =>
  import("./dashboard-onboarding").then((m) => ({ default: m.DashboardOnboarding }))
)
const DashboardAlerts = lazy(() =>
  import("./dashboard-alerts-card").then((m) => ({ default: m.DashboardAlerts }))
)
const DashboardClientsRevenue = lazy(() =>
  import("./dashboard-clients-revenue").then((m) => ({ default: m.DashboardClientsRevenue }))
)

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

// ─── Mock KPI data ──────────────────────────────────────────

const MOCK_KPI = {
  totalRevenue: 2280000,
  totalRevenueGrowth: 34.2,
  totalRevenueSparkline: [95, 110, 125, 140, 155, 170, 190, 210, 240, 265, 290, 320],
  campaignRevenue: 1280000,
  campaignGrowth: 22.1,
  campaignSparkline: [60, 65, 72, 80, 88, 95, 102, 110, 115, 120, 125, 128],
  automationRevenue: 1020000,
  automationGrowth: -1.8,
  automationSparkline: [92, 95, 98, 100, 102, 99, 97, 100, 103, 101, 102, 102],
  convertfyRate: 21,
  convertfyRateGrowth: 3.2,
  convertfyRateSparkline: [18, 17, 19, 18, 20, 19, 20, 21, 20, 21, 22, 21],
}

// ─── Chart Skeleton ──────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6 animate-pulse">
      <Skeleton className="h-4 w-40 mb-2" />
      <Skeleton className="h-3 w-56 mb-6" />
      <Skeleton className="h-[240px] w-full rounded-[4px]" />
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6 animate-pulse">
      <Skeleton className="h-4 w-40 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[200px] w-full rounded-[4px]" />
      </div>
    </div>
  )
}

// ─── Dashboard Layout (6 ROWs — DS v3.0) ────────────────────
//
// ROW 1: 4 KPI Cards (Receita Total, Campanhas, Automações, Taxa Convertfy)
// ROW 2: Revenue AreaChart (3fr) + Performance BarChart (2fr)
// ROW 3: Email Performance (1fr) + Client Health (1fr)
// ROW 4: 3 Flow Performance cards (1fr each)
// ROW 5: Onboarding (1fr) + Alerts (1fr)
// ROW 6: Clients by Revenue table (full-width)
// ──────────────────────────────────────────────────────────────

export function DashboardLayout({ data: _data, userRole: _userRole, userName }: DashboardLayoutProps) {
  // Period & compare state
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "7d" | "30d" | "90d" | "custom">("30d")
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)

  // Revenue data from TotalRevenueBanner
  const [revenueData, setRevenueData] = useState<TotalRevenueData | null>(null)
  const revenueResolved = useRef(false)
  const handleRevenueData = useCallback((d: TotalRevenueData | null) => {
    revenueResolved.current = true
    setRevenueData(d)
  }, [])

  const isLoading = !revenueResolved.current

  // Format compact currency
  const fmtCompact = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
    return formatCurrency(v)
  }

  const totalRevenue = revenueData?.totalRevenue ?? MOCK_KPI.totalRevenue
  const campaignRevenue = revenueData?.campaignRevenue ?? MOCK_KPI.campaignRevenue
  const flowRevenue = revenueData?.flowRevenue ?? MOCK_KPI.automationRevenue

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ════════════════════════════════════════════════ */}
      {/* TOP BAR                                          */}
      {/* ════════════════════════════════════════════════ */}
      <DashboardTopBar
        userName={userName}
        period={revenuePeriod}
        onPeriodChange={setRevenuePeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        compareEnabled={compareEnabled}
        onCompareToggle={setCompareEnabled}
      />

      {/* Hidden revenue fetcher */}
      <div className="hidden">
        <TotalRevenueBanner
          period={revenuePeriod}
          onPeriodChange={(p) => setRevenuePeriod(p as typeof revenuePeriod)}
          onDataChange={handleRevenueData}
        />
      </div>

      <AnimatedContainer className="space-y-5">
        {/* ════════════════════════════════════════════════ */}
        {/* ROW 1: 4 KPI Cards                              */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <KpiCardRow columns={4}>
            <KpiCard
              label="Receita Total"
              value={fmtCompact(totalRevenue)}
              delta={{ value: MOCK_KPI.totalRevenueGrowth, label: "vs anterior" }}
              sparkData={MOCK_KPI.totalRevenueSparkline}
              loading={isLoading}
            />
            <KpiCard
              label="Receita Campanhas"
              value={fmtCompact(campaignRevenue)}
              delta={{ value: MOCK_KPI.campaignGrowth, label: "vs anterior" }}
              sparkData={MOCK_KPI.campaignSparkline}
              loading={isLoading}
            />
            <KpiCard
              label="Receita Automações"
              value={fmtCompact(flowRevenue)}
              delta={{ value: MOCK_KPI.automationGrowth, label: "vs anterior" }}
              sparkData={MOCK_KPI.automationSparkline}
              loading={isLoading}
            />
            <KpiCard
              label="Taxa média da Convertfy"
              value={`${MOCK_KPI.convertfyRate}%`}
              delta={{ value: MOCK_KPI.convertfyRateGrowth, label: "vs período anterior" }}
              sparkData={MOCK_KPI.convertfyRateSparkline}
              variant="gradient"
              loading={isLoading}
            />
          </KpiCardRow>
        </AnimatedItem>

        {/* ════════════════════════════════════════════════ */}
        {/* ROW 2: Revenue AreaChart + Weekly Performance    */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <Suspense fallback={<ChartSkeleton />}>
                <DashboardRevenueChart loading={isLoading} period={revenuePeriod} />
              </Suspense>
            </div>
            <div className="lg:col-span-2">
              <Suspense fallback={<ChartSkeleton />}>
                <DashboardWeeklyPerf loading={isLoading} />
              </Suspense>
            </div>
          </div>
        </AnimatedItem>

        {/* ════════════════════════════════════════════════ */}
        {/* ROW 3: Email Performance + Client Health         */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <Suspense fallback={<CardSkeleton />}>
              <DashboardEmailPerf loading={isLoading} />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <DashboardClientHealth loading={isLoading} />
            </Suspense>
          </div>
        </AnimatedItem>

        {/* ════════════════════════════════════════════════ */}
        {/* ROW 4: Flow Performance (3 cards)                */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <Suspense fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <ChartSkeleton />
              <ChartSkeleton />
              <ChartSkeleton />
            </div>
          }>
            <DashboardFlowPerf loading={isLoading} />
          </Suspense>
        </AnimatedItem>

        {/* ════════════════════════════════════════════════ */}
        {/* ROW 5: Onboarding + Alerts                       */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Suspense fallback={<CardSkeleton />}>
              <DashboardOnboarding loading={isLoading} />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <DashboardAlerts loading={isLoading} />
            </Suspense>
          </div>
        </AnimatedItem>

        {/* ════════════════════════════════════════════════ */}
        {/* ROW 6: Clients by Revenue (full-width table)     */}
        {/* ════════════════════════════════════════════════ */}
        <AnimatedItem>
          <Suspense fallback={<CardSkeleton />}>
            <DashboardClientsRevenue loading={isLoading} />
          </Suspense>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
