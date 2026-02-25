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
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  Calendar,
  ArrowRight,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, cn } from "@/lib/utils"

interface ClientsData {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface PipelineData {
  stage: string
  value: number
  deals: number
  [key: string]: string | number
}

interface DashboardChartsProps {
  revenueData?: Array<{ month: string; receita: number; [key: string]: string | number }>
  clientsData?: ClientsData[]
  pipelineData?: PipelineData[]
}

interface FinancialData {
  asaasConnected: boolean
  revenueByMonth: Array<{ month: string; receita: number; key: string }>
  comparisonPercent: number | null
  comparisonLabel: string
  upcoming7Days: { count: number; totalValue: number }
  newDeals: { count: number; pipelineValue: number }
}

export function DashboardCharts({
  revenueData = [],
  clientsData = [],
  pipelineData = []
}: DashboardChartsProps) {
  const hasClientsData = clientsData.some((d) => d.value > 0)
  const hasPipelineData = pipelineData.length > 0

  // Fetch financial data from Asaas API
  const [financialData, setFinancialData] = useState<FinancialData | null>(null)
  const [isLoadingFinancial, setIsLoadingFinancial] = useState(true)

  const loadFinancialData = useCallback(async () => {
    setIsLoadingFinancial(true)
    try {
      const response = await fetch("/api/dashboard/financial-summary")
      if (response.ok) {
        const result = await response.json()
        setFinancialData(result)
      }
    } catch (err) {
      console.error("Error loading financial summary:", err)
    } finally {
      setIsLoadingFinancial(false)
    }
  }, [])

  useEffect(() => {
    loadFinancialData()
  }, [loadFinancialData])

  // Use Asaas data if available, fallback to server-side props
  const displayRevenueData = financialData?.asaasConnected && financialData.revenueByMonth.length > 0
    ? financialData.revenueByMonth
    : revenueData
  const hasRevenueData = displayRevenueData.some((d) => d.receita > 0)

  return (
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">Visão Geral</CardTitle>
        <CardDescription className="text-xs">Acompanhe o desempenho da sua agência</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList className="bg-muted/50 rounded-lg p-0.5">
            <TabsTrigger value="revenue" className="rounded-md text-xs h-7 px-3">Receita</TabsTrigger>
            <TabsTrigger value="pipeline" className="rounded-md text-xs h-7 px-3">Pipeline</TabsTrigger>
            <TabsTrigger value="clients" className="rounded-md text-xs h-7 px-3">Clientes</TabsTrigger>
          </TabsList>

          {/* === RECEITA TAB (enhanced with Asaas data) === */}
          <TabsContent value="revenue" className="space-y-4">
            {/* Comparison badge + refresh */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {financialData?.comparisonPercent != null && (
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                      financialData.comparisonPercent >= 0
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {financialData.comparisonPercent >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {financialData.comparisonPercent >= 0 ? "+" : ""}
                    {financialData.comparisonPercent.toFixed(1)}% vs {financialData.comparisonLabel}
                  </div>
                )}
                {isLoadingFinancial && (
                  <Skeleton className="h-6 w-24 rounded-full" />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={loadFinancialData}
                disabled={isLoadingFinancial}
              >
                <RefreshCw className={cn("h-4 w-4", isLoadingFinancial && "animate-spin")} />
              </Button>
            </div>

            {/* Revenue chart */}
            <div className="h-[260px]">
              {isLoadingFinancial && !financialData ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : hasRevenueData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayRevenueData}>
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
                    <Bar dataKey="receita" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Receita" isAnimationActive={true} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Nenhum dado de receita disponível
                </div>
              )}
            </div>

            {/* Bottom cards: Novos Deals + Proximos 7 dias */}
            <div className="grid gap-4 grid-cols-2 pt-2">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md p-1.5 bg-primary/10">
                    <Target className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Novos Deals</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {financialData?.newDeals.count ?? 0}{" "}
                  <span className="text-xs font-normal text-muted-foreground">este mês</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(financialData?.newDeals.pipelineValue ?? 0)} em pipeline
                </p>
                <Button variant="ghost" size="sm" className="mt-1.5 -ml-2 h-7 text-primary text-xs" asChild>
                  <Link href="/pipeline">
                    Ver Pipeline <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-md p-1.5 bg-warning/10">
                    <Calendar className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Proximos 7 dias</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {financialData?.upcoming7Days.count ?? 0}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {(financialData?.upcoming7Days.count ?? 0) === 1 ? "cobrança" : "cobranças"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(financialData?.upcoming7Days.totalValue ?? 0)} a receber
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-muted-foreground">
                  {financialData?.asaasConnected ? "Receita Asaas (6 meses)" : "Receita (últimos 6 meses)"}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* === PIPELINE TAB (unchanged) === */}
          <TabsContent value="pipeline" className="space-y-4">
            <div className="h-[300px]">
              {hasPipelineData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(value) => `${value / 1000}k`}
                    />
                    <YAxis
                      dataKey="stage"
                      type="category"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number, _name, props) => [
                        `${formatCurrency(value)} (${props.payload.deals} deals)`,
                        "Valor",
                      ]}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Nenhum deal no pipeline
                </div>
              )}
            </div>
          </TabsContent>

          {/* === CLIENTES TAB (unchanged) === */}
          <TabsContent value="clients" className="space-y-4">
            <div className="h-[300px] flex items-center justify-center">
              {hasClientsData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {clientsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value} clientes`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground">
                  Nenhum cliente cadastrado
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {clientsData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </div>
  )
}
