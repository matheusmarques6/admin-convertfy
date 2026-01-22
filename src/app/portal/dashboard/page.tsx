"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  DollarSign,
  Store,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle,
  Mail,
  RefreshCw,
  Users,
  TrendingUp,
  ShoppingCart,
  Eye,
  MousePointerClick,
  BarChart3,
  CreditCard,
  CalendarDays,
  Video,
  Zap,
  Send,
  Target,
  Award,
  Package,
  UserPlus,
  Repeat,
  Download,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface StoreOption {
  id: string
  name: string
  platform: string
  isActive: boolean
}

interface KlaviyoData {
  // Overview metrics
  totalLeads: number
  engagedLeads: number
  engagementRate: number

  // Revenue metrics
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  smsRevenue: number

  // Email performance
  emailsSent: number
  delivered: number
  openRate: number
  clickRate: number
  clickToOpenRate: number
  conversionRate: number
  unsubscribeRate: number
  bounceRate: number
  bounces: number

  // Campaigns
  campaignsCount: number
  campaignDelivered: number
  campaignRevenuePercent: number

  // Flows
  flowsCount: number
  activeFlows: number
  flowDelivered: number
  flowRevenuePercent: number

  // Recent campaigns with full metrics
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

  // Top flows with full metrics
  topFlows: Array<{
    id: string
    name: string
    revenue: number
    delivered: number
    openRate: number
    clickRate: number
  }>
}

interface ShopifyData {
  // Revenue metrics
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  totalCustomers: number

  // Customer metrics
  newCustomers: number
  recurringCustomerRate: number

  // Top products
  topProducts: Array<{
    name: string
    quantity: number
    revenue: number
  }>
}

interface Invoice {
  id: string
  amount: number
  dueDate: string
  status: string
  description?: string
}

interface Meeting {
  id: string
  title: string
  scheduledAt: string
  duration?: number
  meetingUrl?: string
}

interface Campaign {
  id: string
  name: string
  status: string
  scheduledDate: string
  channel: string
}

interface DashboardData {
  client: {
    id: string
    name: string
    company?: string
  }
  stores: StoreOption[]
  selectedStore?: {
    id: string
    name: string
    platform: string
  }
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
  invoices: {
    pending: number
    overdue: number
    totalPending: number
    totalOverdue: number
    totalPaid: number
    recent: Invoice[]
  }
  upcomingCampaigns: Campaign[]
  meetings: Meeting[]
  period: string
  dateRange?: {
    start: string
    end: string
  }
  lastUpdated: string
}

const invoiceStatusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatPercent(value: number): string {
  return `${(value || 0).toFixed(2)}%`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const formatOpts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }
  return `${startDate.toLocaleDateString("pt-BR", formatOpts)} - ${endDate.toLocaleDateString("pt-BR", formatOpts)}`
}

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all")
  const [period, setPeriod] = useState("30d")

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const params = new URLSearchParams({
        period,
        ...(selectedStoreId !== "all" && { store_id: selectedStoreId }),
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
  }, [period, selectedStoreId])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const handlePeriodChange = (value: string) => {
    setPeriod(value)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
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
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => fetchDashboard()}>Tentar novamente</Button>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const shopify = data.shopify

  // Calculate attribution percentage
  const totalShopifyRevenue = shopify?.totalRevenue || 0
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const attributionPercent = totalShopifyRevenue > 0
    ? ((totalKlaviyoRevenue / totalShopifyRevenue) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header with Store Selector and Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-500" />
            <Award className="h-6 w-6 text-yellow-500" />
            <Award className="h-6 w-6 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.selectedStore?.name || data.client?.name || "Dashboard"}</h1>
            {data.dateRange && (
              <p className="text-sm text-muted-foreground">
                {formatDateRange(data.dateRange.start, data.dateRange.end)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Store Selector */}
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-[180px]">
              <Store className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {data.stores?.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period Selector */}
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[140px]">
              <CalendarDays className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          {/* Export PDF Button */}
          <Button variant="default" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {selectedStoreId === "all" ? (
        // Show message to select a store
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Store className="h-16 w-16 text-muted-foreground mb-6" />
            <h3 className="text-xl font-semibold mb-2">Selecione uma loja</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Para visualizar os dados detalhados do relatório, selecione uma loja específica no menu acima.
            </p>
            {data.stores && data.stores.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {data.stores.map((store) => (
                  <Button
                    key={store.id}
                    variant="outline"
                    onClick={() => setSelectedStoreId(store.id)}
                  >
                    <Store className="h-4 w-4 mr-2" />
                    {store.name}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Show full report when store is selected
        <div className="space-y-6">
          {/* CAMPANHAS E ENGAJAMENTO Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">CAMPANHAS E ENGAJAMENTO</CardTitle>
              </div>
              <CardDescription>Visão geral do alcance e engajamento das suas campanhas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Top row metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Campanhas Enviadas</span>
                  </div>
                  <p className="text-3xl font-bold">{klaviyo?.campaignsCount || 0}</p>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Taxa de Engajamento</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-500">{formatPercent(klaviyo?.engagementRate || 0)}</p>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Repeat className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Taxa Recorrência</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-500">{formatPercent(shopify?.recurringCustomerRate || 0)}</p>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Novos Clientes</span>
                  </div>
                  <p className="text-3xl font-bold">{formatNumber(shopify?.newCustomers || 0)}</p>
                </div>
              </div>

              {/* Leads section */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-6 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground uppercase tracking-wide">TOTAL DE LEADS</p>
                      <p className="text-4xl font-bold mt-2">{formatNumber(klaviyo?.totalLeads || 0)}</p>
                      <p className="text-sm text-muted-foreground mt-1">Contatos na base</p>
                    </div>
                    <Users className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                </div>

                <div className="p-6 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-500 uppercase tracking-wide">LEADS ENGAJADOS 90D</p>
                      <p className="text-4xl font-bold mt-2">{formatNumber(klaviyo?.engagedLeads || 0)}</p>
                      <p className="text-sm text-muted-foreground mt-1">{formatPercent(klaviyo?.engagementRate || 0)} de engajamento</p>
                    </div>
                    <div className="relative w-20 h-20">
                      <svg className="transform -rotate-90 w-20 h-20">
                        <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="6" fill="none" className="text-muted/20" />
                        <circle
                          cx="40" cy="40" r="35"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="none"
                          className="text-blue-500"
                          strokeDasharray={`${(klaviyo?.engagementRate || 0) * 2.2} 220`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                        {formatPercent(klaviyo?.engagementRate || 0).replace('%', '')}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RESULTADOS FINANCEIROS Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">RESULTADOS FINANCEIROS</CardTitle>
              </div>
              <CardDescription>Faturamento e atribuição de receita por canal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Main financial metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 rounded-lg border bg-card flex flex-col items-center text-center">
                  <DollarSign className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-2xl font-bold">{formatCurrency(shopify?.totalRevenue || 0)}</p>
                  <p className="text-sm text-muted-foreground uppercase">FATURAMENTO TOTAL</p>
                </div>

                <div className="p-4 rounded-lg border bg-card flex flex-col items-center text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-2xl font-bold">{formatCurrencyFull(shopify?.averageOrderValue || 0)}</p>
                  <p className="text-sm text-muted-foreground uppercase">TICKET MÉDIO</p>
                </div>

                <div className="p-4 rounded-lg border bg-card flex flex-col items-center text-center">
                  <Package className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-2xl font-bold">{formatNumber(shopify?.totalOrders || 0)}</p>
                  <p className="text-sm text-muted-foreground uppercase">TOTAL DE PEDIDOS</p>
                </div>

                <div className="p-4 rounded-lg border bg-card flex flex-col items-center text-center">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-2xl font-bold">{formatNumber(shopify?.totalCustomers || 0)}</p>
                  <p className="text-sm text-muted-foreground uppercase">TOTAL DE CLIENTES</p>
                </div>
              </div>

              {/* Receita Atribuída Convertfy */}
              <div className="p-6 rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Receita Atribuída Convertfy</h3>
                </div>
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <p className="text-3xl font-bold text-primary">{formatCurrency(klaviyo?.totalRevenue || 0)}</p>
                    <p className="text-sm text-muted-foreground">Email + SMS</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-500">{formatPercent(attributionPercent)}</p>
                    <p className="text-sm text-muted-foreground">do Faturamento</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatNumber(klaviyo?.topFlows?.reduce((sum, f) => sum + (f.delivered || 0), 0) || 0)}</p>
                    <p className="text-sm text-muted-foreground">Pedidos</p>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="relative w-20 h-20">
                      <svg className="transform -rotate-90 w-20 h-20">
                        <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="6" fill="none" className="text-muted/20" />
                        <circle
                          cx="40" cy="40" r="35"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="none"
                          className="text-primary"
                          strokeDasharray={`${Math.min(attributionPercent, 100) * 2.2} 220`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                        {attributionPercent.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-2 uppercase">PARTICIPAÇÃO</p>
                  </div>
                </div>
              </div>

              {/* Email vs SMS breakdown */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg border bg-card flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Faturamento Email</p>
                    <p className="text-xl font-bold">{formatCurrency(klaviyo?.totalRevenue || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-blue-500">{formatPercent(attributionPercent)}</p>
                    <p className="text-xs text-muted-foreground">do total</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-card flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Send className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Faturamento SMS</p>
                    <p className="text-xl font-bold">{formatCurrency(klaviyo?.smsRevenue || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-500">{formatPercent(shopify?.totalRevenue ? ((klaviyo?.smsRevenue || 0) / shopify.totalRevenue) * 100 : 0)}</p>
                    <p className="text-xs text-muted-foreground">do total</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PERFORMANCE DE EMAIL Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">PERFORMANCE DE EMAIL</CardTitle>
              </div>
              <CardDescription>Métricas de entrega, abertura e cliques</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="p-4 rounded-lg border bg-card text-center">
                  <Send className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{formatNumber(klaviyo?.delivered || 0)}</p>
                  <p className="text-sm text-muted-foreground">Entregues</p>
                </div>

                <div className="p-4 rounded-lg border bg-card text-center">
                  <Eye className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-500">{formatPercent(klaviyo?.openRate || 0)}</p>
                  <p className="text-sm text-muted-foreground">Taxa Abertura</p>
                </div>

                <div className="p-4 rounded-lg border bg-card text-center">
                  <MousePointerClick className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-yellow-500">{formatPercent(klaviyo?.clickRate || 0)}</p>
                  <p className="text-sm text-muted-foreground">Taxa Clique</p>
                </div>

                <div className="p-4 rounded-lg border bg-card text-center">
                  <Target className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{formatPercent(klaviyo?.clickToOpenRate || 0)}</p>
                  <p className="text-sm text-muted-foreground">CTOR</p>
                </div>

                <div className="p-4 rounded-lg border bg-card text-center">
                  <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-2xl font-bold">{formatNumber(klaviyo?.bounces || 0)}</p>
                  <p className="text-sm text-muted-foreground">Bounces</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AUTOMAÇÕES & CAMPANHAS Section */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Automações (Flows) */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">AUTOMAÇÕES (FLOWS)</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Flows Ativos</span>
                  <span className="font-bold text-blue-500">{klaviyo?.activeFlows || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Total de Flows</span>
                  <span className="font-bold">{klaviyo?.flowsCount || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Receita de Flows</span>
                  <span className="font-bold">{formatCurrency(klaviyo?.flowRevenue || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">% da Receita Convertfy</span>
                  <span className="font-bold text-blue-500">{formatPercent(klaviyo?.flowRevenuePercent || (klaviyo?.totalRevenue ? ((klaviyo.flowRevenue || 0) / klaviyo.totalRevenue) * 100 : 0))}</span>
                </div>
              </CardContent>
            </Card>

            {/* Campanhas */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">CAMPANHAS</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Campanhas Enviadas</span>
                  <span className="font-bold text-blue-500">{klaviyo?.campaignsCount || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Entregues</span>
                  <span className="font-bold">{formatNumber(klaviyo?.campaignDelivered || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Receita de Campanhas</span>
                  <span className="font-bold">{formatCurrency(klaviyo?.campaignRevenue || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">% da Receita Convertfy</span>
                  <span className="font-bold text-blue-500">{formatPercent(klaviyo?.campaignRevenuePercent || (klaviyo?.totalRevenue ? ((klaviyo.campaignRevenue || 0) / klaviyo.totalRevenue) * 100 : 0))}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TOP AUTOMAÇÕES POR RECEITA Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">TOP AUTOMAÇÕES POR RECEITA</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!klaviyo?.topFlows || klaviyo.topFlows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum flow com receita no período</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome do Flow</TableHead>
                      <TableHead className="text-right">Entregues</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {klaviyo.topFlows.slice(0, 10).map((flow, index) => (
                      <TableRow key={flow.id}>
                        <TableCell>
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{flow.name}</TableCell>
                        <TableCell className="text-right">{formatNumber(flow.delivered || 0)}</TableCell>
                        <TableCell className="text-right">{formatPercent(flow.openRate || 0)}</TableCell>
                        <TableCell className="text-right">{formatPercent(flow.clickRate || 0)}</TableCell>
                        <TableCell className="text-right font-bold text-blue-500">{formatCurrencyFull(flow.revenue || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* TOP PRODUTOS MAIS VENDIDOS Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">TOP 5 PRODUTOS MAIS VENDIDOS</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!shopify?.topProducts || shopify.topProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum produto vendido no período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shopify.topProducts.slice(0, 5).map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatNumber(product.quantity)} unidades vendidas
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrencyFull(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Campaigns & Meetings */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Upcoming Campaigns */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Próximas Campanhas</CardTitle>
                  <CardDescription>Campanhas agendadas</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/portal/campaigns">
                    Ver todas
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {(data.upcomingCampaigns?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma campanha agendada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.upcomingCampaigns.slice(0, 4).map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(campaign.scheduledDate)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-yellow-100 text-yellow-700">
                          Agendada
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Meetings */}
            <Card>
              <CardHeader>
                <CardTitle>Próximas Reuniões</CardTitle>
                <CardDescription>Reuniões agendadas com a equipe</CardDescription>
              </CardHeader>
              <CardContent>
                {(data.meetings?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma reunião agendada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.meetings.slice(0, 4).map((meeting) => (
                      <div
                        key={meeting.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <Video className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium">{meeting.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(meeting.scheduledAt)}
                              {meeting.duration && ` • ${meeting.duration} min`}
                            </p>
                          </div>
                        </div>
                        {meeting.meetingUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">
                              Entrar
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Financial Tab */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">FINANCEIRO</CardTitle>
                </div>
                <CardDescription>Controle de faturas e pagamentos</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/portal/invoices">
                  Ver todas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Financial Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-lg border bg-yellow-50 dark:bg-yellow-900/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700 dark:text-yellow-500">Total Pendente</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-500">
                    {formatCurrencyFull(data.invoices?.totalPending || 0)}
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-600">
                    {data.invoices?.pending || 0} fatura(s)
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-red-50 dark:bg-red-900/10">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-700 dark:text-red-500">Total Vencido</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-500">
                    {formatCurrencyFull(data.invoices?.totalOverdue || 0)}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-600">
                    {data.invoices?.overdue || 0} fatura(s)
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-900/10">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 dark:text-green-500">Total Pago</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-500">
                    {formatCurrencyFull(data.invoices?.totalPaid || 0)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-600">
                    Pagamentos realizados
                  </p>
                </div>
              </div>

              {/* Recent Invoices */}
              {data.invoices?.recent && data.invoices.recent.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase">Últimas Faturas</h4>
                  {data.invoices.recent.slice(0, 5).map((invoice) => {
                    const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== "paid"
                    return (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            invoice.status === "paid" ? "bg-green-100 dark:bg-green-900/30" :
                            isOverdue ? "bg-red-100 dark:bg-red-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"
                          }`}>
                            {invoice.status === "paid" ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : isOverdue ? (
                              <AlertCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-yellow-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{formatCurrencyFull(invoice.amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              Vencimento: {formatDate(invoice.dueDate)}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={invoiceStatusColors[isOverdue && invoice.status !== "paid" ? "overdue" : invoice.status as keyof typeof invoiceStatusColors] || ""}
                        >
                          {invoice.status === "paid" ? "Paga" :
                           isOverdue ? "Vencida" :
                           invoice.status === "pending" ? "Pendente" : invoice.status}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Last Updated */}
      <p className="text-sm text-muted-foreground text-center">
        Última atualização: {data.lastUpdated ? formatDateTime(data.lastUpdated) : "Agora"}
      </p>
    </div>
  )
}
