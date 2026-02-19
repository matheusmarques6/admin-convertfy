"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  Calendar,
  DollarSign,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrency, cn } from "@/lib/utils"

interface MonthRevenue {
  month: string
  receita: number
  key: string
}

interface FinancialData {
  asaasConnected: boolean
  revenueByMonth: MonthRevenue[]
  comparisonPercent: number | null
  comparisonLabel: string
  upcoming7Days: {
    count: number
    totalValue: number
  }
  newDeals: {
    count: number
    pipelineValue: number
  }
}

export function FinancialSummary() {
  const [data, setData] = useState<FinancialData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/dashboard/financial-summary")
      if (!response.ok) {
        setError("Não foi possível carregar o resumo financeiro.")
        return
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error("Error loading financial summary:", err)
      setError("Erro de conexão ao carregar resumo financeiro.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Skeleton loading
  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[380px] w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[120px] rounded-xl" />
        </div>
      </div>
    )
  }

  // Error state
  if (error && !data) {
    return (
      <GlowCard color="destructive" intensity="subtle" surfaceClassName="p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-base font-medium">Erro no Resumo Financeiro</h3>
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-md">
            {error}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar Novamente
          </Button>
        </div>
      </GlowCard>
    )
  }

  // Not connected
  if (data && !data.asaasConnected) {
    return (
      <div className="space-y-4">
        <GlowCard color="primary" intensity="subtle" surfaceClassName="p-6">
          <div className="flex flex-col items-center justify-center py-8">
            <DollarSign className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-medium">Conecte a Asaas</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Configure a integração com Asaas para ver o resumo financeiro
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/settings/integrations">Configurar Integração</Link>
            </Button>
          </div>
        </GlowCard>
        {/* Still show deals card even without Asaas */}
        <DealsAndUpcomingCards data={data} />
      </div>
    )
  }

  const hasRevenueData = data?.revenueByMonth.some((d) => d.receita > 0)

  return (
    <div className="space-y-4">
      {/* Revenue Chart */}
      <GlowCard color="primary" intensity="subtle" className="h-full" surfaceClassName="gradient-accent-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Receita</CardTitle>
            <CardDescription>Faturamento recebido nos últimos 6 meses via Asaas</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {data?.comparisonPercent !== null && data?.comparisonPercent !== undefined && (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  data.comparisonPercent >= 0
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {data.comparisonPercent >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {data.comparisonPercent >= 0 ? "+" : ""}
                {data.comparisonPercent.toFixed(1)}% vs {data.comparisonLabel}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={loadData}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {hasRevenueData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Receita"]}
                  />
                  <Bar
                    dataKey="receita"
                    fill="#22C55E"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Nenhum dado de receita disponível neste período
              </div>
            )}
          </div>
        </CardContent>
      </GlowCard>

      {/* Bottom Cards */}
      <DealsAndUpcomingCards data={data} />
    </div>
  )
}

function DealsAndUpcomingCards({ data }: { data: FinancialData | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* New Deals Card */}
      <GlowCard color="primary" intensity="moderate" surfaceClassName="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-2 bg-[#5327F2]/10">
              <Target className="h-4 w-4 text-[#5327F2]" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Novos Deals</span>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{data?.newDeals.count || 0} <span className="text-sm font-normal text-muted-foreground">este mês</span></p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(data?.newDeals.pipelineValue || 0)} em pipeline
          </p>
        </div>
        <Button variant="ghost" size="sm" className="mt-3 -ml-2 text-[#5327F2]" asChild>
          <Link href="/pipeline">
            Ver Pipeline <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </GlowCard>

      {/* Upcoming 7 Days Card */}
      <GlowCard color="warning" intensity="moderate" surfaceClassName="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-2 bg-warning/10">
              <Calendar className="h-4 w-4 text-warning" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Próximos 7 dias</span>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">
            {data?.upcoming7Days.count || 0}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {(data?.upcoming7Days.count || 0) === 1 ? "cobrança" : "cobranças"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(data?.upcoming7Days.totalValue || 0)} a receber
          </p>
        </div>
      </GlowCard>
    </div>
  )
}
