"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateRange } from "@/lib/utils/format"
import { HeroSection } from "./hero-section"
import { OnboardingCard } from "./onboarding-card"
import { RevenueChart } from "./revenue-chart"
import { MetricsSidebar } from "./metrics-sidebar"
import { EmailPerformance } from "./email-performance"
import { StatsCards, RevenueDonutChart, FlowPerformanceBars } from "./stats-cards"
import { NextCampaignsCard } from "./next-campaigns-card"
import { NextMeetingCard } from "./next-meeting-card"
import { ListHealthCard } from "./list-health-card"
import { TopFlowCard } from "./top-flow-card"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { DataStatusBanner } from "@/components/ui/data-status-banner"
import { useRealtimeRevenue } from "@/hooks/use-realtime-revenue"
import type { DashboardData } from "./types"

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const abortRef = useRef<AbortController | null>(null)

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
      const params = new URLSearchParams({
        period,
        ...(storeId && { store_id: storeId }),
      })

      const response = await fetch(`/api/portal/dashboard?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error("Erro ao carregar dados")
      }
      const result = await response.json()
      setData(prev => {
        if (!result.klaviyo && prev?.klaviyo) {
          return { ...result, klaviyo: prev.klaviyo }
        }
        return result
      })
      setError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("Dashboard fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  const handleRealtimeUpdate = useCallback(() => { fetchDashboard() }, [fetchDashboard])
  const { isRefreshing: realtimeRefreshing, triggerRefresh } = useRealtimeRevenue({
    period,
    onDataUpdate: handleRealtimeUpdate,
    refreshUrl: "/api/portal/dashboard/refresh",
  })

  const hasTriggeredAutoRefresh = useRef(false)
  useEffect(() => {
    const isStale = data?.dataStatus === "stale" || data?.source === "stale-cache"
    if (isStale && !refreshing && !realtimeRefreshing && !hasTriggeredAutoRefresh.current) {
      hasTriggeredAutoRefresh.current = true
      triggerRefresh()
    }
    if (data?.dataStatus === "ready") {
      hasTriggeredAutoRefresh.current = false
    }
  }, [data, refreshing, realtimeRefreshing, triggerRefresh])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button
            onClick={() => fetchDashboard()}
            className="bg-primary hover:bg-primary/85 text-white shadow-sm"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo

  return (
    <div className="max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Início</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {formatDateRange(data.dateRange.start, data.dateRange.end)}
              </p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm dark:shadow-slate-900/20">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 shadow-lg">
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              triggerRefresh()
              fetchDashboard(true)
            }}
            disabled={refreshing || realtimeRefreshing}
            className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm dark:shadow-slate-900/20"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing || realtimeRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Data status banner */}
      <DataStatusBanner
        status={data.dataStatus}
        lastFetchedAt={data.lastFetchedAt}
        isRefreshing={realtimeRefreshing || data.isRefreshing || refreshing}
      />

      <AnimatedContainer className="space-y-6">
        {/* Onboarding Card (conditional) */}
        <AnimatedItem>
          <OnboardingCard />
        </AnimatedItem>

        {/* Hero Section - Main KPIs */}
        <AnimatedItem>
          <HeroSection klaviyo={klaviyo} />
        </AnimatedItem>

        {/* Main Content Grid - Two Columns Layout */}
        <AnimatedItem>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
            {/* Main Column */}
            <div className="space-y-6">
              {/* Revenue Chart */}
              <RevenueChart title="Receita no Período" />

              {/* Stats Row */}
              <StatsCards klaviyo={klaviyo} shopify={data.shopify} />

              {/* Email Performance + Donut Chart Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EmailPerformance klaviyo={klaviyo} />
                <RevenueDonutChart klaviyo={klaviyo} />
              </div>

              {/* Flow Performance */}
              <FlowPerformanceBars flows={klaviyo?.topFlows} />

              {/* Operational Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <NextCampaignsCard
                  campaigns={klaviyo?.recentCampaigns}
                  upcomingCampaigns={data.upcomingCampaigns}
                />
                <NextMeetingCard meetings={data.meetings} />
                <ListHealthCard
                  bounceRate={klaviyo?.bounceRate || 0}
                  unsubscribeRate={klaviyo?.unsubscribeRate || 0}
                />
              </div>
            </div>

            {/* Sidebar Column - Quick Metrics */}
            <div className="space-y-4">
              <div className="sticky top-20">
                <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                  Métricas Rápidas
                </h3>
                <MetricsSidebar klaviyo={klaviyo} shopify={data.shopify} />

                {/* Top Flow Card */}
                <div className="mt-4">
                  <TopFlowCard flows={klaviyo?.topFlows} />
                </div>
              </div>
            </div>
          </div>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="max-w-[1800px] mx-auto space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-48 bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <Skeleton className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>

      {/* Hero KPI Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
        ))}
      </div>

      {/* Breakdown Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <Skeleton className="h-64 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-72 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
            <Skeleton className="h-72 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-20 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
