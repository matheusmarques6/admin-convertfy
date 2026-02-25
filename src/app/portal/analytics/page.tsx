"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Store,
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
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import type { DashboardData } from "../dashboard/types"

export default function PortalAnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    try { return localStorage.getItem("portal_active_store") || "all" } catch { return "all" }
  })
  const [period, setPeriod] = useState("30d")

  const fetchData = useCallback(async (showRefresh = false) => {
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
      console.error("Analytics fetch error:", err)
      setError("Não foi possível carregar os dados. Tente novamente.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period, selectedStoreId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Análise</h1>
            <p className="text-sm text-muted-foreground">Carregando dados...</p>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36 bg-card" />
            <Skeleton className="h-10 w-32 bg-card" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl bg-card/50 border border-border p-4">
              <Skeleton className="h-4 w-16 bg-muted mb-2" />
              <Skeleton className="h-8 w-24 bg-muted" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-card border border-border p-5 h-64">
              <Skeleton className="h-5 w-24 bg-muted mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-8 w-full bg-muted/50" />
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="rounded-xl bg-card border border-border p-8 text-center max-w-md">
          <div className="rounded-full bg-destructive/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Erro ao carregar</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => fetchData()} className="bg-primary hover:bg-primary/80">
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Análise</h1>
            <div className="flex items-center gap-2">
              {data.dateRange && (
                <p className="text-sm text-muted-foreground">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
              )}
              {refreshing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-info text-xs">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Atualizando...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[180px] bg-card border-border text-foreground">
                <Store className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="text-foreground hover:bg-muted">Todas as lojas</SelectItem>
                {data.stores?.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="text-foreground hover:bg-muted">
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] bg-card border-border text-foreground">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="7d" className="text-foreground hover:bg-muted">7 dias</SelectItem>
                <SelectItem value="15d" className="text-foreground hover:bg-muted">15 dias</SelectItem>
                <SelectItem value="30d" className="text-foreground hover:bg-muted">30 dias</SelectItem>
                <SelectItem value="90d" className="text-foreground hover:bg-muted">90 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="bg-card border-border text-foreground hover:bg-muted"
              title="Atualizar dados"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Analytics Sections - migrated from dashboard */}
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

          {/* Top Flows & Campaigns */}
          <AnimatedItem>
            <ThreeColumns klaviyo={klaviyo} />
          </AnimatedItem>

          {/* Email Performance & Revenue Channels */}
          <AnimatedItem>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EmailPerformance klaviyo={klaviyo} />
              <RevenueChannels klaviyo={klaviyo} />
            </div>
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
    </div>
  )
}
