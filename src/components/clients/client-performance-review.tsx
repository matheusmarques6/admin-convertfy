"use client"

import {
  TrendingUp,
  Mail,
  Percent,
  Zap,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Settings,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
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
import { SkeletonShimmer, SkeletonMetric } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import {
  useClientPerformance,
  useClientPerformanceContext,
  ClientPerformanceContext,
  PERIODS,
} from "@/lib/hooks/use-client-performance"
// ─── Provider: wraps KPIs + Tables to share state ────────────────────────────

export function ClientPerformanceProvider({
  clientId,
  children,
  onNavigateToStores,
}: {
  clientId: string
  children: React.ReactNode
  onNavigateToStores?: () => void
}) {
  const state = useClientPerformance(clientId)
  const value = { ...state, onNavigateToStores }
  return (
    <ClientPerformanceContext.Provider value={value}>
      {children}
    </ClientPerformanceContext.Provider>
  )
}

// ─── Skeleton for KPI cards ──────────────────────────────────────────────────

function KPISkeletons() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonMetric key={i} />
      ))}
    </div>
  )
}

// ─── Skeleton for tables ─────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <SkeletonShimmer className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <SkeletonShimmer className="h-4 flex-1" />
            <SkeletonShimmer className="h-4 w-16" />
            <SkeletonShimmer className="h-4 w-16" />
            <SkeletonShimmer className="h-4 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ─── KPIs: Header + KPI Cards + Error Badges (compact, goes on TOP) ─────────

export function ClientPerformanceKPIs() {
  const { data, loading, isValidating, error, period, setPeriod, refresh } =
    useClientPerformanceContext()

  return (
    <div className="space-y-4">
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

      {/* Skeleton loading state */}
      {loading && <KPISkeletons />}

      {/* Error state */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="ml-auto">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {data && !loading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Receita Total (Loja) - via Klaviyo metric-aggregates */}
            <GlowCard color="info" intensity="intense" surfaceClassName="p-6">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Receita Total</span>
                <ShoppingCart className="h-4 w-4 text-info" />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(data.totals.storeRevenue ?? 0)}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {(data.totals.storeOrders ?? 0).toLocaleString("pt-BR")} pedidos
                </span>
              </div>
            </GlowCard>

            {/* Revenue Atribuído (Email) */}
            <GlowCard color="success" intensity="intense" surfaceClassName="p-6">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Revenue Email</span>
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(data.totals.attributedRevenue ?? data.totals.klaviyoRevenue)}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  Campanhas: {formatCurrency(data.totals.campaignRevenue)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Flows: {formatCurrency(data.totals.flowRevenue)}
                </span>
              </div>
            </GlowCard>

            {/* Campanhas & Flows + Open/Click Rate inline */}
            <GlowCard color="primary" intensity="intense" surfaceClassName="p-6">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Campanhas & Flows</span>
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{data.totals.totalCampaigns + data.totals.totalFlows}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {data.totals.totalCampaigns} campanhas
                </span>
                <span className="text-xs text-muted-foreground">
                  {data.totals.totalFlows} flows
                </span>
              </div>
              {(data.totals.avgOpenRate > 0 || data.totals.avgClickRate > 0) && (
                <div className="flex gap-3 mt-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Open: <span className="font-medium text-foreground">{(data.totals.avgOpenRate * 100).toFixed(1)}%</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Click: <span className="font-medium text-foreground">{(data.totals.avgClickRate * 100).toFixed(1)}%</span>
                  </span>
                </div>
              )}
            </GlowCard>

            {/* % Recuperação Email */}
            <GlowCard color="warning" intensity="intense" surfaceClassName="p-6">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Recuperação Email</span>
                <Percent className="h-4 w-4 text-warning" />
              </div>
              <p className="text-2xl font-bold">
                {(data.totals.recoveryRate ?? 0).toFixed(1)}%
              </p>
              <span className="text-xs text-muted-foreground">
                {formatCurrency(data.totals.attributedRevenue ?? data.totals.klaviyoRevenue)} de {formatCurrency(data.totals.storeRevenue ?? 0)}
              </span>
            </GlowCard>
          </div>

          {/* Integration Error Badges */}
          {data.storeErrors && data.storeErrors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.storeErrors.map((store, i) =>
                store.errors.map((err, j) => {
                  const isRateLimit = err.code === "RATE_LIMIT"
                  const isNoData = err.message.includes("sem dados")
                  const isWarning = isRateLimit || isNoData

                  const Icon = isWarning ? AlertTriangle : AlertCircle
                  const bgClass = isWarning
                    ? "bg-yellow-500/10 border-yellow-500/20"
                    : "bg-destructive/10 border-destructive/20"
                  const textClass = isWarning
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-destructive"

                  return (
                    <div
                      key={`${i}-${j}`}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${bgClass}`}
                      title={err.message}
                    >
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${textClass}`} />
                      <span className={`text-xs ${textClass}`}>
                        {store.storeName}: {err.integration} - {err.message}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tables: Campanhas + Flows (goes BELOW ClientOverview) ───────────────────

export function ClientPerformanceTables() {
  const { data, loading, error, allCampaigns, allFlows, hasIntegrations, onNavigateToStores } =
    useClientPerformanceContext()

  // Show skeleton while loading
  if (loading) {
    return (
      <div className="space-y-6">
        <TableSkeleton />
        <TableSkeleton />
      </div>
    )
  }

  if (error || !data) return null

  const hasContent = allCampaigns.length > 0 || allFlows.length > 0

  // No integrations configured — CTA to set up
  if (!hasIntegrations && data.stores.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Settings className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhuma integração configurada</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
            Configure as integrações Klaviyo e Shopify nas lojas do cliente para visualizar dados de performance.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onNavigateToStores}
            disabled={!onNavigateToStores}
          >
            Configurar Integrações
          </Button>
        </CardContent>
      </Card>
    )
  }

  // All stores have errors — suggest checking integrations
  const allStoresFailed = data.storeErrors && data.storeErrors.length > 0 &&
    data.storeErrors.length === data.stores.length && !hasContent
  if (allStoresFailed) {
    return (
      <Card className="border-yellow-500/30">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mb-3" />
          <p className="text-sm font-medium">Erro ao carregar dados de performance</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
            Todas as lojas retornaram erro ao buscar métricas. O teste de conexão na aba Lojas verifica apenas a autenticação,
            enquanto a Visão Geral busca dados completos de campanhas e flows.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onNavigateToStores}
            disabled={!onNavigateToStores}
          >
            Verificar Integrações
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Has stores with integrations but no data for this period
  if (!hasContent && data.totals.klaviyoRevenue === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum dado encontrado neste período</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
            Não há dados de campanhas ou flows para o período selecionado.
            Tente selecionar um período maior (ex: 30 dias).
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!hasContent) return null

  return (
    <div className="space-y-6">
      {/* Recent Campaigns Table */}
      {allCampaigns.length > 0 && (
        <GlowCard color="primary" intensity="subtle">
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
        </GlowCard>
      )}

      {/* Top Flows Table */}
      {allFlows.length > 0 && (
        <GlowCard color="primary" intensity="subtle">
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
        </GlowCard>
      )}
    </div>
  )
}

// ─── Legacy wrapper (backwards compat) ───────────────────────────────────────

export function ClientPerformanceReview({ clientId }: { clientId: string }) {
  return (
    <ClientPerformanceProvider clientId={clientId}>
      <ClientPerformanceKPIs />
      <ClientPerformanceTables />
    </ClientPerformanceProvider>
  )
}
