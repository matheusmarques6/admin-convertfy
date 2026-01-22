"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  DollarSign,
  Store,
  FileText,
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
  Percent,
  BarChart3,
  CreditCard,
  CalendarDays,
  Video,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

interface StoreOption {
  id: string
  name: string
  platform: string
  isActive: boolean
}

interface KlaviyoData {
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

interface ShopifyData {
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
  lastUpdated: string
}

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
}

const invoiceStatusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
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
  return `${(value || 0).toFixed(1)}%`
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

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all")
  const [period, setPeriod] = useState("30d")
  const [activeTab, setActiveTab] = useState("overview")

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

  return (
    <div className="space-y-6">
      {/* Header with Store Selector and Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {data.client?.name || data.client?.company || "Cliente"}
          </p>
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
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="email">Email Marketing</TabsTrigger>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(klaviyo?.totalLeads || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Contatos na base
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Leads Engajados</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(klaviyo?.engagedLeads || 0)}
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <span>{formatPercent(klaviyo?.engagementRate || 0)} de engajamento</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Email</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(klaviyo?.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Atribuída via email marketing
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pedidos</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(shopify?.totalOrders || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  No período selecionado
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Email Performance Summary */}
          {klaviyo && (
            <Card>
              <CardHeader>
                <CardTitle>Performance de Email</CardTitle>
                <CardDescription>Métricas de engajamento no período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Taxa de Abertura</span>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.openRate)}</div>
                    <Progress value={klaviyo.openRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Taxa de Clique</span>
                      <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.clickRate)}</div>
                    <Progress value={klaviyo.clickRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                      <Percent className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.conversionRate)}</div>
                    <Progress value={klaviyo.conversionRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Emails Enviados</span>
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold">{formatNumber(klaviyo.emailsSent)}</div>
                    <p className="text-xs text-muted-foreground mt-2">No período</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grid with Upcoming Items */}
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
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(campaign.scheduledDate)}
                            </p>
                          </div>
                        </div>
                        <Badge className={statusColors[campaign.status as keyof typeof statusColors] || ""}>
                          {campaign.status === "scheduled" ? "Agendada" : campaign.status}
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
                          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
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

          {/* Revenue Breakdown */}
          {klaviyo && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Receita por Canal</CardTitle>
                  <CardDescription>Distribuição de receita atribuída</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>

              {shopify && (
                <Card>
                  <CardHeader>
                    <CardTitle>Métricas E-commerce</CardTitle>
                    <CardDescription>Resumo da loja</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Receita Total</span>
                      <span className="font-bold">{formatCurrency(shopify.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Ticket Médio</span>
                      <span className="font-bold">{formatCurrency(shopify.averageOrderValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Clientes Recorrentes</span>
                      <span className="font-bold">{formatPercent(shopify.recurringCustomerRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Novos Clientes</span>
                      <span className="font-bold">{formatNumber(shopify.newCustomers)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Email Marketing Tab */}
        <TabsContent value="email" className="space-y-6">
          {klaviyo ? (
            <>
              {/* Email Metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Emails Enviados</CardTitle>
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(klaviyo.emailsSent)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxa de Abertura</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.openRate)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxa de Clique</CardTitle>
                    <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.clickRate)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(klaviyo.totalRevenue)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Campaigns */}
              <Card>
                <CardHeader>
                  <CardTitle>Campanhas Recentes</CardTitle>
                  <CardDescription>Últimos emails enviados</CardDescription>
                </CardHeader>
                <CardContent>
                  {(klaviyo.recentCampaigns?.length || 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma campanha no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.recentCampaigns.map((campaign) => (
                        <div key={campaign.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{campaign.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                Enviada em {formatDate(campaign.sentAt)}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              {formatCurrency(campaign.revenue)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Enviados</p>
                              <p className="font-medium">{formatNumber(campaign.recipients)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Entregues</p>
                              <p className="font-medium">{formatNumber(campaign.delivered)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Aberturas</p>
                              <p className="font-medium">{formatPercent(campaign.openRate)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cliques</p>
                              <p className="font-medium">{formatPercent(campaign.clickRate)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Receita</p>
                              <p className="font-medium text-green-600">{formatCurrency(campaign.revenue)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Flows */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Automações</CardTitle>
                  <CardDescription>Flows com melhor performance</CardDescription>
                </CardHeader>
                <CardContent>
                  {(klaviyo.topFlows?.length || 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum flow ativo no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.topFlows.map((flow, index) => (
                        <div key={flow.id} className="flex items-center gap-4 p-4 border rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{flow.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {formatNumber(flow.recipients)} destinatários
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600">{formatCurrency(flow.revenue)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatPercent(flow.openRate)} abertura
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Dados não disponíveis</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Selecione uma loja para ver os dados de email marketing.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* E-commerce Tab */}
        <TabsContent value="ecommerce" className="space-y-6">
          {shopify ? (
            <>
              {/* E-commerce Metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(shopify.totalRevenue)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(shopify.totalOrders)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(shopify.averageOrderValue)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Clientes Recorrentes</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(shopify.recurringCustomerRate)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Products */}
              <Card>
                <CardHeader>
                  <CardTitle>Produtos Mais Vendidos</CardTitle>
                  <CardDescription>Top produtos no período</CardDescription>
                </CardHeader>
                <CardContent>
                  {(shopify.topProducts?.length || 0) === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum produto vendido no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {shopify.topProducts.map((product, index) => (
                        <div key={product.name} className="flex items-center gap-4 p-4 border rounded-lg">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{product.name}</h4>
                            <p className="text-sm text-muted-foreground">
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
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Dados não disponíveis</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Selecione uma loja para ver os dados de e-commerce.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-6">
          {/* Financial Summary */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
                <Clock className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(data.invoices?.totalPending || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.invoices?.pending || 0} fatura(s) pendente(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Vencido</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(data.invoices?.totalOverdue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.invoices?.overdue || 0} fatura(s) vencida(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(data.invoices?.totalPaid || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagamentos realizados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faturas Totais</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(data.invoices?.recent?.length || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Últimas faturas
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Invoices List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Faturas</CardTitle>
                <CardDescription>Histórico de faturas</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/portal/invoices">
                  Ver todas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {(data.invoices?.recent?.length || 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma fatura encontrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.invoices.recent.map((invoice) => {
                    const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== "paid"
                    return (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            invoice.status === "paid" ? "bg-green-100" :
                            isOverdue ? "bg-red-100" : "bg-yellow-100"
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
                            <p className="font-medium">{formatCurrency(invoice.amount)}</p>
                            <p className="text-sm text-muted-foreground">
                              {invoice.description || `Fatura`}
                            </p>
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
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      <p className="text-sm text-muted-foreground text-center">
        Última atualização: {data.lastUpdated ? formatDateTime(data.lastUpdated) : "Agora"}
      </p>
    </div>
  )
}
