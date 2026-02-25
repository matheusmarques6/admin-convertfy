"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  ShoppingCart,
  Receipt,
  Send,
  Zap,
  Users,
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
import { MetricCard } from "../dashboard/components"
import { ThreeColumns } from "../dashboard/three-columns"
import { EmailPerformance } from "../dashboard/email-performance"
import { RevenueChannels } from "../dashboard/revenue-channels"
import { ConversionsSection } from "../dashboard/conversions-section"
import { RankingsSection } from "../dashboard/rankings-section"
import { FooterStats } from "../dashboard/footer-stats"
import { ListHealthMetrics } from "./list-health-metrics"
import { AudienceMetrics } from "./audience-metrics"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import type { DashboardData } from "../dashboard/types"

export default function PortalAnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")

  const fetchData = useCallback(async (showRefresh = false) => {
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
      console.error("Analytics fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-32 bg-slate-200 mb-2" />
            <Skeleton className="h-4 w-48 bg-slate-100" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 bg-slate-200 rounded-lg" />
            <Skeleton className="h-10 w-10 bg-slate-200 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 bg-white rounded-xl border border-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-md shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <Button onClick={() => fetchData()} className="bg-[#5327F2] hover:bg-[#4520D4] text-white">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const shopify = data.shopify

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Análise</h1>
          <div className="flex items-center gap-2 mt-1">
            {data.dateRange && (
              <p className="text-sm text-slate-500">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
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
            <SelectTrigger className="w-[140px] h-10 bg-white border-slate-200 text-slate-700 rounded-lg shadow-sm">
              <CalendarDays className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 shadow-lg">
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-10 w-10 bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <AnimatedContainer className="space-y-6">
        {/* KPI Cards */}
        <AnimatedItem>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard title="Pedidos" value={formatNumber(klaviyo?.storeOrders || 0)} subtitle="no período" icon={ShoppingCart} />
            <MetricCard title="Ticket Médio" value={formatCurrency(klaviyo?.storeOrders ? (klaviyo?.storeRevenue || 0) / klaviyo.storeOrders : 0)} subtitle="receita / pedidos" icon={Receipt} />
            <MetricCard title="Campanhas" value={klaviyo?.campaignsCount || 0} subtitle="enviadas" icon={Send} />
            <MetricCard title="Flows Ativos" value={klaviyo?.activeFlows || 0} subtitle={`de ${klaviyo?.flowsCount || 0} total`} icon={Zap} highlight />
            <MetricCard title="Engajamento" value={formatPercent(klaviyo?.engagementRate || 0)} subtitle="dos leads" icon={Users} />
          </div>
        </AnimatedItem>

        {/* Audience & List Health */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AudienceMetrics klaviyo={klaviyo} shopify={shopify} />
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
          <ConversionsSection shopify={shopify} />
        </AnimatedItem>

        {/* Rankings */}
        <AnimatedItem>
          <RankingsSection shopify={shopify} />
        </AnimatedItem>

        {/* Footer */}
        <AnimatedItem>
          <FooterStats klaviyo={klaviyo} shopify={shopify} lastUpdated={data.lastUpdated} />
        </AnimatedItem>
      </AnimatedContainer>
    </div>
  )
}
