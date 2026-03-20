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
import { OnboardingDashboard } from "./onboarding-dashboard"
import { AudienceMetrics } from "../analytics/audience-metrics"
import { ListHealthMetrics } from "../analytics/list-health-metrics"
import { EmailPerformance } from "./email-performance"
import { ThreeColumns } from "./three-columns"
import { RevenueChannels } from "./revenue-channels"
import { ConversionsSection } from "./conversions-section"
import { RankingsSection } from "./rankings-section"
import { FooterStats } from "./footer-stats"
import type { DashboardData } from "./types"

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const abortRef = useRef<AbortController | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [portalUserName, setPortalUserName] = useState("")

  // Check onboarding status first
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/portal/onboarding")
        if (res.ok) {
          const json = await res.json()
          setOnboardingStatus(json.onboarding?.status || null)
        }
        // Get portal user name
        try {
          const stored = localStorage.getItem("portal_user")
          if (stored) {
            const parsed = JSON.parse(stored)
            setPortalUserName(parsed.name?.split(" ")[0] || "")
          }
        } catch { /* ignore */ }
      } catch {
        setOnboardingStatus(null)
      } finally {
        setOnboardingChecked(true)
      }
    }
    checkOnboarding()
  }, [])

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

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Gate: show onboarding dashboard if onboarding is active
  if (onboardingChecked && onboardingStatus && onboardingStatus !== "completed") {
    return <OnboardingDashboard firstName={portalUserName} />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-36 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl border border-border" />
          ))}
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
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StaleBadge period={period} lastFetchedAt={data?.lastFetchedAt} />

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

      {/* Data status banner (no refresh button for portal) */}
      <DataStatusBanner
        status={data.dataStatus}
        lastFetchedAt={data.lastFetchedAt}
        isRefreshing={realtimeRefreshing || data.isRefreshing || refreshing}
      />

      <AnimatedContainer className="space-y-6">
        {/* Hero: Financial Summary */}
        <AnimatedItem>
          {klaviyoLoading ? (
            <Skeleton className="h-48 rounded-2xl" />
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

        {/* Operational Cards - 2x3 grid */}
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
              <Link href="/client/invoices" className="block">
                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
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
              </Link>
            )}
          </div>
        </AnimatedItem>

        {/* KPI Cards */}
        <AnimatedItem>
          {klaviyoLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl border border-border" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard label="Pedidos" value={formatNumber(storeOrders)} icon={ShoppingCart} iconColor="text-blue-600" iconBg="bg-blue-50 dark:bg-blue-500/10" variation={ordersVariation} />
              <KpiCard label="Ticket Médio" value={formatCurrency(ticketMedio)} icon={Receipt} iconColor="text-emerald-600" iconBg="bg-emerald-50 dark:bg-emerald-500/10" variation={ticketVariation} />
              <KpiCard label="Recuperação de Carrinho" value={formatPercent(recoveryRate)} icon={ShoppingBag} iconColor="text-amber-600" iconBg="bg-amber-50 dark:bg-amber-500/10" variation={recoveryVariation} />
              <KpiCard label="Receita por Lead" value={formatCurrency(receitaPorLead)} icon={Users} iconColor="text-violet-600" iconBg="bg-violet-50 dark:bg-violet-500/10" />
              <KpiCard label="Flows Ativos" value={`${klaviyo?.activeFlows || 0} / ${klaviyo?.flowsCount || 0}`} icon={Zap} iconColor="text-cyan-600" iconBg="bg-cyan-50 dark:bg-cyan-500/10" href="/client/flows" />
            </div>
          )}
        </AnimatedItem>

        {/* Análise Detalhada - Collapsible */}
        <AnimatedItem>
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Análise Detalhada</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">Audiência, E-mail, Receita e mais</span>
            </div>
            <ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showAnalytics ? "rotate-180" : ""}`} />
          </button>
        </AnimatedItem>

        {showAnalytics && (
          <>
            {/* Audience & List Health */}
            <AnimatedItem>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
  iconColor,
  iconBg,
  variation,
  href,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
  iconBg: string
  variation?: number
  href?: string
}) {
  const content = (
    <div className={`bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200 ${href ? "cursor-pointer hover:border-primary/30 dark:hover:border-primary/30" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        {variation !== undefined && Math.abs(variation) >= 0.1 && (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            variation >= 0
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
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
