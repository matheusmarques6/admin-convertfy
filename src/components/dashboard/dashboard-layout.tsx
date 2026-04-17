"use client"

import { useState, useCallback, useRef, useMemo, lazy, Suspense } from "react"
import { DashboardTopBar } from "./dashboard-top-bar"
import type { DateRange } from "./date-range-panel"
import { TotalRevenueBanner, type TotalRevenueData, type RevenueStoreItem } from "./total-revenue-banner"
import { KpiCard } from "@/components/ui/kpi-card"
import { KpiCardRow } from "@/components/ui/kpi-card-row"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { formatCurrency } from "@/lib/utils"
import type { Meeting, DashboardAlert } from "@/types"

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

interface OnboardingEntry {
  id: string
  status: string
  current_phase?: string | null
  progress_percent: number
  target_completion_date?: string | null
  started_at?: string | null
  client?: { id: string; name: string } | { id: string; name: string }[] | null
  store?: { id: string; store_name: string } | { id: string; store_name: string }[] | null
}

export interface DashboardLayoutProps {
  data: {
    upcomingMeetings: Meeting[]
    activeTasks: TaskPreview[]
    activities?: unknown[]
    alerts?: DashboardAlert[]
    weekMeetings?: unknown[]
    weekTasks?: unknown[]
    activeOnboardings?: OnboardingEntry[]
    pendingItems?: unknown
  }
  userRole: string
  userName: string
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

export function DashboardLayout({ data, userRole: _userRole, userName }: DashboardLayoutProps) {
  // Period & compare state
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "7d" | "30d" | "90d" | "custom">("30d")
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)

  // Revenue data from TotalRevenueBanner (real API)
  const [revenueData, setRevenueData] = useState<TotalRevenueData | null>(null)
  const revenueResolved = useRef(false)
  const handleRevenueData = useCallback((d: TotalRevenueData | null) => {
    revenueResolved.current = true
    setRevenueData(d)
  }, [])

  const isLoading = !revenueResolved.current

  // ─── Computed KPI values from REAL data ─────────────────

  const totalRevenue = revenueData?.totalRevenue ?? 0
  const campaignRevenue = revenueData?.campaignRevenue ?? 0
  const flowRevenue = revenueData?.flowRevenue ?? 0

  // Taxa Convertfy = média da % de receita atribuída de cada loja
  const storeBreakdown = useMemo(
    () => revenueData?.storeBreakdown ?? [],
    [revenueData?.storeBreakdown],
  )
  const convertfyRate = useMemo(() => {
    const storesWithRevenue = storeBreakdown.filter((s) => {
      const storeRev = Number(s.totalRevenueBRL) || s.totalRevenue || 0
      return storeRev > 0
    })
    if (storesWithRevenue.length === 0) return 0
    const sumPercents = storesWithRevenue.reduce((sum, s) => {
      const storeRev = Number(s.totalRevenueBRL) || s.totalRevenue || 0
      const attributed = (Number(s.campaignRevenueBRL) || s.campaignRevenue || 0) +
        (Number(s.flowRevenueBRL) || s.flowRevenue || 0)
      return sum + (attributed / storeRev) * 100
    }, 0)
    return sumPercents / storesWithRevenue.length
  }, [storeBreakdown])

