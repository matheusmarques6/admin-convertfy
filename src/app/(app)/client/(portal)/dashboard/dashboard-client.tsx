"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  ShoppingCart,
  Receipt,
  Zap,
  DollarSign,
  Users,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  ChevronDown as ChevronDownIcon,
  PieChart,
  ChevronRight,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatNumber, formatPercent, formatDateRange } from "@/lib/utils/format"
import { HeroSection } from "./hero-section"
import { OnboardingCard } from "./onboarding-card"
import { NextCampaignsCard } from "./next-campaigns-card"
import { NextMeetingCard } from "./next-meeting-card"
import { ListHealthCard } from "./list-health-card"
import { LastSendCard } from "./last-send-card"
import { TopFlowCard } from "./top-flow-card"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { DataStatusBanner } from "@/components/ui/data-status-banner"
import { SettlingIndicator } from "@/components/portal/settling-indicator"
import { StaleBadge } from "@/components/portal/stale-badge"
import { useRealtimeRevenue } from "@/hooks/use-realtime-revenue"
import { AudienceMetrics } from "../analytics/audience-metrics"
import { ListHealthMetrics } from "../analytics/list-health-metrics"
import { EmailPerformance } from "./email-performance"
import { ThreeColumns } from "./three-columns"
import { RevenueChannels } from "./revenue-channels"
import { ConversionsSection } from "./conversions-section"
import { RankingsSection } from "./rankings-section"
import { FooterStats } from "./footer-stats"
import type { DashboardData } from "./types"

interface DashboardClientProps {
  initialData: DashboardData | null
  initialStoreId: string | null
}

