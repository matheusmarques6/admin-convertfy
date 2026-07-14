"use client"

import { useState, useCallback, useRef, useMemo, lazy, Suspense } from "react"
import useSWR from "swr"
import { DashboardTopBar } from "./dashboard-top-bar"
import type { DateRange } from "./date-range-panel"
import { TotalRevenueBanner, type TotalRevenueData } from "./total-revenue-banner"
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
const DashboardOperacionalSection = lazy(() =>
  import("./dashboard-operacional-section").then((m) => ({ default: m.DashboardOperacionalSection }))
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
  /**
   * Quando true, renderiza a section de Customer Success / carteira logo
   * apos os KPIs de receita. Usado na dashboard do workspace operacional.
   */
  showOperacionalSection?: boolean
}

// ─── Fallback sparklines (used when historical data is not yet available) ──
// NOTA: desabilitado. Aguardando endpoint de serie temporal para cada KPI.
// Ate la, o sparkline nao e renderizado (KpiCard trata sparkData undefined).
const _FALLBACK_SPARKLINES = {
  revenue: [95, 110, 125, 140, 155, 170, 190, 210, 240, 265, 290, 320],
  campaigns: [60, 65, 72, 80, 88, 95, 102, 110, 115, 120, 125, 128],
  automations: [92, 95, 98, 100, 102, 99, 97, 100, 103, 101, 102, 102],
  rate: [18, 17, 19, 18, 20, 19, 20, 21, 20, 21, 22, 21],
}

// ─── Chart Skeleton ──────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6 animate-pulse">
      <Skeleton className="h-4 w-40 mb-2" />
      <Skeleton className="h-3 w-56 mb-6" />
      <Skeleton className="h-[240px] w-full rounded-[4px]" />
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-6 animate-pulse">
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

export function DashboardLayout({
  data,
  userRole: _userRole,
  userName,
  showOperacionalSection = false,
}: DashboardLayoutProps) {
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

  // ─── KPI sparklines + deltas (real data from store_revenue_summary) ──
  const fetcher = (url: string) => fetch(url).then((r) => r.json())
  const { data: kpiSeries } = useSWR(
    `/api/dashboard/kpi-series?period=${revenuePeriod}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const sparklines = kpiSeries?.sparklines
  const deltas = kpiSeries?.deltas

  // ─── Flow performance agregado (real data from klaviyo_flow_metrics) ──
  const { data: flowsAgg } = useSWR(
    `/api/dashboard/flows-aggregate?period=${revenuePeriod}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const flowCards = flowsAgg?.flows ?? undefined

  // ─── Stores overview (receita + engajamento + health score reais por loja) ──
  // Alimenta "Saúde das Lojas" e "Clientes por Receita" com dados reais
  // (open/click rate, health score, % recuperação) em vez de placeholders.
  const { data: storesOverview } = useSWR(
    `/api/dashboard/stores-overview?period=${revenuePeriod}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const storeOverviewItems = storesOverview?.stores ?? []

  // ─── Computed KPI values from REAL data ─────────────────

  const totalRevenue = revenueData?.totalRevenue ?? 0
  const campaignRevenue = revenueData?.campaignRevenue ?? 0
  const flowRevenue = revenueData?.flowRevenue ?? 0
  // Receita atribuida agregada = somatorio (campanhas + automacoes) de
  // todas as lojas, ja convertida em BRL pelo endpoint. Usado como
  // primeiro card no workspace OPERACIONAL (CS olha o que a Convertfy
  // gerou, nao o faturamento bruto da loja).
  const attributedRevenue = campaignRevenue + flowRevenue

  // Taxa Convertfy = razão de somas (Σatribuído / Σfaturamento bruto)
  // restrita a lojas com faturamento bruto real. É a MESMA definição do
  // /api/dashboard/kpi-series (rate); este cálculo local serve apenas de
  // fallback enquanto o SWR do kpi-series carrega, para não piscar valor
  // divergente. Lojas email-only (sem Shopify) caem no fallback do backend
  // onde totalRevenue===attributedRevenue — excluídas para não gerar 100%
  // espúrio.
  const storeBreakdown = useMemo(
    () => revenueData?.storeBreakdown ?? [],
    [revenueData?.storeBreakdown],
  )
  const convertfyRate = useMemo(() => {
    type SB = typeof storeBreakdown[number] & {
      totalRevenue?: number
      attributedRevenue?: number
      attributedRevenueBRL?: number
    }
    let num = 0
    let den = 0
    for (const s of storeBreakdown as SB[]) {
      const hasStoreRevenue =
        Number(s.totalRevenue) > 0 &&
        Number(s.totalRevenue) !== Number(s.attributedRevenue)
      if (!hasStoreRevenue) continue
      const attributed = Number(s.attributedRevenueBRL)
        || ((Number(s.campaignRevenueBRL) || 0) + (Number(s.flowRevenueBRL) || 0))
      num += attributed
      den += Number(s.totalRevenueBRL) || 0
    }
    return den > 0 ? Math.min(100, (num / den) * 100) : 0
  }, [storeBreakdown])

  // Format compact currency
  const fmtCompact = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
    return formatCurrency(v)
  }

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
              label={showOperacionalSection ? "Receita Atribuída" : "Receita Total"}
              value={fmtCompact(showOperacionalSection ? attributedRevenue : totalRevenue)}
              delta={showOperacionalSection ? deltas?.total : deltas?.storeTotal}
              sparkData={showOperacionalSection ? sparklines?.total : sparklines?.storeTotal}
              loading={isLoading}
              tooltip={
                showOperacionalSection
                  ? "Receita atribuída agregada (campanhas + automações) de todas as lojas no período. Já convertida para BRL com taxa de câmbio atual."
                  : "Faturamento total de todas as lojas no período selecionado, obtido via Klaviyo (Placed Order)."
              }
            />
            <KpiCard
              label="Receita Campanhas"
              value={fmtCompact(campaignRevenue)}
              delta={deltas?.campaign}
              sparkData={sparklines?.campaign}
              loading={isLoading}
              tooltip="Receita atribuída a campanhas de email e SMS enviadas pela Convertfy no período."
            />
            <KpiCard
              label="Receita Automações"
              value={fmtCompact(flowRevenue)}
              delta={deltas?.flow}
              sparkData={sparklines?.flow}
              loading={isLoading}
              tooltip="Receita gerada por flows automáticos (carrinho abandonado, welcome, win-back, etc.) no período."
            />
            <KpiCard
              label="Taxa média da Convertfy"
              value={`${(typeof kpiSeries?.rate === "number" ? kpiSeries.rate : convertfyRate).toFixed(1)}%`}
              delta={deltas?.rate}
              sparkData={sparklines?.rate}
              variant="gradient"
              loading={isLoading}
              tooltip="Receita atribuída à Convertfy (campanhas + automações) sobre o faturamento bruto das lojas com Shopify conectado. Número, sparkline e delta usam a mesma razão de somas."
            />
          </KpiCardRow>
        </AnimatedItem>

        {/* ══════════ Operacional / CS section (apenas dashboard operacional) ══════════ */}
        {showOperacionalSection && (
          <Suspense
            fallback={
              <div className="space-y-5">
                <CardSkeleton />
                <ChartSkeleton />
              </div>
            }
          >
            <DashboardOperacionalSection />
          </Suspense>
        )}

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
              <DashboardEmailPerf loading={isLoading} period={revenuePeriod} />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <DashboardClientHealth
                loading={isLoading}
                stores={storeOverviewItems}
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
            <DashboardFlowPerf loading={isLoading} flows={flowCards} />
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
              stores={storeOverviewItems}
            />
          </Suspense>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
