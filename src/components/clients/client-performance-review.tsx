"use client"

import { useState, useEffect, useCallback } from "react"
import {
  TrendingUp,
  DollarSign,
  Mail,
  Zap,
  ShoppingCart,
  Users,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

interface PerformanceTotals {
  klaviyoRevenue: number
  campaignRevenue: number
  flowRevenue: number
  shopifyRevenue: number
  shopifyOrders: number
  shopifyCustomers: number
  totalCampaigns: number
  totalFlows: number
  avgOpenRate: number
  avgClickRate: number
}

interface BillingData {
  totalPaid: number
  totalPending: number
  totalOverdue: number
}

interface CampaignData {
  name: string
  sendTime: string
  recipients: number
  openRate: number
  clickRate: number
  revenue: number
}

interface FlowData {
  name: string
  status: string
  revenue: number
  openRate: number
  clickRate: number
}

interface StorePerformance {
  storeId: string
  storeName: string
  hasKlaviyo: boolean
  hasShopify: boolean
  klaviyo: {
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalCampaigns: number
    sentCampaigns: number
    totalFlows: number
    liveFlows: number
    avgOpenRate: number
    avgClickRate: number
    recentCampaigns: CampaignData[]
    topFlows: FlowData[]
  } | null
  shopify: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalCustomers: number
    recurringCustomerRate: number
  } | null
}

interface PerformanceResponse {
  period: string
  dateRange: { start: string; end: string }
  stores: StorePerformance[]
  totals: PerformanceTotals
  billing: BillingData
}

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
]

export function ClientPerformanceReview({ clientId }: { clientId: string }) {
  const [period, setPeriod] = useState("30d")
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (selectedPeriod: string) => {
    setLoading(true)
    setError(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      const res = await fetch(
        `/api/clients/${clientId}/performance?period=${selectedPeriod}`,
        { signal: controller.signal }
      )
      clearTimeout(timeout)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${res.status}`)
      }

      const json = await res.json()
      setData(json.data || json)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Timeout ao carregar dados. Tente um período menor.")
      } else {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      }
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchData(period)
  }, [period, fetchData])

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod)
  }

  // Collect all campaigns and flows across stores
  const allCampaigns: (CampaignData & { storeName: string })[] = []
  const allFlows: (FlowData & { storeName: string })[] = []

  if (data?.stores) {
    for (const store of data.stores) {
      if (store.klaviyo?.recentCampaigns) {
        for (const c of store.klaviyo.recentCampaigns) {
          allCampaigns.push({ ...c, storeName: store.storeName })
        }
      }
      if (store.klaviyo?.topFlows) {
        for (const f of store.klaviyo.topFlows) {
          allFlows.push({ ...f, storeName: store.storeName })
        }
      }
    }
  }

  allCampaigns.sort((a, b) => b.revenue - a.revenue)
  allFlows.sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance Convertfy</h3>
          <p className="text-sm text-muted-foreground">
            Resultados gerados pela Convertfy para este cliente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchData(period)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Carregando dados de performance...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchData(period)} className="ml-auto">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Data loaded */}
      {data && !loading && !error && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Revenue Klaviyo */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue Klaviyo
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(data.totals.klaviyoRevenue)}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    Campanhas: {formatCurrency(data.totals.campaignRevenue)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Flows: {formatCurrency(data.totals.flowRevenue)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Shopify */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue Shopify
                </CardTitle>
                <ShoppingCart className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(data.totals.shopifyRevenue)}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {data.totals.shopifyOrders} pedidos
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {data.totals.shopifyCustomers} clientes
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Campanhas & Flows */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Campanhas & Flows
                </CardTitle>
                <Mail className="h-4 w-4 text-violet-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totals.totalCampaigns + data.totals.totalFlows}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {data.totals.totalCampaigns} campanhas
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {data.totals.totalFlows} flows
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Faturamento */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Faturamento
                </CardTitle>
                <DollarSign className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(data.billing.totalPaid)}
                </p>
                <div className="flex gap-2 mt-1">
                  {data.billing.totalPending > 0 && (
                    <span className="text-xs text-amber-500">
                      Pendente: {formatCurrency(data.billing.totalPending)}
                    </span>
                  )}
                  {data.billing.totalOverdue > 0 && (
                    <span className="text-xs text-red-500">
                      Vencido: {formatCurrency(data.billing.totalOverdue)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Email Performance Summary */}
          {(data.totals.avgOpenRate > 0 || data.totals.avgClickRate > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Abertura (Média)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(data.totals.avgOpenRate * 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Taxa de Clique (Média)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(data.totals.avgClickRate * 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Campaigns Table */}
          {allCampaigns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campanhas Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      {data.stores.length > 1 && <TableHead>Loja</TableHead>}
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Open Rate</TableHead>
                      <TableHead className="text-right">Click Rate</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCampaigns.slice(0, 10).map((campaign, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {campaign.name}
                        </TableCell>
                        {data.stores.length > 1 && (
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {campaign.storeName}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {campaign.recipients.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          {(campaign.openRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {(campaign.clickRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(campaign.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Top Flows Table */}
          {allFlows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Flows por Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flow</TableHead>
                      {data.stores.length > 1 && <TableHead>Loja</TableHead>}
                      <TableHead className="text-right">Open Rate</TableHead>
                      <TableHead className="text-right">Click Rate</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allFlows.slice(0, 10).map((flow, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {flow.name}
                        </TableCell>
                        {data.stores.length > 1 && (
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {flow.storeName}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {(flow.openRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {(flow.clickRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(flow.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {allCampaigns.length === 0 && allFlows.length === 0 && data.totals.klaviyoRevenue === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Zap className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhum dado de performance encontrado para este período
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Verifique se as lojas do cliente possuem integração Klaviyo ativa
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