  // Format compact currency
  const fmtCompact = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
    return formatCurrency(v)
  }

  // ─── Map storeBreakdown for Client Health + Clients Revenue ──

  const clientStoreData: RevenueStoreItem[] = storeBreakdown

  // ─── Map onboarding data from page.tsx ────────────────────

  const onboardingData = useMemo(() => {
    const entries = data.activeOnboardings ?? []
    return entries.map((ob) => {
      const client = Array.isArray(ob.client) ? ob.client[0] : ob.client
      const store = Array.isArray(ob.store) ? ob.store[0] : ob.store
      const started = ob.started_at ? new Date(ob.started_at) : (ob.target_completion_date ? new Date(ob.target_completion_date) : new Date())
      const days = Math.max(1, Math.ceil((Date.now() - started.getTime()) / (1000 * 60 * 60 * 24)))
      return {
        id: ob.id,
        storeName: store?.store_name ?? client?.name ?? "Loja",
        phase: ob.current_phase ?? ob.status ?? "in_progress",
        days,
        isNew: days <= 2,
        isLate: ob.target_completion_date ? new Date(ob.target_completion_date) < new Date() : false,
      }
    })
  }, [data.activeOnboardings])

  // ─── Map alerts from page.tsx ─────────────────────────────

  const alertsData = useMemo(() => {
    const alerts = data.alerts ?? []
    return alerts.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      clientName: a.store_name ?? "",
      severity: a.severity === "high" ? 0 : a.severity === "medium" ? 1 : 2,
    }))
  }, [data.alerts])

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* TOP BAR */}
      <DashboardTopBar
        userName={userName}
        period={revenuePeriod}
        onPeriodChange={setRevenuePeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        compareEnabled={compareEnabled}
        onCompareToggle={setCompareEnabled}
      />

      {/* Hidden: TotalRevenueBanner fetches real API data */}
      <div className="hidden">
        <TotalRevenueBanner
          period={revenuePeriod}
          onPeriodChange={(p) => setRevenuePeriod(p as typeof revenuePeriod)}
          onDataChange={handleRevenueData}
        />
      </div>

      <AnimatedContainer className="space-y-5">
        {/* ══════════ ROW 1: 4 KPI Cards ══════════ */}
        <AnimatedItem>
          <KpiCardRow columns={4}>
            <KpiCard
              label="Receita Total"
              value={fmtCompact(totalRevenue)}
              loading={isLoading}
              tooltip="Faturamento total de todas as lojas no período selecionado, obtido via Klaviyo (Placed Order)."
            />
            <KpiCard
              label="Receita Campanhas"
              value={fmtCompact(campaignRevenue)}
              loading={isLoading}
              tooltip="Receita atribuída a campanhas de email e SMS enviadas pela Convertfy no período."
            />
            <KpiCard
              label="Receita Automações"
              value={fmtCompact(flowRevenue)}
              loading={isLoading}
              tooltip="Receita gerada por flows automáticos (carrinho abandonado, welcome, win-back, etc.) no período."
            />
            <KpiCard
              label="Taxa média da Convertfy"
              value={`${convertfyRate.toFixed(1)}%`}
              variant="gradient"
              loading={isLoading}
              tooltip="Percentual médio da receita total que é atribuída às ações da Convertfy (campanhas + automações) entre todas as lojas."
            />
          </KpiCardRow>
        </AnimatedItem>

        {/* ══════════ ROW 2: Charts ══════════ */}
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

        {/* ══════════ ROW 3: Email Perf + Client Health ══════════ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <Suspense fallback={<CardSkeleton />}>
              <DashboardEmailPerf loading={isLoading} />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <DashboardClientHealth
                loading={isLoading}
                storeBreakdown={clientStoreData}
              />
            </Suspense>
          </div>
        </AnimatedItem>

        {/* ══════════ ROW 4: Flow Performance ══════════ */}
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

        {/* ══════════ ROW 5: Onboarding + Alerts ══════════ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Suspense fallback={<CardSkeleton />}>
              <DashboardOnboarding
                loading={isLoading}
                onboardings={onboardingData}
              />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <DashboardAlerts
                loading={isLoading}
                alerts={alertsData}
              />
            </Suspense>
          </div>
        </AnimatedItem>

        {/* ══════════ ROW 6: Clients by Revenue ══════════ */}
        <AnimatedItem>
          <Suspense fallback={<CardSkeleton />}>
            <DashboardClientsRevenue
              loading={isLoading}
              storeBreakdown={clientStoreData}
            />
          </Suspense>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