export function DashboardClient({ initialData, initialStoreId }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData | null>(initialData)
  const [loading, setLoading] = useState(!initialData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const abortRef = useRef<AbortController | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    // Cancel any in-flight request so stale responses don't overwrite newer ones
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
        const merged = { ...result }
        const samePeriod = prev?.period === result.period
        // Preserve previous Klaviyo data only if same period and cache still loading
        if (!result.klaviyo && prev?.klaviyo && samePeriod) {
          merged.klaviyo = prev.klaviyo
        }
        // Story 54.5: Preserve previous Shopify data only if same period and background sync is in progress
        if (result.shopifyStatus === "syncing" && prev?.shopify && samePeriod) {
          merged.shopify = prev.shopify
          merged.shopifyStatus = "syncing" // keep syncing indicator visible
        }
        return merged
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

  // Realtime: auto-update when store_revenue_summary changes
  const handleRealtimeUpdate = useCallback(() => { fetchDashboard() }, [fetchDashboard])
  const { isRefreshing: realtimeRefreshing, triggerRefresh } = useRealtimeRevenue({
    period,
    onDataUpdate: handleRealtimeUpdate,
    refreshUrl: "/api/portal/dashboard/refresh",
  })

  // Auto-trigger background refresh when data is stale (>5 min)
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

  // Story 54.5: Auto-retry when Shopify background sync is in progress
  useEffect(() => {
    if (data?.shopifyStatus === "syncing" && !loading && !refreshing) {
      const timer = setTimeout(() => fetchDashboard(), 5000)
      return () => clearTimeout(timer)
    }
  }, [data?.shopifyStatus, loading, refreshing, fetchDashboard])

  // O servidor já entregou os dados iniciais; só refaz o fetch no mount se a
  // loja ativa do localStorage divergir do cookie usado pelo servidor.
  const skipInitialFetch = useRef(!!initialData)
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      let storedStoreId: string | null = null
      try { storedStoreId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
      if ((storedStoreId || null) === (initialStoreId || null)) return
    }
    fetchDashboard()
  }, [fetchDashboard, initialStoreId])

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded-lg" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-[8px]" />
            <Skeleton className="h-10 w-10 rounded-[8px]" />
          </div>
        </div>
        <Skeleton className="h-52 rounded-[8px]" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[8px]" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[8px]" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="rounded-[8px] border border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-900/50 p-10 text-center max-w-md ">
          <div className="w-14 h-14 rounded-[8px] bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button
            onClick={() => fetchDashboard()}
            className="rounded-[8px]"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const prev = data.previousPeriod
  // Show skeleton when klaviyo data is absent (e.g. period changed, cache not ready)
  const klaviyoLoading = !klaviyo
  const storeRevenue = klaviyo?.storeRevenue || 0
  const storeOrders = klaviyo?.storeOrders || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const ticketMedio = storeOrders > 0 ? storeRevenue / storeOrders : 0
  const receitaPorLead = klaviyo?.engagedLeads ? totalRevenue / klaviyo.engagedLeads : 0
  const recoveryRate = klaviyo?.recoveryRate || 0

  // Compute variation percentages vs previous period
  const calcVariation = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return undefined
    return ((current - previous) / previous) * 100
  }
  const ordersVariation = prev ? calcVariation(storeOrders, prev.storeOrders) : undefined
  const prevTicket = prev && prev.storeOrders > 0 ? prev.storeRevenue / prev.storeOrders : undefined
  const ticketVariation = prevTicket ? calcVariation(ticketMedio, prevTicket) : undefined
  const prevRecovery = prev && prev.storeRevenue > 0 ? (prev.totalRevenue / prev.storeRevenue) * 100 : undefined
  const recoveryVariation = prevRecovery ? calcVariation(recoveryRate, prevRecovery) : undefined

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <StaleBadge period={period} lastFetchedAt={data?.lastFetchedAt} />

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-10 rounded-[8px] border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 ">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-400 dark:text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-[8px]">
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              triggerRefresh()
              fetchDashboard(true)
            }}
            disabled={refreshing || realtimeRefreshing}
            className="h-10 w-10 rounded-[8px] border-slate-200 dark:border-slate-700/40 bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shadow-sm"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing || realtimeRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Data status banner (no refresh button for portal) */}
      <DataStatusBanner
        status={data.dataStatus}
        lastFetchedAt={data.lastFetchedAt}
        isRefreshing={realtimeRefreshing || data.isRefreshing || refreshing}
      />

      <AnimatedContainer className="space-y-6">
        {/* === SECTION 1: Revenue (Hero) === */}
        <AnimatedItem>
          {klaviyoLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 rounded-[8px]" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-[8px]" />)}
              </div>
            </div>
          ) : (
            <>
              <HeroSection klaviyo={klaviyo} previousPeriod={data.previousPeriod} />
              <SettlingIndicator period={period} />
            </>
          )}
        </AnimatedItem>

        {/* Onboarding Card (conditional) */}
        <AnimatedItem>
          <OnboardingCard />
        </AnimatedItem>

        {/* === SECTION 2: Key Performance Indicators === */}
        <AnimatedItem>
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-0.5">
              Indicadores-chave
            </h3>
            {klaviyoLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-[88px] rounded-[8px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard label="Pedidos" value={formatNumber(storeOrders)} icon={ShoppingCart} accentClass="text-blue-600 dark:text-blue-400" bgClass="bg-blue-50 dark:bg-blue-500/10" variation={ordersVariation} />
                <KpiCard label="Ticket Médio" value={formatCurrency(ticketMedio)} icon={Receipt} accentClass="text-emerald-600 dark:text-emerald-400" bgClass="bg-emerald-50 dark:bg-emerald-500/10" variation={ticketVariation} />
                <KpiCard label="Recuperação" value={formatPercent(recoveryRate)} icon={ShoppingBag} accentClass="text-amber-600 dark:text-amber-400" bgClass="bg-amber-50 dark:bg-amber-500/10" variation={recoveryVariation} />
                <KpiCard label="Receita/Lead" value={formatCurrency(receitaPorLead)} icon={Users} accentClass="text-violet-600 dark:text-violet-400" bgClass="bg-violet-50 dark:bg-violet-500/10" />
                <KpiCard label="Flows Ativos" value={`${klaviyo?.activeFlows || 0} / ${klaviyo?.flowsCount || 0}`} icon={Zap} accentClass="text-cyan-600 dark:text-cyan-400" bgClass="bg-cyan-50 dark:bg-cyan-500/10" href="/client/flows" />
              </div>
            )}
          </div>
        </AnimatedItem>

        {/* === SECTION 3: Operational Overview === */}
        <AnimatedItem>
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-0.5">
              Visão operacional
            </h3>
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
                <Link href="/client/invoices" className="block group">
                  <div className="h-full rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-800/40 p-5 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Faturas</span>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {data.invoices.overdue > 0 && (
                      <div className="mb-3">
                        <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(data.invoices.totalOverdue)}</p>
                        <p className="text-xs text-red-500 dark:text-red-400/70">{data.invoices.overdue} fatura(s) em atraso</p>
                      </div>
                    )}
                    {data.invoices.pending > 0 && (
                      <div>
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatCurrency(data.invoices.totalPending)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{data.invoices.pending} fatura(s) pendente(s)</p>
                      </div>
                    )}
                  </div>
                </Link>
              )}
            </div>
          </div>
        </AnimatedItem>

        {/* === SECTION 4: Detailed Analytics (Collapsible) === */}
        <AnimatedItem>
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="w-full flex items-center justify-between p-4 rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-800/40 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <PieChart className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Análise Detalhada</span>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Audiência, E-mail, Receita e mais</p>
              </div>
            </div>
            <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${showAnalytics ? "rotate-180" : ""}`} />
          </button>
        </AnimatedItem>

        {showAnalytics && (
          <>
            {/* Audience & List Health */}
            <AnimatedItem>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AudienceMetrics klaviyo={klaviyo} shopify={data.shopify} />
                <ListHealthMetrics klaviyo={klaviyo} />
              </div>
            </AnimatedItem>

            {/* Email Performance */}
            <AnimatedItem>
              <EmailPerformance klaviyo={klaviyo} />
            </AnimatedItem>

            {/* Top Flows & Campaigns */}
            <AnimatedItem>
              <ThreeColumns klaviyo={klaviyo} />
            </AnimatedItem>

            {/* Revenue Channels */}
            <AnimatedItem>
              <RevenueChannels klaviyo={klaviyo} />
            </AnimatedItem>

            {/* Conversions */}
            <AnimatedItem>
              <ConversionsSection shopify={data.shopify} />
            </AnimatedItem>

            {/* Rankings */}
            <AnimatedItem>
              <RankingsSection shopify={data.shopify} />
            </AnimatedItem>

            {/* Footer */}
            <AnimatedItem>
              <FooterStats klaviyo={klaviyo} shopify={data.shopify} lastUpdated={data.lastUpdated} />
            </AnimatedItem>
          </>
        )}
      </AnimatedContainer>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accentClass,
  bgClass,
  variation,
  href,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  accentClass: string
  bgClass: string
  variation?: number
  href?: string
}) {
  const content = (
    <div className={`group rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-800/40 p-4 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${bgClass} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${accentClass}`} />
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
        {variation !== undefined && Math.abs(variation) >= 0.1 && (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
            variation >= 0
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
          }`}>
            {variation >= 0 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {variation >= 0 ? "+" : ""}{variation.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}
