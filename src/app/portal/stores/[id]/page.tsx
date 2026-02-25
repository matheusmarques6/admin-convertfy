"use client"

import { useState, useEffect, useCallback, use } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Store,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Mail,
  ShoppingCart,
  MousePointerClick,
  Eye,
  BarChart3,
  Percent,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StoreReport {
  store: {
    id: string
    store_name: string
    store_url: string
    platform: string
    is_active: boolean
  }
  klaviyo?: {
    totalLeads: number
    engagedLeads: number
    engagementRate: number
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    emailsSent: number
    openRate: number
    clickRate: number
    conversionRate: number
    unsubscribeRate: number
    bounceRate: number
    lists: Array<{ name: string; count: number }>
    recentCampaigns: Array<{
      id: string
      name: string
      status: string
      sentAt: string
      recipients: number
      delivered: number
      opened: number
      clicked: number
      revenue: number
      openRate: number
      clickRate: number
    }>
    topFlows: Array<{
      id: string
      name: string
      revenue: number
      recipients: number
      openRate: number
      clickRate: number
    }>
  }
  shopify?: {
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    recurringCustomerRate: number
    newCustomers: number
    topProducts: Array<{
      name: string
      quantity: number
      revenue: number
    }>
  }
  period: string
  lastSyncedAt?: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function PortalStoreReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [report, setReport] = useState<StoreReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")

  const fetchReport = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const response = await fetch(`/api/portal/stores/${id}/report?period=${period}`)
      if (!response.ok) {
        throw new Error("Erro ao carregar relatório")
      }
      const data = await response.json()
      setReport(data)
      setError(null)
    } catch (err) {
      console.error("Report fetch error:", err)
      setError("Não foi possível carregar o relatório")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id, period])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-slate-500 mb-4">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/portal/stores">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <Button onClick={() => fetchReport()} className="bg-[#5327F2] hover:bg-[#4520D4] text-white shadow-sm">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  if (!report) return null

  const { store, klaviyo, shopify } = report

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/portal/stores">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="w-12 h-12 rounded-lg bg-[#5327F2]/10 flex items-center justify-center">
            <Store className="h-6 w-6 text-[#5327F2]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{store.store_name}</h1>
            <p className="text-slate-500 capitalize">{store.platform}</p>
          </div>
          <Badge variant={store.is_active ? "default" : "secondary"}>
            {store.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReport(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="email">Email Marketing</TabsTrigger>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500">Total de Leads</span>
                <Users className="h-4 w-4 text-[#5327F2]" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(klaviyo?.totalLeads || 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Contatos na base</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500">Leads Engajados</span>
                <TrendingUp className="h-4 w-4 text-[#05AFF2]" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(klaviyo?.engagedLeads || 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formatPercent(klaviyo?.engagementRate || 0)} de engajamento
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500">Receita Email</span>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(klaviyo?.totalRevenue || 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Atribuída via Klaviyo</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500">Total Pedidos</span>
                <ShoppingCart className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(shopify?.totalOrders || 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">No período selecionado</p>
            </div>
          </div>

          {/* Email Performance Summary */}
          {klaviyo && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Performance de Email</h3>
                <p className="text-sm text-slate-500">Métricas de engajamento no período</p>
              </div>
              <div>
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500">Taxa de Abertura</span>
                      <Eye className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.openRate)}</div>
                    <Progress value={klaviyo.openRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500">Taxa de Clique</span>
                      <MousePointerClick className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.clickRate)}</div>
                    <Progress value={klaviyo.clickRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500">Taxa de Conversão</span>
                      <Percent className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.conversionRate)}</div>
                    <Progress value={klaviyo.conversionRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500">Emails Enviados</span>
                      <Mail className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="text-2xl font-bold">{formatNumber(klaviyo.emailsSent)}</div>
                    <p className="text-xs text-slate-500 mt-2">No período</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Breakdown */}
          {klaviyo && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Receita por Canal</h3>
                  <p className="text-sm text-slate-500">Distribuição de receita atribuída</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Campanhas</span>
                      <span className="text-sm font-bold">{formatCurrency(klaviyo.campaignRevenue)}</span>
                    </div>
                    <Progress
                      value={(klaviyo.campaignRevenue / (klaviyo.totalRevenue || 1)) * 100}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Automações (Flows)</span>
                      <span className="text-sm font-bold">{formatCurrency(klaviyo.flowRevenue)}</span>
                    </div>
                    <Progress
                      value={(klaviyo.flowRevenue / (klaviyo.totalRevenue || 1)) * 100}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>

              {shopify && (
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Métricas E-commerce</h3>
                    <p className="text-sm text-slate-500">Dados da loja</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Receita Total</span>
                      <span className="font-bold">{formatCurrency(shopify.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Ticket Médio</span>
                      <span className="font-bold">{formatCurrency(shopify.averageOrderValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Clientes Recorrentes</span>
                      <span className="font-bold">{formatPercent(shopify.recurringCustomerRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Novos Clientes</span>
                      <span className="font-bold">{formatNumber(shopify.newCustomers)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Email Marketing Tab */}
        <TabsContent value="email" className="space-y-6">
          {klaviyo ? (
            <>
              {/* Recent Campaigns */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Campanhas Recentes</h3>
                  <p className="text-sm text-slate-500">Últimos emails enviados</p>
                </div>
                  {klaviyo.recentCampaigns.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma campanha no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.recentCampaigns.map((campaign) => (
                        <div
                          key={campaign.id}
                          className="p-4 border border-slate-200/80 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{campaign.name}</h4>
                              <p className="text-sm text-slate-500">
                                Enviada em {formatDate(campaign.sentAt)}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-emerald-50 text-green-700">
                              {formatCurrency(campaign.revenue)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <p className="text-slate-500">Enviados</p>
                              <p className="font-medium">{formatNumber(campaign.recipients)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Entregues</p>
                              <p className="font-medium">{formatNumber(campaign.delivered)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Aberturas</p>
                              <p className="font-medium">{formatPercent(campaign.openRate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Cliques</p>
                              <p className="font-medium">{formatPercent(campaign.clickRate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Receita</p>
                              <p className="font-medium text-emerald-600">{formatCurrency(campaign.revenue)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Top Flows */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Top Automações</h3>
                  <p className="text-sm text-slate-500">Flows com melhor performance</p>
                </div>
                  {klaviyo.topFlows.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum flow ativo no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.topFlows.map((flow, index) => (
                        <div
                          key={flow.id}
                          className="flex items-center gap-4 p-4 border border-slate-200/80 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#5327F2]/10 flex items-center justify-center text-sm font-bold text-[#5327F2]">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{flow.name}</h4>
                            <p className="text-sm text-slate-500">
                              {formatNumber(flow.recipients)} destinatários
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-600">{formatCurrency(flow.revenue)}</p>
                            <p className="text-xs text-slate-500">
                              {formatPercent(flow.openRate)} abertura
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Lists */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Listas de Email</h3>
                  <p className="text-sm text-slate-500">Segmentação da base</p>
                </div>
                  {klaviyo.lists.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma lista encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {klaviyo.lists.map((list) => (
                        <div
                          key={list.name}
                          className="flex items-center justify-between p-3 border border-slate-200/80 rounded-lg"
                        >
                          <span className="font-medium">{list.name}</span>
                          <Badge variant="outline">{formatNumber(list.count)} contatos</Badge>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <div className="flex flex-col items-center justify-center py-12 px-5">
                <Mail className="h-12 w-12 text-slate-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">Klaviyo não conectado</h3>
                <p className="text-slate-500 text-center max-w-md">
                  Os dados de email marketing serão exibidos quando a integração com Klaviyo estiver configurada.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* E-commerce Tab */}
        <TabsContent value="ecommerce" className="space-y-6">
          {shopify ? (
            <>
              {/* E-commerce Metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500">Receita Total</span>
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(shopify.totalRevenue)}</div>
                  <p className="text-xs text-slate-500 mt-1">No período</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500">Total de Pedidos</span>
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(shopify.totalOrders)}</div>
                  <p className="text-xs text-slate-500 mt-1">Pedidos finalizados</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500">Ticket Médio</span>
                    <BarChart3 className="h-4 w-4 text-[#05AFF2]" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(shopify.averageOrderValue)}</div>
                  <p className="text-xs text-slate-500 mt-1">Valor médio por pedido</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500">Clientes Recorrentes</span>
                    <TrendingUp className="h-4 w-4 text-[#5327F2]" />
                  </div>
                  <div className="text-2xl font-bold">{formatPercent(shopify.recurringCustomerRate)}</div>
                  <p className="text-xs text-slate-500 mt-1">Taxa de recompra</p>
                </div>
              </div>

              {/* Top Products */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Produtos Mais Vendidos</h3>
                  <p className="text-sm text-slate-500">Top produtos no período</p>
                </div>
                  {shopify.topProducts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum produto vendido no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {shopify.topProducts.map((product, index) => (
                        <div
                          key={product.name}
                          className="flex items-center gap-4 p-4 border border-slate-200/80 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#5327F2]/10 flex items-center justify-center text-sm font-bold text-[#5327F2]">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{product.name}</h4>
                            <p className="text-sm text-slate-500">
                              {formatNumber(product.quantity)} unidades vendidas
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(product.revenue)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <div className="flex flex-col items-center justify-center py-12 px-5">
                <ShoppingCart className="h-12 w-12 text-slate-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">Shopify não conectado</h3>
                <p className="text-slate-500 text-center max-w-md">
                  Os dados de e-commerce serão exibidos quando a integração com Shopify estiver configurada.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      {report.lastSyncedAt && (
        <p className="text-sm text-slate-500 text-center">
          Última sincronização: {formatDate(report.lastSyncedAt)}
        </p>
      )}
    </div>
  )
}
