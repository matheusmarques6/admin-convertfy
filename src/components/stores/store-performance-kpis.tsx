"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  TrendingUp,
  Mail,
  Percent,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { CardContent } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { SkeletonMetric } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import {
  useStorePerformanceContext,
  PERIODS,
} from "@/lib/hooks/use-store-performance"

function KPISkeletons() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonMetric key={i} />
      ))}
    </div>
  )
}

export function StorePerformanceKPIs() {
  const {
    totals,
    loading,
    isValidating,
    error,
    period,
    setPeriod,
    setCustomDates,
    refresh,
  } = useStorePerformanceContext()

  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()

  const handleCustomDateApply = (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    setCustomDates({
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    })
    setPeriod("custom")
  }

  return (
    <div className="space-y-4">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance Convertfy</h3>
          <p className="text-sm text-muted-foreground">
            Resultados gerados pela Convertfy para esta loja
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DateRangePicker
            startDate={customStart}
            endDate={customEnd}
            onApply={handleCustomDateApply}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading || isValidating}
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && <KPISkeletons />}

      {/* Error */}
      {error && !loading && (
        <GlowCard color="primary" intensity="subtle">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="ml-auto">
              Tentar novamente
            </Button>
          </CardContent>
        </GlowCard>
      )}

      {/* KPI Cards */}
      {totals && !loading && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Receita Total (Loja) */}
          <GlowCard color="info" intensity="intense" surfaceClassName="p-6">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">Receita Total</span>
              <ShoppingCart className="h-4 w-4 text-info" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.storeRevenue)}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {totals.storeOrders.toLocaleString("pt-BR")} pedidos
              </span>
            </div>
          </GlowCard>

          {/* Revenue Email (Atribuído) */}
          <GlowCard color="success" intensity="intense" surfaceClassName="p-6">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">Revenue Email</span>
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.totalRevenue)}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                Campanhas: {formatCurrency(totals.campaignRevenue)}
              </span>
              <span className="text-xs text-muted-foreground">
                Flows: {formatCurrency(totals.flowRevenue)}
              </span>
            </div>
          </GlowCard>

          {/* Campanhas & Flows */}
          <GlowCard color="primary" intensity="intense" surfaceClassName="p-6">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">Campanhas & Flows</span>
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{totals.totalCampaigns + totals.totalFlows}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {totals.totalCampaigns} campanhas
              </span>
              <span className="text-xs text-muted-foreground">
                {totals.totalFlows} flows
              </span>
            </div>
            {(totals.avgOpenRate > 0 || totals.avgClickRate > 0) && (
              <div className="flex gap-3 mt-2 pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  Open: <span className="font-medium text-foreground">{totals.avgOpenRate.toFixed(2)}%</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Click: <span className="font-medium text-foreground">{totals.avgClickRate.toFixed(2)}%</span>
                </span>
              </div>
            )}
          </GlowCard>

          {/* Recuperação Email % */}
          <GlowCard color="warning" intensity="intense" surfaceClassName="p-6">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium text-muted-foreground">Recuperação Email</span>
              <Percent className="h-4 w-4 text-warning" />
            </div>
            <p className="text-2xl font-bold">
              {totals.recoveryRate.toFixed(2)}%
            </p>
            <span className="text-xs text-muted-foreground">
              {formatCurrency(totals.totalRevenue)} de {formatCurrency(totals.storeRevenue)}
            </span>
          </GlowCard>
        </div>
      )}
    </div>
  )
}
