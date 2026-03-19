"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
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
  ChevronDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { SkeletonShimmer, SkeletonMetric } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import {
  useClientPerformance,
  useClientPerformanceContext,
  ClientPerformanceContext,
  PERIODS,
} from "@/lib/hooks/use-client-performance"
import type { StoreBreakdown } from "@/lib/hooks/use-client-performance"
import { getStoreColor, type StoreColor } from "@/lib/constants/store-colors"
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
  const { data, loading, isValidating, error, period, setPeriod, setCustomDates, refresh, storeBreakdown } =
    useClientPerformanceContext()

  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  const isMultiStore = storeBreakdown.length > 1

  const storeColorMap = useMemo(() => {
    const map = new Map<string, StoreColor>()
    storeBreakdown.forEach((s, i) => {
      map.set(s.storeName, getStoreColor(i))
    })
    return map
  }, [storeBreakdown])

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
          {/* Store Legend */}
          {isMultiStore && (
            <div className="flex gap-4 flex-wrap">
              {storeBreakdown.map((s) => {
                const color = storeColorMap.get(s.storeName)
                return (
                  <div key={s.storeId} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
                      style={{ backgroundColor: color?.dot }}
                    />
                    <span className="text-xs text-muted-foreground">{s.storeName}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Receita Total (Loja) - via Klaviyo metric-aggregates */}
            <Card
              className={`rounded-xl border bg-card p-6 ${isMultiStore ? "cursor-pointer hover:border-border/80 transition-colors" : ""}`}
              onClick={isMultiStore ? () => toggleCard("revenue") : undefined}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Receita Total</span>
                <div className="flex items-center gap-1">
                  {isMultiStore && (
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedCards.has("revenue") ? "rotate-180" : ""}`}
                    />
                  )}
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(data.totals.storeRevenue ?? 0)}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {(data.totals.storeOrders ?? 0).toLocaleString("pt-BR")} pedidos
                </span>
              </div>
              {isMultiStore && (
                <ProportionBar
                  values={storeBreakdown.map((s) => s.storeRevenue)}
                  storeBreakdown={storeBreakdown}
                  storeColorMap={storeColorMap}
                />
              )}
              {isMultiStore && (
                <BreakdownPanel expanded={expandedCards.has("revenue")}>
                  {storeBreakdown.map((s) => (
                    <BreakdownRow
                      key={s.storeId}
                      storeName={s.storeName}
                      color={storeColorMap.get(s.storeName)}
                      value={formatCurrency(s.storeRevenue)}
                      subtitle={`(${s.storeOrders.toLocaleString("pt-BR")} pedidos)`}
                    />
                  ))}
                </BreakdownPanel>
              )}
            </Card>

            {/* Revenue Atribuido (Email) */}
            <Card
              className={`rounded-xl border bg-card p-6 ${isMultiStore ? "cursor-pointer hover:border-border/80 transition-colors" : ""}`}
              onClick={isMultiStore ? () => toggleCard("email") : undefined}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Revenue Email</span>
                <div className="flex items-center gap-1">
                  {isMultiStore && (
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedCards.has("email") ? "rotate-180" : ""}`}
                    />
                  )}
                  <TrendingUp className="h-4 w-4 text-success" />
                </div>
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
              {isMultiStore && (
                <ProportionBar
                  values={storeBreakdown.map((s) => s.attributedRevenue)}
                  storeBreakdown={storeBreakdown}
                  storeColorMap={storeColorMap}
                />
              )}
              {isMultiStore && (
                <BreakdownPanel expanded={expandedCards.has("email")}>
                  {storeBreakdown.map((s) => (
                    <BreakdownRow
                      key={s.storeId}
                      storeName={s.storeName}
                      color={storeColorMap.get(s.storeName)}
                      value={formatCurrency(s.attributedRevenue)}
                    />
                  ))}
                </BreakdownPanel>
              )}
            </Card>

            {/* Campanhas & Flows + Open/Click Rate inline */}
            <Card
              className={`rounded-xl border bg-card p-6 ${isMultiStore ? "cursor-pointer hover:border-border/80 transition-colors" : ""}`}
              onClick={isMultiStore ? () => toggleCard("campaigns") : undefined}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Campanhas & Flows</span>
                <div className="flex items-center gap-1">
                  {isMultiStore && (
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedCards.has("campaigns") ? "rotate-180" : ""}`}
                    />
                  )}
                  <Mail className="h-4 w-4 text-primary" />
                </div>
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
                    Open: <span className="font-medium text-foreground">{data.totals.avgOpenRate.toFixed(2)}%</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Click: <span className="font-medium text-foreground">{data.totals.avgClickRate.toFixed(2)}%</span>
                  </span>
                </div>
              )}
              {isMultiStore && (
                <ProportionBar
                  values={storeBreakdown.map((s) => s.sentCampaigns + s.liveFlows)}
                  storeBreakdown={storeBreakdown}
                  storeColorMap={storeColorMap}
                />
              )}
              {isMultiStore && (
                <BreakdownPanel expanded={expandedCards.has("campaigns")}>
                  {storeBreakdown.map((s) => (
                    <BreakdownRow
                      key={s.storeId}
                      storeName={s.storeName}
                      color={storeColorMap.get(s.storeName)}
                      value={`${s.sentCampaigns + s.liveFlows}`}
                      subtitle={`(${s.sentCampaigns} camp. + ${s.liveFlows} flows)`}
                    />
                  ))}
                </BreakdownPanel>
              )}
            </Card>

            {/* % Recuperacao Email — NO proportion bar (rates not additive) */}
            <Card
              className={`rounded-xl border bg-card p-6 ${isMultiStore ? "cursor-pointer hover:border-border/80 transition-colors" : ""}`}
              onClick={isMultiStore ? () => toggleCard("recovery") : undefined}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">Recuperação Email</span>
                <div className="flex items-center gap-1">
                  {isMultiStore && (
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expandedCards.has("recovery") ? "rotate-180" : ""}`}
                    />
                  )}
                  <Percent className="h-4 w-4 text-warning" />
                </div>
              </div>
              <p className="text-2xl font-bold">
                {(data.totals.recoveryRate ?? 0).toFixed(2)}%
              </p>
              <span className="text-xs text-muted-foreground">
                {formatCurrency(data.totals.attributedRevenue ?? data.totals.klaviyoRevenue)} de {formatCurrency(data.totals.storeRevenue ?? 0)}
              </span>
              {isMultiStore && (
                <BreakdownPanel expanded={expandedCards.has("recovery")}>
                  {storeBreakdown.map((s) => (
                    <BreakdownRow
                      key={s.storeId}
                      storeName={s.storeName}
                      color={storeColorMap.get(s.storeName)}
                      value={`${s.recoveryRate.toFixed(2)}%`}
                    />
                  ))}
                </BreakdownPanel>
              )}
            </Card>
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
                    ? "bg-warning/10 border-warning/20"
                    : "bg-destructive/10 border-destructive/20"
                  const textClass = isWarning
                    ? "text-warning"
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
  const { data, loading, error, allCampaigns, allFlows, hasIntegrations, onNavigateToStores, storeBreakdown } =
    useClientPerformanceContext()

  const isMultiStore = storeBreakdown.length > 1

  const storeColorMap = useMemo(() => {
    const map = new Map<string, StoreColor>()
    storeBreakdown.forEach((s, i) => {
      map.set(s.storeName, getStoreColor(i))
    })
    return map
  }, [storeBreakdown])

  const maxCampaignRevenue = useMemo(
    () => Math.max(...allCampaigns.slice(0, 10).map((c) => c.revenue), 0),
    [allCampaigns]
  )

  const maxFlowRevenue = useMemo(
    () => Math.max(...allFlows.slice(0, 10).map((f) => f.revenue), 0),
    [allFlows]
  )

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
      <Card className="border-warning/30">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-10 w-10 text-warning mb-3" />
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
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Mensagens recentes de campanha</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  {isMultiStore && <TableHead>Loja</TableHead>}
                  <TableHead className="text-right">Taxa de abertura</TableHead>
                  <TableHead className="text-right">Taxa de cliques</TableHead>
                  <TableHead className="text-right">Pedido Realizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allCampaigns.slice(0, 10).map((campaign, i) => {
                  const delivered = campaign.delivered || campaign.recipients || 0
                  const revenuePerRecipient = delivered > 0 ? campaign.revenue / delivered : 0
                  const sentDate = campaign.sendTime ? formatSendDate(campaign.sendTime) : ""
                  return (
                    <TableRow key={i}>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate" title={campaign.name}>
                          {campaign.name}
                        </div>
                        {sentDate && (
                          <div className="text-xs text-muted-foreground">Enviada em: {sentDate}</div>
                        )}
                      </TableCell>
                      {isMultiStore && (
                        <TableCell>
                          <StoreBadge storeName={campaign.storeName} storeColorMap={storeColorMap} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {campaign.openRate.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.clickRate.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(campaign.revenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(revenuePerRecipient)} / destinatário
                        </div>
                        {isMultiStore && (
                          <MiniRevenueBar
                            value={campaign.revenue}
                            max={maxCampaignRevenue}
                            color={storeColorMap.get(campaign.storeName)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Flows Table */}
      {allFlows.length > 0 && (
        <Card className="rounded-xl border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Fluxos com melhor desempenho</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fluxo</TableHead>
                  {isMultiStore && <TableHead>Loja</TableHead>}
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">Abertura</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead className="text-right">Pedido Realizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allFlows.slice(0, 10).map((flow, i) => {
                  const revenuePerRecipient = flow.delivered > 0 ? flow.revenue / flow.delivered : 0
                  return (
                    <TableRow key={i}>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate" title={flow.name}>
                          {flow.name}
                        </div>
                      </TableCell>
                      {isMultiStore && (
                        <TableCell>
                          <StoreBadge storeName={flow.storeName} storeColorMap={storeColorMap} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {(flow.delivered || 0).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {flow.openRate.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {flow.clickRate.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(flow.revenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(revenuePerRecipient)} / destinatário
                        </div>
                        {isMultiStore && (
                          <MiniRevenueBar
                            value={flow.revenue}
                            max={maxFlowRevenue}
                            color={storeColorMap.get(flow.storeName)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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

// ─── Helper: Proportion Bar (colored segments proportional to values) ────────

function ProportionBar({
  values,
  storeBreakdown,
  storeColorMap,
}: {
  values: number[]
  storeBreakdown: StoreBreakdown[]
  storeColorMap: Map<string, StoreColor>
}) {
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return null

  return (
    <div className="flex h-[3px] rounded-sm overflow-hidden gap-0.5 mt-3 bg-muted/20">
      {values.map((v, i) => {
        const color = storeColorMap.get(storeBreakdown[i].storeName)
        return (
          <div
            key={storeBreakdown[i].storeId}
            className="h-full rounded-sm"
            style={{ flex: v, backgroundColor: color?.dot }}
          />
        )
      })}
    </div>
  )
}

// ─── Helper: Breakdown Panel (collapsible store details) ─────────────────────

function BreakdownPanel({
  expanded,
  children,
}: {
  expanded: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${expanded ? "mt-3" : ""}`}
      style={{
        display: "grid",
        gridTemplateRows: expanded ? "1fr" : "0fr",
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-border/50 pt-2 space-y-1">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Helper: Breakdown Row (single store line in expanded card) ──────────────

function BreakdownRow({
  storeName,
  color,
  value,
  subtitle,
}: {
  storeName: string
  color: StoreColor | undefined
  value: string
  subtitle?: string
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
          style={{ backgroundColor: color?.dot }}
        />
        <span className="text-xs text-muted-foreground truncate max-w-[140px]">{storeName}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold">{value}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  )
}

// ─── Helper: Store Badge (colored badge for tables) ──────────────────────────

function StoreBadge({
  storeName,
  storeColorMap,
}: {
  storeName: string
  storeColorMap: Map<string, StoreColor>
}) {
  const color = storeColorMap.get(storeName)
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded"
      style={{ backgroundColor: color?.bg, color: color?.text }}
    >
      <span
        className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
        style={{ backgroundColor: color?.dot }}
      />
      <span className="max-w-[120px] truncate">{storeName}</span>
    </span>
  )
}

// ─── Helper: Mini Revenue Bar (table revenue column) ─────────────────────────

function MiniRevenueBar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: StoreColor | undefined
}) {
  if (max === 0) return null
  const pct = Math.round((value / max) * 100)
  return (
    <div className="w-12 h-[3px] rounded-sm overflow-hidden bg-muted/30 mt-1">
      <div
        className="h-full rounded-sm"
        style={{ width: `${pct}%`, backgroundColor: color?.dot }}
      />
    </div>
  )
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatSendDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}
