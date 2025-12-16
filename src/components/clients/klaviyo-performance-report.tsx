"use client"

import { useState, useEffect, useRef } from "react"
import {
  Users,
  Mail,
  Target,
  Download,
  Loader2,
  Zap,
  ListFilter,
  Activity,
  CheckCircle2,
  FileEdit,
  Clock,
  RefreshCw,
  BarChart3,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Calendar,
  DollarSign,
  TrendingUp,
  MousePointerClick,
  AlertCircle,
  Lightbulb,
  PieChart,
  MailOpen,
  Send,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"

interface RevenueTimeSeries {
  date: string
  revenue: number
  orders: number
}

interface KlaviyoReportData {
  success: boolean
  connected: boolean
  storeName: string
  generatedAt: string
  period: string
  dateRange: {
    start: string
    end: string
  }
  account?: {
    currency: string
    currencySymbol: string
    locale: string
    isTestAccount: boolean
  }
  revenue: {
    totalRevenue: number
    klaviyoAttributedRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalOrders: number
    klaviyoAttributedOrders: number
    averageOrderValue: number
    uniqueCustomers: number
    estimatedROI: string
    timeSeries: RevenueTimeSeries[]
  }
  overview: {
    totalSubscribers: number
    totalLists: number
    totalSegments: number
    totalFlows: number
    liveFlows: number
    totalCampaigns: number
    sentCampaigns: number
    totalTemplates: number
  }
  emailPerformance: {
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    openRate: number
    clickRate: number
    clickToOpenRate: number
  }
  campaignPerformance: {
    totalDelivered: number
    totalOpened: number
    totalClicked: number
    avgOpenRate: number
    avgClickRate: number
    totalRevenue: number
    campaigns: Array<{
      campaignId: string
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
      revenue: number
    }>
  }
  flowPerformance: {
    totalDelivered: number
    totalOpened: number
    totalClicked: number
    avgOpenRate: number
    avgClickRate: number
    totalRevenue: number
    flows: Array<{
      flowId: string
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
      revenue: number
    }>
  }
  engagement: {
    engagedProfiles: number
    engagementRate: string
  }
  growth: {
    campaignsLast30Days: number
  }
  automation: {
    totalFlows: number
    liveFlows: number
    draftFlows: number
    automationCoverage: string
  }
  campaigns: {
    total: number
    sent: number
    scheduled: number
    drafts: number
    last30Days: number
    recentCampaigns: Array<{
      id: string
      name: string
      status: string
      sendTime: string | null
      createdAt: string
    }>
  }
  lists: Array<{
    id: string
    name: string
    profileCount: number
    created: string
  }>
  segments: Array<{
    id: string
    name: string
    profileCount: number
    isActive: boolean
    isStarred: boolean
    created: string
  }>
  flows: Array<{
    id: string
    name: string
    status: string
    triggerType: string
    created: string
  }>
  integrations: {
    hasEcommerce: boolean
    hasEmail: boolean
    totalMetrics: number
  }
}

interface KlaviyoPerformanceReportProps {
  storeId: string
  storeName: string
  savedReportData?: KlaviyoReportData | null  // Pass saved data to avoid re-fetching
}

type DateRange = "7d" | "30d" | "90d" | "all"

const formatCurrencyWithCode = (value: number | undefined | null, currency: string = 'BRL', locale: string = 'pt-BR') => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(num)
  } catch {
    // Fallback for invalid currency codes
    return `${currency} ${num.toFixed(2)}`
  }
}

const formatNumber = (value: number | undefined | null) => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR').format(num)
}

