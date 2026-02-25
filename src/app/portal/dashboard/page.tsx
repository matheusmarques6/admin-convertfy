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
import { GlowCard } from "@/components/ui/glow-card"
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
      <div className="min-h-screen bg-background p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Carregando dados...</p>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-r from-primary/40 via-primary/20 to-card border border-primary/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="h-5 w-5 text-info animate-spin" />
            <span className="text-info/70">Carregando métricas...</span>
          </div>
          <Skeleton className="h-10 w-48 bg-muted/50 mb-2" />
          <Skeleton className="h-4 w-32 bg-muted/50" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl bg-card/50 border border-border p-4 h-40">
              <Skeleton className="h-4 w-16 bg-muted mb-2" />
              <Skeleton className="h-8 w-24 bg-muted" />
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
          <Button onClick={() => fetchDashboard()} className="bg-primary hover:bg-primary/80">
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
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
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="bg-card border-border text-foreground hover:bg-muted"
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
                <GlowCard color={data.invoices.overdue > 0 ? "destructive" : "warning"} intensity="moderate" surfaceClassName="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Faturas</span>
                  </div>
                  {data.invoices.overdue > 0 && (
                    <div className="mb-2">
                      <p className="text-lg font-bold text-destructive">{formatCurrency(data.invoices.totalOverdue)}</p>
                      <p className="text-xs text-destructive/80">{data.invoices.overdue} fatura(s) em atraso</p>
                    </div>
                  )}
                  {data.invoices.pending > 0 && (
                    <div>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(data.invoices.totalPending)}</p>
                      <p className="text-xs text-muted-foreground">{data.invoices.pending} fatura(s) pendente(s)</p>
                    </div>
                  )}
                </GlowCard>
              )}
            </div>
          </AnimatedItem>

          {/* KPI Cards */}
          <AnimatedItem>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                label="Pedidos"
                value={formatNumber(storeOrders)}
                icon={ShoppingCart}
              />
              <KpiCard
                label="Ticket Médio"
                value={formatCurrency(ticketMedio)}
                icon={Receipt}
              />
              <KpiCard
                label="Recuperação de Carrinho"
                value={formatPercent(recoveryRate)}
                icon={ShoppingBag}
              />
              <KpiCard
                label="Receita por Lead"
                value={formatCurrency(receitaPorLead)}
                icon={Users}
              />
              <KpiCard
                label="Flows Ativos"
                value={`${klaviyo?.activeFlows || 0} / ${klaviyo?.flowsCount || 0}`}
                icon={Zap}
              />
            </div>
          </AnimatedItem>
        </AnimatedContainer>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl bg-card/80 border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  )
}
