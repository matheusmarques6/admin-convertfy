"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  ArrowUpRight,
  ArrowDownRight,
  Mail,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useRealtimeRevenue } from "@/hooks/use-realtime-revenue"
import type { DashboardData } from "./types"
import { cn } from "@/lib/utils"

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const abortRef = useRef<AbortController | null>(null)

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

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-10 text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Erro ao carregar</h2>
          <p className="text-zinc-400 text-sm mb-6">{error}</p>
          <Button
            onClick={() => fetchDashboard()}
            className="bg-[#05AFF2] hover:bg-[#05AFF2]/90 text-white"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const storeRevenue = klaviyo?.storeRevenue || 0
  const storeOrders = klaviyo?.storeOrders || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const ticketMedio = storeOrders > 0 ? storeRevenue / storeOrders : 0
  const receitaPorLead = klaviyo?.engagedLeads ? totalRevenue / klaviyo.engagedLeads : 0
  const recoveryRate = klaviyo?.recoveryRate || 0

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#05AFF2]/10 text-[#05AFF2] text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando
              </span>
            )}
          </div>
          {data.dateRange && (
            <p className="text-sm text-zinc-500 mt-1">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-10 bg-zinc-900 border-zinc-800 text-zinc-200 rounded-lg">
              <CalendarDays className="h-4 w-4 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
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
            className="h-10 w-10 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg"
            title="Atualizar dados"
          >
            <RefreshCw className={cn("h-4 w-4", (refreshing || realtimeRefreshing) && "animate-spin")} />
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

        {/* KPI Cards - First Row */}
        <AnimatedItem>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Pedidos"
              value={formatNumber(storeOrders)}
              icon={ShoppingCart}
              trend={8.5}
              accentColor="from-blue-500 to-cyan-500"
            />
            <MetricCard
              label="Ticket Médio"
              value={formatCurrency(ticketMedio)}
              icon={Receipt}
              trend={3.2}
              accentColor="from-emerald-500 to-teal-500"
            />
            <MetricCard
              label="Recuperação"
              value={formatPercent(recoveryRate)}
              icon={ShoppingBag}
              trend={-2.1}
              accentColor="from-amber-500 to-orange-500"
            />
            <MetricCard
              label="Receita/Lead"
              value={formatCurrency(receitaPorLead)}
              icon={Users}
              trend={5.7}
              accentColor="from-violet-500 to-purple-500"
            />
          </div>
        </AnimatedItem>

        {/* Operational Cards - 3 columns */}
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
          </div>
        </AnimatedItem>

        {/* Second Row of Cards */}
        <AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <LastSendCard campaigns={klaviyo?.recentCampaigns} />
            <TopFlowCard flows={klaviyo?.topFlows} />

            {/* Flows Active Card */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Flows Ativos</h3>
                  <p className="text-xs text-zinc-500">Automações em execução</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-zinc-100">{klaviyo?.activeFlows || 0}</span>
                <span className="text-zinc-500 text-sm">/ {klaviyo?.flowsCount || 0} total</span>
              </div>
              <div className="mt-4 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${klaviyo?.flowsCount ? ((klaviyo?.activeFlows || 0) / klaviyo.flowsCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </AnimatedItem>

        {/* Invoices Card (if applicable) */}
        {(data.invoices.pending > 0 || data.invoices.overdue > 0) && (
          <AnimatedItem>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Faturas</h3>
                  <p className="text-xs text-zinc-500">Resumo financeiro</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {data.invoices.overdue > 0 && (
                  <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                    <p className="text-2xl font-bold text-red-400">{formatCurrency(data.invoices.totalOverdue)}</p>
                    <p className="text-xs text-red-400/80 mt-1">{data.invoices.overdue} fatura(s) em atraso</p>
                  </div>
                )}
                {data.invoices.pending > 0 && (
                  <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                    <p className="text-2xl font-bold text-zinc-100">{formatCurrency(data.invoices.totalPending)}</p>
                    <p className="text-xs text-zinc-500 mt-1">{data.invoices.pending} fatura(s) pendente(s)</p>
                  </div>
                )}
              </div>
            </div>
          </AnimatedItem>
        )}
      </AnimatedContainer>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  accentColor,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  trend?: number
  accentColor: string
}) {
  const isPositive = trend && trend > 0
  const isNegative = trend && trend < 0

  return (
    <div className="group relative bg-zinc-900 rounded-xl border border-zinc-800 p-5 hover:border-zinc-700 transition-all duration-300 overflow-hidden">
      {/* Gradient accent */}
      <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity", accentColor)} />
      
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center", accentColor.replace("from-", "from-").replace("to-", "to-") + "/20")}>
          <Icon className={cn("h-5 w-5", accentColor.includes("blue") ? "text-blue-400" : accentColor.includes("emerald") ? "text-emerald-400" : accentColor.includes("amber") ? "text-amber-400" : "text-violet-400")} />
        </div>
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
            isPositive && "bg-emerald-500/10 text-emerald-400",
            isNegative && "bg-red-500/10 text-red-400",
            !isPositive && !isNegative && "bg-zinc-800 text-zinc-400"
          )}>
            {isPositive && <ArrowUpRight className="h-3 w-3" />}
            {isNegative && <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-zinc-100 mb-1">{value}</p>
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-36 bg-zinc-800 rounded-lg mb-2" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-zinc-800 rounded-lg" />
          <div className="h-10 w-10 bg-zinc-800 rounded-lg" />
        </div>
      </div>

      {/* Hero */}
      <div className="h-[200px] bg-zinc-900 rounded-2xl border border-zinc-800" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[130px] bg-zinc-900 rounded-xl border border-zinc-800" />
        ))}
      </div>

      {/* Operational Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[200px] bg-zinc-900 rounded-xl border border-zinc-800" />
        ))}
      </div>
    </div>
  )
}
