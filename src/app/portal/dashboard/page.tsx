"use client"

import { useState, useEffect, useCallback } from "react"
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
import type { DashboardData } from "./types"

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
      const params = new URLSearchParams({
        period,
        ...(storeId && { store_id: storeId }),
      })

      const response = await fetch(`/api/portal/dashboard?${params}`)
      if (!response.ok) {
        throw new Error("Erro ao carregar dados")
      }
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

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
            <Skeleton className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <Skeleton className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-48 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-36 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
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
            className="bg-[#5327F2] hover:bg-[#4520D4] text-white shadow-sm"
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
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5327F2]/10 text-[#5327F2] text-xs font-medium">
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
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm dark:shadow-slate-900/20"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <AnimatedContainer className="space-y-6">
        {/* Hero: Financial Summary */}
        <AnimatedItem>
          <HeroSection klaviyo={klaviyo} />
        </AnimatedItem>

        {/* Onboarding Card (conditional) */}
        <AnimatedItem>
          <OnboardingCard />
        </AnimatedItem>

        {/* Operational Cards - 2x3 grid */}
        <AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NextCampaignsCard campaigns={klaviyo?.recentCampaigns} />
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

        {/* KPI Cards */}
        <AnimatedItem>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Pedidos" value={formatNumber(storeOrders)} icon={ShoppingCart} iconColor="text-blue-600" iconBg="bg-blue-50 dark:bg-blue-500/10" />
            <KpiCard label="Ticket Médio" value={formatCurrency(ticketMedio)} icon={Receipt} iconColor="text-emerald-600" iconBg="bg-emerald-50 dark:bg-emerald-500/10" />
            <KpiCard label="Recuperação de Carrinho" value={formatPercent(recoveryRate)} icon={ShoppingBag} iconColor="text-amber-600" iconBg="bg-amber-50 dark:bg-amber-500/10" />
            <KpiCard label="Receita por Lead" value={formatCurrency(receitaPorLead)} icon={Users} iconColor="text-violet-600" iconBg="bg-violet-50 dark:bg-violet-500/10" />
            <KpiCard label="Flows Ativos" value={`${klaviyo?.activeFlows || 0} / ${klaviyo?.flowsCount || 0}`} icon={Zap} iconColor="text-cyan-600" iconBg="bg-cyan-50 dark:bg-cyan-500/10" />
          </div>
        </AnimatedItem>
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
}: {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
  iconBg: string
}) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}