const formatPercent = (value: number | undefined | null) => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${num.toFixed(1)}%`
}

export function KlaviyoPerformanceReport({ storeId, storeName, savedReportData }: KlaviyoPerformanceReportProps) {
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(savedReportData || null)
  const [isLoading, setIsLoading] = useState(!savedReportData)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const reportRef = useRef<HTMLDivElement>(null)

  // Track if we're using saved data (disables date range selector)
  const isUsingSavedData = !!savedReportData

  // Get currency from report data, default to BRL
  const currency = reportData?.account?.currency || 'BRL'
  const locale = reportData?.account?.locale || 'pt-BR'

  // Format currency using the account's currency setting
  const formatCurrency = (value: number | undefined | null) => {
    return formatCurrencyWithCode(value, currency, locale)
  }

  useEffect(() => {
    // If we have saved data, use it directly
    if (savedReportData) {
      setReportData(savedReportData)
      setIsLoading(false)
      return
    }
    // Only fetch if no saved data
    loadReportData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dateRange, savedReportData])

  async function loadReportData() {
    setIsLoading(true)
    setError(null)

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout

    try {
      const res = await fetch(`/api/integrations/klaviyo/report?store_id=${storeId}&period=${dateRange}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data = await res.json()

      if (data.success) {
        setReportData(data)
      } else {
        setError(data.error || "Erro ao carregar relatório")
      }
    } catch (err) {
      clearTimeout(timeoutId)
      console.error("Error loading report:", err)
      if (err instanceof Error && err.name === 'AbortError') {
        setError("Tempo limite excedido. O relatório está demorando muito para carregar.")
      } else {
        setError("Erro de conexão ao carregar relatório")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default

      const element = reportRef.current
      if (!element) return

      const opt = {
        margin: 0.3,
        filename: `relatorio-klaviyo-${storeName}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const }
      }

      await html2pdf().set(opt).from(element).save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Ativo</Badge>
      case "draft":
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-xs">Rascunho</Badge>
      case "sent":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Enviado</Badge>
      case "scheduled":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Agendado</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  const getPeriodLabel = () => {
    const now = new Date()
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    return `${months[now.getMonth()].toUpperCase()} ${now.getFullYear()}`
  }

  const getDateRangeLabel = () => {
    const now = new Date()
    const labels: Record<DateRange, string> = {
      "7d": `${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR')}`,
      "30d": `${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR')}`,
      "90d": `${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')} - ${now.toLocaleDateString('pt-BR')}`,
      "all": "Últimos 12 meses",
    }
    return labels[dateRange]
  }

  // Generate simple bar chart for revenue time series
  const renderRevenueChart = () => {
    const timeSeries = reportData?.revenue?.timeSeries || []
    if (timeSeries.length === 0) return null

    const maxRevenue = Math.max(...timeSeries.map(d => d.revenue), 1)
    const displayData = timeSeries.slice(-14) // Show last 14 days

    return (
      <div className="flex items-end gap-1 h-32 mt-4">
        {displayData.map((day, index) => {
          const height = (day.revenue / maxRevenue) * 100
          const date = new Date(day.date)
          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t transition-all hover:from-emerald-400 hover:to-emerald-300"
                style={{ height: `${Math.max(height, 2)}%` }}
                title={`${formatCurrency(day.revenue)} - ${date.toLocaleDateString('pt-BR')}`}
              />
              {index % 2 === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {date.getDate()}/{date.getMonth() + 1}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Carregando relatório de performance...</p>
      </div>
    )
  }

  if (error || !reportData) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Target className="h-12 w-12 text-destructive/70 mb-4" />
          <h3 className="text-lg font-medium text-destructive">Erro ao Carregar Relatório</h3>
          <p className="text-muted-foreground text-center mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadReportData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Calculate insights
  const emailROI = reportData.revenue?.campaignRevenue > 0 ?
    ((reportData.revenue.campaignRevenue / (reportData.emailPerformance?.delivered || 1)) * 1000).toFixed(2) : "0"

  const flowROI = reportData.revenue?.flowRevenue > 0 ?
    ((reportData.revenue.flowRevenue / (reportData.flowPerformance?.totalDelivered || 1)) * 1000).toFixed(2) : "0"

  const totalKlaviyoRevenue = reportData.revenue?.klaviyoAttributedRevenue || 0
  const totalRevenue = reportData.revenue?.totalRevenue || 0
  const revenuePercentage = totalRevenue > 0 ? ((totalKlaviyoRevenue / totalRevenue) * 100).toFixed(1) : "0"

  return (
    <div className="space-y-6">
      {/* Header with Date Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Relatório de Performance</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {getDateRangeLabel()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Selector - hidden when viewing saved data */}
          {!isUsingSavedData && (
            <div className="flex items-center rounded-lg border bg-muted/30 p-1">
              <Button
                variant={dateRange === "7d" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setDateRange("7d")}
              >
                7 Dias
              </Button>
              <Button
                variant={dateRange === "30d" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setDateRange("30d")}
              >
                30 Dias
              </Button>
              <Button
                variant={dateRange === "90d" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setDateRange("90d")}
              >
                90 Dias
              </Button>
              <Button
                variant={dateRange === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setDateRange("all")}
              >
                12 Meses
              </Button>
            </div>
          )}

          {!isUsingSavedData && (
            <Button variant="outline" size="sm" onClick={loadReportData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
          <Button size="sm" onClick={handleExportPDF} disabled={isExporting} className="bg-primary hover:bg-primary/90">
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="space-y-6">
        {/* Period Header */}
        <Card className="border-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-blue-500/10" />
          <CardContent className="py-8 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-sm text-slate-400 uppercase tracking-wider font-medium mb-1">Resultados Financeiros</p>
                <h1 className="text-3xl font-bold">{getPeriodLabel()}</h1>
                <p className="text-slate-400 text-sm mt-2">{reportData.storeName}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {reportData.integrations?.hasEcommerce && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 text-sm py-1 px-3">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    E-commerce Integrado
                  </Badge>
                )}
                {reportData.integrations?.hasEmail && (
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1 text-sm py-1 px-3">
                    <Mail className="h-3.5 w-3.5" />
                    Email Marketing
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Financial KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Revenue */}
          <Card className="border-0 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12" />
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-5 w-5 text-emerald-200" />
                <span className="text-sm text-emerald-200 font-medium">Faturamento Total</span>
              </div>
              <p className="text-3xl font-bold">
                {formatCurrency(reportData.revenue?.totalRevenue || 0)}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3" />
                  {formatNumber(reportData.revenue?.totalOrders || 0)} pedidos
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Klaviyo Revenue */}
          <Card className="border-0 bg-gradient-to-br from-blue-600 to-blue-700 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12" />
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="h-5 w-5 text-blue-200" />
                <span className="text-sm text-blue-200 font-medium">Faturamento Klaviyo</span>
              </div>
              <p className="text-3xl font-bold">
                {formatCurrency(totalKlaviyoRevenue)}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {revenuePercentage}% do total
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ROI */}
          <Card className="border-0 bg-gradient-to-br from-purple-600 to-purple-700 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12" />
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <PieChart className="h-5 w-5 text-purple-200" />
                <span className="text-sm text-purple-200 font-medium">ROI Estimado</span>
              </div>
              <p className="text-3xl font-bold">
                {reportData.revenue?.estimatedROI || 0}%
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  Retorno sobre investimento
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Average Order Value */}
          <Card className="border-0 bg-gradient-to-br from-amber-500 to-amber-600 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12" />
            <CardContent className="pt-6 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="h-5 w-5 text-amber-200" />
                <span className="text-sm text-amber-200 font-medium">Ticket Médio</span>
              </div>
              <p className="text-3xl font-bold">
                {formatCurrency(reportData.revenue?.averageOrderValue || 0)}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {formatNumber(reportData.revenue?.uniqueCustomers || 0)} clientes
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Breakdown Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Campaign Revenue */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10">
                  <Send className="h-4 w-4 text-blue-400" />
                </div>
                Receita de Campanhas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-blue-400">
                    {formatCurrency(reportData.revenue?.campaignRevenue || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatNumber(reportData.campaignPerformance?.totalDelivered || 0)} emails enviados
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">ROI por 1000 enviados</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(Number(emailROI))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Flow Revenue */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Zap className="h-4 w-4 text-amber-400" />
                </div>
                Receita de Automações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-amber-400">
                    {formatCurrency(reportData.revenue?.flowRevenue || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatNumber(reportData.flowPerformance?.totalDelivered || 0)} emails automáticos
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">ROI por 1000 enviados</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(Number(flowROI))}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Chart */}
        {reportData.revenue?.timeSeries && reportData.revenue.timeSeries.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                </div>
                Faturamento Diário
              </CardTitle>
              <CardDescription>Evolução da receita nos últimos {reportData.revenue.timeSeries.length} dias</CardDescription>
            </CardHeader>
            <CardContent>
              {renderRevenueChart()}
            </CardContent>
          </Card>
        )}

        {/* Email Performance Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Delivered */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Send className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatNumber(reportData.emailPerformance?.delivered || 0)}</p>
                  <p className="text-xs text-muted-foreground">Emails Entregues</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Opened */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <MailOpen className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{formatNumber(reportData.emailPerformance?.opened || 0)}</p>
                    <span className="text-sm font-medium text-emerald-400">
                      {formatPercent(reportData.emailPerformance?.openRate || 0)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Taxa de Abertura</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clicked */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <MousePointerClick className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold">{formatNumber(reportData.emailPerformance?.clicked || 0)}</p>
                    <span className="text-sm font-medium text-purple-400">
                      {formatPercent(reportData.emailPerformance?.clickRate || 0)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Taxa de Clique</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bounced/Unsubscribed */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <AlertCircle className="h-5 w-5 text-rose-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold">{formatNumber(reportData.emailPerformance?.bounced || 0)}</p>
                      <p className="text-xs text-muted-foreground">Bounces</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatNumber(reportData.emailPerformance?.unsubscribed || 0)}</p>
                      <p className="text-xs text-muted-foreground">Descadastros</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audience & Engagement Stats */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Users className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatNumber(reportData.overview?.totalSubscribers || 0)}</p>
                  <p className="text-xs text-muted-foreground">Total Contatos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Activity className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatNumber(reportData.engagement?.engagedProfiles || 0)}</p>
                  <p className="text-xs text-muted-foreground">Engajados ({reportData.engagement?.engagementRate || 0}%)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <ListFilter className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{reportData.overview?.totalLists || 0}</p>
                  <p className="text-xs text-muted-foreground">Listas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Target className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{reportData.overview?.totalSegments || 0}</p>
                  <p className="text-xs text-muted-foreground">Segmentos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <Layers className="h-5 w-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{reportData.overview?.totalTemplates || 0}</p>
                  <p className="text-xs text-muted-foreground">Templates</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automation & Campaign Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Automation Health */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Zap className="h-4 w-4 text-amber-400" />
                </div>
                Saúde da Automação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Cobertura de Automação</span>
                  <span className="font-bold text-amber-400">{reportData.automation?.automationCoverage || 0}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
                    style={{ width: `${reportData.automation?.automationCoverage || 0}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-emerald-400">{reportData.automation?.liveFlows || 0}</p>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
                  <FileEdit className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-slate-400">{reportData.automation?.draftFlows || 0}</p>
                  <p className="text-xs text-muted-foreground">Rascunho</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Layers className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-blue-400">{reportData.automation?.totalFlows || 0}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Summary */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10">
                  <Mail className="h-4 w-4 text-purple-400" />
                </div>
                Resumo de Campanhas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm text-muted-foreground">Enviadas</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">{reportData.campaigns?.sent || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-muted-foreground">Agendadas</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-400">{reportData.campaigns?.scheduled || 0}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-4 w-4 text-slate-400" />
                    <span className="text-sm">Rascunhos</span>
                  </div>
                  <span className="font-bold">{reportData.campaigns?.drafts || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-400" />
                    <span className="text-sm">Total de Campanhas</span>
                  </div>
                  <span className="font-bold">{reportData.campaigns?.total || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Strategic Insights */}
        <Card className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <Lightbulb className="h-4 w-4 text-amber-400" />
              </div>
              Insights Estratégicos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Insight 1: Revenue Performance */}
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  {totalKlaviyoRevenue > 0 ? (
                    <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5 text-amber-400" />
                  )}
                  <span className="font-medium">Performance de Receita</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {totalKlaviyoRevenue > 0 ? (
                    <>O email marketing representa <span className="text-emerald-400 font-medium">{revenuePercentage}%</span> do faturamento total. {Number(revenuePercentage) > 20 ? "Excelente performance!" : "Considere aumentar a frequência de campanhas."}</>
                  ) : (
                    "Configure a integração de e-commerce para rastrear a receita gerada pelo email marketing."
                  )}
                </p>
              </div>

              {/* Insight 2: Engagement */}
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  {Number(reportData.engagement?.engagementRate || 0) > 50 ? (
                    <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Activity className="h-5 w-5 text-amber-400" />
                  )}
                  <span className="font-medium">Engajamento da Base</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {Number(reportData.engagement?.engagementRate || 0) > 50 ? (
                    <>Taxa de engajamento de <span className="text-emerald-400 font-medium">{reportData.engagement?.engagementRate}%</span> está acima da média do mercado. Continue segmentando sua base.</>
                  ) : (
                    <>Taxa de engajamento de <span className="text-amber-400 font-medium">{reportData.engagement?.engagementRate}%</span>. Considere criar campanhas de re-engajamento para ativar contatos inativos.</>
                  )}
                </p>
              </div>

              {/* Insight 3: Automation */}
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  {Number(reportData.automation?.automationCoverage || 0) > 70 ? (
                    <Zap className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Zap className="h-5 w-5 text-amber-400" />
                  )}
                  <span className="font-medium">Cobertura de Automação</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {Number(reportData.automation?.automationCoverage || 0) > 70 ? (
                    <><span className="text-emerald-400 font-medium">{reportData.automation?.liveFlows}</span> flows ativos garantem comunicação automatizada consistente. Ótima cobertura!</>
                  ) : (
                    <>Você tem <span className="text-amber-400 font-medium">{reportData.automation?.draftFlows}</span> flows em rascunho. Ative-os para aumentar a receita automatizada.</>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Tables */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhes por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="lists">
              <TabsList className="bg-slate-800/50 p-1">
                <TabsTrigger value="lists" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <ListFilter className="h-3 w-3" />
                  Listas ({reportData.lists?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="segments" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <Target className="h-3 w-3" />
                  Segmentos ({reportData.segments?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="flows" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <Zap className="h-3 w-3" />
                  Flows ({reportData.flows?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="text-xs gap-1 data-[state=active]:bg-slate-700">
                  <Mail className="h-3 w-3" />
                  Campanhas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lists" className="mt-4">
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Nome da Lista</TableHead>
                        <TableHead className="text-slate-400 text-right">Contatos</TableHead>
                        <TableHead className="text-slate-400">Criada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.lists || reportData.lists.length === 0 ? (
                        <TableRow className="border-slate-800">
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            Nenhuma lista encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        reportData.lists.map((list) => (
                          <TableRow key={list.id} className="border-slate-800">
                            <TableCell className="font-medium">{list.name}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-400">
                              {formatNumber(list.profileCount || 0)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(list.created)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="segments" className="mt-4">
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Nome do Segmento</TableHead>
                        <TableHead className="text-slate-400 text-right">Perfis</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-slate-400">Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.segments || reportData.segments.length === 0 ? (
                        <TableRow className="border-slate-800">
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Nenhum segmento encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        reportData.segments.map((segment) => (
                          <TableRow key={segment.id} className="border-slate-800">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {segment.name}
                                {segment.isStarred && (
                                  <span className="text-amber-400">★</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-blue-400">
                              {formatNumber(segment.profileCount || 0)}
                            </TableCell>
                            <TableCell>
                              {segment.isActive ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Ativo</Badge>
                              ) : (
                                <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-xs">Inativo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(segment.created)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="flows" className="mt-4">
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Nome do Flow</TableHead>
                        <TableHead className="text-slate-400">Trigger</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-slate-400">Criado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.flows || reportData.flows.length === 0 ? (
                        <TableRow className="border-slate-800">
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Nenhum flow encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        reportData.flows.map((flow) => (
                          <TableRow key={flow.id} className="border-slate-800">
                            <TableCell className="font-medium">{flow.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs border-slate-600">
                                {flow.triggerType || "Manual"}
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(flow.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(flow.created)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="campaigns" className="mt-4">
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Nome da Campanha</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-slate-400">Data de Envio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.campaigns?.recentCampaigns || reportData.campaigns.recentCampaigns.length === 0 ? (
                        <TableRow className="border-slate-800">
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            Nenhuma campanha encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        reportData.campaigns.recentCampaigns.map((campaign) => (
                          <TableRow key={campaign.id} className="border-slate-800">
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {campaign.sendTime ? formatDate(campaign.sendTime) : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-slate-800 text-sm text-muted-foreground">
          <p>Relatório gerado automaticamente pela plataforma <span className="text-primary font-medium">Convertfy</span></p>
          <p className="mt-1">
            {new Date().toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
