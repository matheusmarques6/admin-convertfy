"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  DollarSign,
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
import { formatCurrency, formatDateRange } from "@/lib/utils/format"
import { HeroSection } from "./hero-section"
import { OnboardingCard } from "./onboarding-card"
import { NextCampaignsCard } from "./next-campaigns-card"
import { NextMeetingCard } from "./next-meeting-card"
import { ListHealthCard } from "./list-health-card"
import { LastSendCard } from "./last-send-card"
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
      setError("Nao foi possivel carregar os dados. Tente novamente.")
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
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-36 bg-slate-200 dark:bg-slate-700 mb-2" />
            <Skeleton className="h-4 w-48 bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            <Skeleton className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-56 bg-gradient-to-r from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
            ))}
          </div>
        </div>
      </div>
    )
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
            className="bg-gradient-to-r from-[#4e62d8] to-[#2137b6] hover:opacity-90 text-white shadow-lg shadow-[#4e62d8]/20"
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
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4e62d8]/10 text-[#4e62d8] text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-xl shadow-sm dark:shadow-slate-900/20">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 shadow-lg rounded-xl">
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
            className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-xl shadow-sm dark:shadow-slate-900/20"
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
        {/* Hero: Financial Summary */}
        <AnimatedItem>
          <HeroSection klaviyo={klaviyo} />
        </AnimatedItem>

        {/* Onboarding Card (conditional) */}
        <AnimatedItem>
          <OnboardingCard />
        </AnimatedItem>

        {/* Operational Cards Grid */}
        <AnimatedItem>
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
            <LastSendCard campaigns={klaviyo?.recentCampaigns} />
            <TopFlowCard flows={klaviyo?.topFlows} />

            {/* Invoices quick card */}
            {(data.invoices.pending > 0 || data.invoices.overdue > 0) && (
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-amber-600" />
                  </div>
                  <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Faturas</span>
                </div>
                {data.invoices.overdue > 0 && (
                  <div className="mb-3">
                    <p className="text-lg font-bold text-red-600">{formatCurrency(data.invoices.totalOverdue)}</p>
                    <p className="text-xs text-red-500">{data.invoices.overdue} fatura(s) em atraso</p>
                  </div>
                )}
                {data.invoices.pending > 0 && (
                  <div>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(data.invoices.totalPending)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{data.invoices.pending} fatura(s) pendente(s)</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
