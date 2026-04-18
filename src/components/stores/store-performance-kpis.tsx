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
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { SkeletonMetric } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import {
  useStorePerformanceContext,
  PERIODS,
} from "@/lib/hooks/use-store-performance"
import { RateLimitBanner } from "@/components/ui/rate-limit-banner"

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
    rateLimitInfo,
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

      {/* Rate limit banner */}
      {rateLimitInfo?.rateLimited && (
        <RateLimitBanner
          fromCache={rateLimitInfo.fromCache}
          fetchedAt={rateLimitInfo.fetchedAt}
          platform={rateLimitInfo.platform}
        />
      )}

      {/* Loading */}
      {loading && <KPISkeletons />}

      {/* Error */}
      {error && !loading && (
        <Card className="rounded-[8px] border-destructive/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="secondary" size="sm" onClick={refresh} className="ml-auto">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {totals && !loading && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Receita Total (Loja) */}
          <Card className="rounded-[8px]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm text-muted-foreground">Receita Total</span>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(totals.storeRevenue, totals.currency)}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {totals.storeOrders.toLocaleString("pt-BR")} pedidos
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Email (Atribuido) */}
          <Card className="rounded-[8px]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm text-muted-foreground">Revenue Email</span>
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(totals.totalRevenue, totals.currency)}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  Campanhas: {formatCurrency(totals.campaignRevenue, totals.currency)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Flows: {formatCurrency(totals.flowRevenue, totals.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Campanhas & Flows */}
          <Card className="rounded-[8px]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm text-muted-foreground">Campanhas & Flows</span>
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
                <div className="flex gap-3 mt-2 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Open: <span className="font-medium text-foreground">{totals.avgOpenRate.toFixed(2)}%</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Click: <span className="font-medium text-foreground">{totals.avgClickRate.toFixed(2)}%</span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recuperação Email % */}
          <Card className="rounded-[8px]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm text-muted-foreground">Recuperação Email</span>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">
                {totals.recoveryRate.toFixed(2)}%
              </p>
              <span className="text-xs text-muted-foreground">
                {formatCurrency(totals.totalRevenue, totals.currency)} de {formatCurrency(totals.storeRevenue, totals.currency)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
