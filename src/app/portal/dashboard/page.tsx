"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Store,
  CalendarDays,
  RefreshCw,
  ShoppingCart,
  Receipt,
  Send,
  Zap,
  Users,
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
import { formatCurrency, formatNumber, formatPercent, formatDateRange } from "@/lib/utils/format"
import { MetricCard } from "./components"
import { HeroSection } from "./hero-section"
import { ThreeColumns } from "./three-columns"
import { EmailPerformance } from "./email-performance"
import { RevenueChannels } from "./revenue-channels"
import { ConversionsSection } from "./conversions-section"
import { RankingsSection } from "./rankings-section"
import { MeetingsSection } from "./meetings-section"
import { FooterStats } from "./footer-stats"
import type { DashboardData } from "./types"

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all")
  const [period, setPeriod] = useState("30d")

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      const params = new URLSearchParams({
        period,
        ...(selectedStoreId !== "all" && { store_id: selectedStoreId }),
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
  }, [period, selectedStoreId])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-zinc-500">Carregando dados...</p>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36 bg-zinc-900" />
            <Skeleton className="h-10 w-32 bg-zinc-900" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-zinc-900 border border-emerald-500/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
            <span className="text-emerald-300/70">Carregando métricas...</span>
          </div>
          <Skeleton className="h-10 w-48 bg-zinc-800/50 mb-2" />
          <Skeleton className="h-4 w-32 bg-zinc-800/50" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
              <Skeleton className="h-4 w-16 bg-zinc-800 mb-2" />
              <Skeleton className="h-8 w-24 bg-zinc-800" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 h-64">
              <Skeleton className="h-5 w-24 bg-zinc-800 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-8 w-full bg-zinc-800/50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Erro ao carregar</h2>
          <p className="text-zinc-400 mb-6">{error}</p>
          <Button onClick={() => fetchDashboard()} className="bg-emerald-500 hover:bg-emerald-600">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const shopify = data.shopify
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <div className="flex items-center gap-2">
              {data.dateRange && (
                <p className="text-sm text-zinc-500">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
              )}
              {refreshing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Atualizando...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white">
                <Store className="h-4 w-4 mr-2 text-zinc-400" />
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-white hover:bg-zinc-800">Todas as lojas</SelectItem>
                {data.stores?.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="text-white hover:bg-zinc-800">
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-white">
                <CalendarDays className="h-4 w-4 mr-2 text-zinc-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="7d" className="text-white hover:bg-zinc-800">7 dias</SelectItem>
                <SelectItem value="15d" className="text-white hover:bg-zinc-800">15 dias</SelectItem>
                <SelectItem value="30d" className="text-white hover:bg-zinc-800">30 dias</SelectItem>
                <SelectItem value="90d" className="text-white hover:bg-zinc-800">90 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
              title="Atualizar dados"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Dashboard Sections */}
        <div className="space-y-6">
          <HeroSection klaviyo={klaviyo} shopify={shopify} />

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard title="Pedidos" value={formatNumber(shopify?.totalOrders || 0)} subtitle="+12% vs anterior" icon={ShoppingCart} />
            <MetricCard title="Ticket Médio" value={formatCurrency(shopify?.averageOrderValue || 0)} subtitle="+5.2% vs anterior" icon={Receipt} />
            <MetricCard title="Campanhas" value={klaviyo?.campaignsCount || 0} subtitle="enviadas" icon={Send} />
            <MetricCard title="Flows Ativos" value={klaviyo?.activeFlows || 0} subtitle={`de ${klaviyo?.flowsCount || 0} total`} icon={Zap} highlight />
            <MetricCard title="Engajamento" value={formatPercent(klaviyo?.engagementRate || 0)} subtitle="dos leads" icon={Users} />
          </div>

          <ThreeColumns klaviyo={klaviyo} totalKlaviyoRevenue={totalKlaviyoRevenue} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EmailPerformance klaviyo={klaviyo} />
            <RevenueChannels klaviyo={klaviyo} shopify={shopify} />
          </div>

          <ConversionsSection shopify={shopify} />
          <RankingsSection shopify={shopify} />
          <MeetingsSection meetings={data.meetings} />
          <FooterStats klaviyo={klaviyo} shopify={shopify} lastUpdated={data.lastUpdated} />
        </div>
      </div>
    </div>
  )
}
