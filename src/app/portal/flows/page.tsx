"use client"

import { useState, useEffect, useCallback } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  Zap,
  TrendingUp,
  Mail,
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
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrency, formatNumber, formatDateRange } from "@/lib/utils/format"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import type { DashboardData } from "../dashboard/types"

export default function PortalFlowsPage() {
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
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Flows fetch error:", err)
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
      <div className="min-h-screen bg-background p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Flows</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl bg-card/50 border border-border p-4">
              <Skeleton className="h-4 w-16 bg-muted mb-2" />
              <Skeleton className="h-8 w-24 bg-muted" />
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-card border border-border p-5">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full bg-muted/50 mb-2" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="rounded-xl bg-card border border-border p-8 text-center max-w-md">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Erro ao carregar</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => fetchData()}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const flows = klaviyo?.topFlows || []
  const totalFlowRevenue = klaviyo?.flowRevenue || 0
  const activeFlows = klaviyo?.activeFlows || 0
  const totalFlows = klaviyo?.flowsCount || 0
  const avgOpenRate = flows.length > 0
    ? flows.reduce((acc, f) => acc + f.openRate, 0) / flows.length
    : 0

  // Best flow by revenue
  const bestFlow = flows.length > 0 ? flows[0] : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Flows</h1>
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
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <AnimatedContainer className="space-y-6">
          {/* Summary Cards */}
          <AnimatedItem>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <GlowCard color="info" intensity="subtle" surfaceClassName="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Flows Ativos</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{activeFlows}</p>
                <p className="text-xs text-muted-foreground">de {totalFlows} total</p>
              </GlowCard>

              <GlowCard color="success" intensity="subtle" surfaceClassName="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-success" />
                  <span className="text-xs text-muted-foreground">Receita Total</span>
                </div>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalFlowRevenue)}</p>
                <p className="text-xs text-muted-foreground">no período</p>
              </GlowCard>

              <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-info" />
                  <span className="text-xs text-muted-foreground">Melhor Flow</span>
                </div>
                <p className="text-sm font-bold text-foreground truncate">{bestFlow?.name || "—"}</p>
                <p className="text-xs text-success">{bestFlow ? formatCurrency(bestFlow.revenue) : "—"}</p>
              </GlowCard>

              <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Taxa Média Abertura</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{avgOpenRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">dos flows</p>
              </GlowCard>
            </div>
          </AnimatedItem>

          {/* Flows Table */}
          <AnimatedItem>
            <GlowCard color="primary" intensity="subtle" surfaceClassName="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Todos os Flows</h3>

              {flows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum flow encontrado no período</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs text-muted-foreground font-medium pb-3 pr-4">Nome</th>
                        <th className="text-right text-xs text-muted-foreground font-medium pb-3 px-4">Entregas</th>
                        <th className="text-right text-xs text-muted-foreground font-medium pb-3 px-4">Abertura</th>
                        <th className="text-right text-xs text-muted-foreground font-medium pb-3 px-4">Cliques</th>
                        <th className="text-right text-xs text-muted-foreground font-medium pb-3 px-4">Receita</th>
                        <th className="text-right text-xs text-muted-foreground font-medium pb-3 pl-4">Rec/dest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flows.map((flow, index) => {
                        const revenuePerRecipient = flow.delivered > 0 ? flow.revenue / flow.delivered : 0
                        return (
                          <tr key={flow.id} className={`border-b border-border/50 last:border-0 ${index === 0 ? "bg-success/5" : ""}`}>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                {index < 3 && (
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                    index === 0 ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                                  }`}>
                                    {index + 1}
                                  </div>
                                )}
                                <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{flow.name}</span>
                              </div>
                            </td>
                            <td className="text-right text-sm text-foreground/80 py-3 px-4">{formatNumber(flow.delivered)}</td>
                            <td className="text-right text-sm text-foreground/80 py-3 px-4">{flow.openRate.toFixed(1)}%</td>
                            <td className="text-right text-sm text-foreground/80 py-3 px-4">{flow.clickRate.toFixed(1)}%</td>
                            <td className="text-right text-sm font-bold text-success py-3 px-4">{formatCurrency(flow.revenue)}</td>
                            <td className="text-right text-sm text-foreground/80 py-3 pl-4">{formatCurrency(revenuePerRecipient)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </GlowCard>
          </AnimatedItem>
        </AnimatedContainer>
      </div>
    </div>
  )
}
