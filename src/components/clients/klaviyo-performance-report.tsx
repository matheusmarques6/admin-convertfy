"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Users,
  Mail,
  Target,
  Download,
  Loader2,
  Zap,
  ListFilter,
  RefreshCw,
  BarChart3,
  ShoppingCart,
  Calendar,
  DollarSign,
  TrendingUp,
  Send,
  Repeat,
  Store,
  XCircle,
  Maximize2,
  X,
  MessageSquare,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"

// ============ INTERFACES ============
interface KlaviyoReportData {
  success: boolean
  connected: boolean
  storeName: string
  generatedAt: string
  period: string
  dateRange: { start: string; end: string }
  account?: { currency: string; currencySymbol: string; locale: string }
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
    timeSeries: Array<{ date: string; revenue: number; orders: number }>
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
    totalRevenue: number
    campaigns: Array<{
      campaignId: string
      name?: string
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
    totalRevenue: number
    flows: Array<{
      flowId: string
      name: string
      status: string
      delivered: number
      opens: number
      clicks: number
      openRate: number
      clickRate: number
      revenue: number
    }>
  }
  engagement: { engagedProfiles: number; engagementRate: string }
  automation: { totalFlows: number; liveFlows: number; draftFlows: number; automationCoverage: string }
  campaigns: {
    total: number
    sent: number
    scheduled: number
    drafts: number
    recentCampaigns: Array<{
      id: string
      name: string
      status: string
      sendTime: string | null
      delivered?: number
      opens?: number
      clicks?: number
      openRate?: number
      clickRate?: number
      revenue?: number
    }>
  }
  lists: Array<{ id: string; name: string; profileCount: number; created: string }>
  segments: Array<{ id: string; name: string; profileCount: number; isActive: boolean; isStarred: boolean; created: string }>
  flows: Array<{ id: string; name: string; status: string; triggerType: string }>
  integrations: { hasEcommerce: boolean; hasEmail?: boolean }
}

interface ShopifyReportData {
  success: boolean
  connected: boolean
  storeName: string
  period: string
  dateRange: { start: string; end: string }
  shop?: { name: string; currency: string; domain: string }
  orders: {
    totalOrders: number
    paidOrders: number
    totalRevenue: number
    paidRevenue: number
    totalDiscounts: number
    totalItems: number
    uniqueCustomers: number
    averageOrderValue: number
    recurringCustomersInPeriod: number
    recurringCustomerRate: number
    bestSellingProducts: Array<{
      productId: number
      title: string
      variantTitle: string
      sku: string
      quantitySold: number
      revenue: number
      ordersCount: number
    }>
    fulfillment: { fulfilled: number; unfulfilled: number; partiallyFulfilled: number }
    smsMarketing?: { revenue: number; orders: number; percentage: number }
  }
  products: { totalProducts: number; activeProducts: number; outOfStockCount: number; totalInventory: number }
  customers: {
    totalCustomers: number
    returningCustomers: number
    newCustomersLast30Days: number
    averageSpentPerCustomer: number
  }
  summary: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalCustomers: number
    recurringCustomerRate: number
    returningCustomers: number
    conversionRate: number
  }
  bestSellingProducts: Array<{
    productId: number
    title: string
    variantTitle: string
    sku: string
    quantitySold: number
    revenue: number
    ordersCount: number
  }>
}

interface KlaviyoPerformanceReportProps {
  storeId: string
  storeName: string
  savedReportData?: KlaviyoReportData | null
}

type DateRange = "7d" | "30d" | "90d" | "all"

// ============ FORMATTERS ============
const formatCurrencyBRL = (value: number | undefined | null, currency = 'BRL') => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(num)
  } catch {
    return `R$ ${num.toFixed(2)}`
  }
}

const formatNum = (value: number | undefined | null) => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR').format(num)
}

const formatPct = (value: number | undefined | null) => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${num.toFixed(1)}%`
}

// ============ MAIN COMPONENT ============
export function KlaviyoPerformanceReport({ storeId, storeName, savedReportData }: KlaviyoPerformanceReportProps) {
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(null)
  const [shopifyData, setShopifyData] = useState<ShopifyReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const isUsingSavedData = !!savedReportData
  const currency = reportData?.account?.currency || shopifyData?.shop?.currency || 'BRL'
  const formatCurrency = (value: number | undefined | null) => formatCurrencyBRL(value, currency)

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const newValue = !prev
      document.body.style.overflow = newValue ? 'hidden' : ''
      return newValue
    })
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) toggleFullscreen()
    }
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isFullscreen, toggleFullscreen])

  // Load data on mount and when dateRange changes
  useEffect(() => {
    if (savedReportData) {
      // Use saved data but still need to load Shopify with same period
      setReportData(savedReportData)
      const savedPeriod = savedReportData.period as DateRange || "30d"
      setDateRange(savedPeriod)
      loadShopifyData(savedPeriod)
      setIsLoading(false)
    } else {
      loadAllData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, savedReportData])

  // Reload when dateRange changes (only if not using saved data)
  useEffect(() => {
    if (!savedReportData && reportData) {
      loadAllData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  async function loadShopifyData(period: DateRange = dateRange) {
    try {
      const res = await fetch(`/api/integrations/shopify/report?store_id=${storeId}&period=${period}`)
      const data = await res.json()
      if (data.success && data.connected) {
        setShopifyData(data)
      }
    } catch (err) {
      console.error("Error loading Shopify data:", err)
    }
  }

  async function loadAllData() {
    setIsLoading(true)
    setError(null)
    setShopifyData(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)

    try {
      const [klaviyoRes, shopifyRes] = await Promise.all([
        fetch(`/api/integrations/klaviyo/report?store_id=${storeId}&period=${dateRange}`, { signal: controller.signal }),
        fetch(`/api/integrations/shopify/report?store_id=${storeId}&period=${dateRange}`, { signal: controller.signal }).catch(() => null)
      ])
      clearTimeout(timeoutId)

      const klaviyoData = await klaviyoRes.json()
      const shopifyDataRes = shopifyRes ? await shopifyRes.json() : null

      if (klaviyoData.success) {
        setReportData(klaviyoData)
        if (shopifyDataRes?.success && shopifyDataRes?.connected) {
          setShopifyData(shopifyDataRes)
        }
      } else {
        setError(klaviyoData.error || "Erro ao carregar relatório")
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        setError("Tempo limite excedido. Tente novamente.")
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

      await html2pdf().set({
        margin: 0.3,
        filename: `relatorio-${storeName}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      }).from(element).save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsExporting(false)
    }
  }

  // Get date label
  const getDateLabel = () => {
    if (reportData?.dateRange?.start && reportData?.dateRange?.end) {
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      const start = reportData.dateRange.start.split('T')[0].split('-')
      const end = reportData.dateRange.end.split('T')[0].split('-')
      return `${start[2]} ${months[parseInt(start[1]) - 1]} - ${end[2]} ${months[parseInt(end[1]) - 1]} ${end[0]}`
    }
    return dateRange === "7d" ? "Últimos 7 dias" : dateRange === "30d" ? "Últimos 30 dias" : dateRange === "90d" ? "Últimos 90 dias" : "Último ano"
  }

  // ============ LOADING STATE ============
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 rounded-full animate-pulse" />
          <Loader2 className="w-8 h-8 text-primary animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium">Carregando Relatório</p>
          <p className="text-sm text-muted-foreground mt-1">Buscando dados do Klaviyo e Shopify...</p>
        </div>
      </div>
    )
  }

  // ============ ERROR STATE ============
  if (error || !reportData) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="text-xl font-semibold text-destructive">Erro ao Carregar</h3>
          <p className="text-muted-foreground text-center mt-2 max-w-md">{error || "Não foi possível carregar os dados"}</p>
          <Button onClick={loadAllData} className="mt-6">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ============ CALCULATIONS ============
  const shopifyRevenue = shopifyData?.summary?.totalRevenue || 0
  const totalRevenue = shopifyRevenue > 0 ? shopifyRevenue : (reportData.revenue?.totalRevenue || 0)
  const emailRevenue = reportData.revenue?.klaviyoAttributedRevenue || 0
  const emailOrders = reportData.revenue?.klaviyoAttributedOrders || 0
  const emailTicketMedio = emailOrders > 0 ? emailRevenue / emailOrders : 0
  const emailPercentage = totalRevenue > 0 ? (emailRevenue / totalRevenue) * 100 : 0
  const smsRevenue = shopifyData?.orders?.smsMarketing?.revenue || 0
  const smsOrders = shopifyData?.orders?.smsMarketing?.orders || 0
  const smsPercentage = shopifyData?.orders?.smsMarketing?.percentage || 0
  const recurringRate = shopifyData?.summary?.recurringCustomerRate || 0
  const recurringCustomers = shopifyData?.summary?.returningCustomers || 0
  const totalOrders = shopifyData?.summary?.totalOrders || reportData.revenue?.totalOrders || 0
  const avgTicket = shopifyData?.summary?.averageOrderValue || reportData.revenue?.averageOrderValue || 0

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div className="space-y-6">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatório de Resultados</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4" />
            {getDateLabel()}
            <span className="text-xs text-muted-foreground/70">• {reportData.storeName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isUsingSavedData && (
            <>
              <div className="flex items-center rounded-lg border bg-card p-1">
                {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                  <Button
                    key={range}
                    variant={dateRange === range ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => setDateRange(range)}
                  >
                    {range === "7d" ? "7 Dias" : range === "30d" ? "30 Dias" : range === "90d" ? "90 Dias" : "1 Ano"}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={loadAllData} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            <Maximize2 className="w-4 h-4 mr-2" />
            Tela Cheia
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* ===== REPORT BODY ===== */}
      <div ref={reportRef} className="space-y-6">

        {/* ===== HERO KPIs ===== */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Faturamento Total */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Faturamento Total</span>
              </div>
              <p className="text-3xl font-bold text-emerald-500">{formatCurrency(totalRevenue)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                <ShoppingCart className="w-3.5 h-3.5 inline mr-1" />
                {formatNum(totalOrders)} pedidos • Ticket médio {formatCurrency(avgTicket)}
              </p>
            </CardContent>
          </Card>

          {/* Receita E-mail Marketing */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20">
                  <Mail className="w-5 h-5 text-purple-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Receita E-mail</span>
                <Badge className="ml-auto bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                  {formatPct(emailPercentage)}
                </Badge>
              </div>
              <p className="text-3xl font-bold text-purple-500">{formatCurrency(emailRevenue)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                <ShoppingCart className="w-3.5 h-3.5 inline mr-1" />
                {formatNum(emailOrders)} pedidos • Ticket médio {formatCurrency(emailTicketMedio)}
              </p>
            </CardContent>
          </Card>

          {/* Receita SMS Marketing */}
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20">
                  <MessageSquare className="w-5 h-5 text-cyan-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Receita SMS</span>
                {smsOrders > 0 && (
                  <Badge className="ml-auto bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                    {formatPct(smsPercentage)}
                  </Badge>
                )}
              </div>
              <p className="text-3xl font-bold text-cyan-500">{formatCurrency(smsRevenue)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                <ShoppingCart className="w-3.5 h-3.5 inline mr-1" />
                {formatNum(smsOrders)} pedidos via SMS
              </p>
            </CardContent>
          </Card>

          {/* Taxa de Recorrência */}
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20">
                  <Repeat className="w-5 h-5 text-amber-500" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Taxa de Recorrência</span>
              </div>
              <p className="text-3xl font-bold text-amber-500">{formatPct(recurringRate)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                <Users className="w-3.5 h-3.5 inline mr-1" />
                {formatNum(recurringCustomers)} clientes recorrentes
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ===== REVENUE BREAKDOWN ===== */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Receita por Canal */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Receita por Canal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campanhas */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Send className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium">Campanhas de E-mail</p>
                    <p className="text-xs text-muted-foreground">{formatNum(reportData.campaignPerformance?.totalDelivered || 0)} enviados</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-blue-500">{formatCurrency(reportData.revenue?.campaignRevenue || 0)}</p>
              </div>

              {/* Automações */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">Automações (Flows)</p>
                    <p className="text-xs text-muted-foreground">{formatNum(reportData.flowPerformance?.totalDelivered || 0)} enviados</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-amber-500">{formatCurrency(reportData.revenue?.flowRevenue || 0)}</p>
              </div>

              {/* SMS */}
              {smsOrders > 0 && (
                <div className="flex items-center justify-between p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <MessageSquare className="w-4 h-4 text-cyan-500" />
                    </div>
                    <div>
                      <p className="font-medium">SMS Marketing</p>
                      <p className="text-xs text-muted-foreground">{formatNum(smsOrders)} conversões</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-cyan-500">{formatCurrency(smsRevenue)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance de E-mail */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                Performance de E-mail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted/30">
                  <p className="text-2xl font-bold">{formatNum(reportData.emailPerformance?.delivered || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Entregues</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-emerald-500/5">
                  <p className="text-2xl font-bold text-emerald-500">{formatPct(reportData.emailPerformance?.openRate || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Taxa Abertura</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-purple-500/5">
                  <p className="text-2xl font-bold text-purple-500">{formatPct(reportData.emailPerformance?.clickRate || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Taxa Clique</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-500/5">
                  <p className="text-2xl font-bold text-blue-500">{formatPct(reportData.emailPerformance?.clickToOpenRate || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">CTOR</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                <span className="text-muted-foreground">Bounces: {formatNum(reportData.emailPerformance?.bounced || 0)}</span>
                <span className="text-muted-foreground">Descadastros: {formatNum(reportData.emailPerformance?.unsubscribed || 0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ===== AUDIENCE & AUTOMATION ===== */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Audiência */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Audiência Klaviyo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total de Contatos</span>
                <span className="font-bold">{formatNum(reportData.overview?.totalSubscribers || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Engajados (90d)</span>
                <span className="font-bold text-emerald-500">{formatNum(reportData.engagement?.engagedProfiles || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Taxa Engajamento</span>
                <span className="font-bold text-purple-500">{reportData.engagement?.engagementRate || 0}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Listas / Segmentos</span>
                <span className="font-bold">{reportData.overview?.totalLists || 0} / {reportData.overview?.totalSegments || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Automações */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Automações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Flows Ativos</span>
                <span className="font-bold text-emerald-500">{reportData.automation?.liveFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Flows Rascunho</span>
                <span className="font-bold text-muted-foreground">{reportData.automation?.draftFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total de Flows</span>
                <span className="font-bold">{reportData.automation?.totalFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Cobertura</span>
                <Badge className="bg-amber-500/20 text-amber-500">{reportData.automation?.automationCoverage || 0}%</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Campanhas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Campanhas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Enviadas</span>
                <span className="font-bold text-emerald-500">{reportData.campaigns?.sent || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agendadas</span>
                <span className="font-bold text-amber-500">{reportData.campaigns?.scheduled || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Rascunhos</span>
                <span className="font-bold text-muted-foreground">{reportData.campaigns?.drafts || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-bold">{reportData.campaigns?.total || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ===== SHOPIFY DATA ===== */}
        {shopifyData && (
          <>
            <Card className="bg-gradient-to-r from-green-500/5 via-transparent to-green-500/5 border-green-500/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/20">
                    <Store className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold">Dados Shopify</p>
                    <p className="text-xs text-muted-foreground">{shopifyData.shop?.name || shopifyData.storeName}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <DollarSign className="w-4 h-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatCurrency(shopifyData.summary?.totalRevenue || 0)}</p>
                      <p className="text-xs text-muted-foreground">Faturamento</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <ShoppingCart className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatNum(shopifyData.summary?.totalOrders || 0)}</p>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Users className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatNum(shopifyData.customers?.totalCustomers || 0)}</p>
                      <p className="text-xs text-muted-foreground">Clientes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatCurrency(shopifyData.summary?.averageOrderValue || 0)}</p>
                      <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Best Sellers */}
            {shopifyData.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Produtos Mais Vendidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead className="text-right">Receita</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                          <TableRow key={product.productId || i}>
                            <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                            <TableCell>{product.title}</TableCell>
                            <TableCell className="text-right">{formatNum(product.quantitySold)}</TableCell>
                            <TableCell className="text-right font-medium text-emerald-500">{formatCurrency(product.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ===== DETAILED TABLES ===== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhes por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="flows">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="flows" className="text-xs">
                  <Zap className="w-3 h-3 mr-1" /> Flows ({reportData.flowPerformance?.flows?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="text-xs">
                  <Send className="w-3 h-3 mr-1" /> Campanhas
                </TabsTrigger>
                <TabsTrigger value="lists" className="text-xs">
                  <ListFilter className="w-3 h-3 mr-1" /> Listas ({reportData.lists?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="segments" className="text-xs">
                  <Target className="w-3 h-3 mr-1" /> Segmentos ({reportData.segments?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="flows" className="mt-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Entregues</TableHead>
                        <TableHead className="text-right">Aberturas</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.flowPerformance?.flows?.length ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum flow com dados</TableCell></TableRow>
                      ) : reportData.flowPerformance.flows.map((flow) => (
                        <TableRow key={flow.flowId}>
                          <TableCell className="font-medium">{flow.name}</TableCell>
                          <TableCell className="text-right">{formatNum(flow.delivered)}</TableCell>
                          <TableCell className="text-right">{formatNum(flow.opens)} <span className="text-xs text-muted-foreground">({formatPct(flow.openRate)})</span></TableCell>
                          <TableCell className="text-right">{formatNum(flow.clicks)} <span className="text-xs text-muted-foreground">({formatPct(flow.clickRate)})</span></TableCell>
                          <TableCell className="text-right font-medium text-emerald-500">{formatCurrency(flow.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="campaigns" className="mt-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Entregues</TableHead>
                        <TableHead className="text-right">Aberturas</TableHead>
                        <TableHead className="text-right">Cliques</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.campaigns?.recentCampaigns?.length ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma campanha</TableCell></TableRow>
                      ) : reportData.campaigns.recentCampaigns.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{formatNum(c.delivered || 0)}</TableCell>
                          <TableCell className="text-right">{formatNum(c.opens || 0)} <span className="text-xs text-muted-foreground">({formatPct(c.openRate || 0)})</span></TableCell>
                          <TableCell className="text-right">{formatNum(c.clicks || 0)} <span className="text-xs text-muted-foreground">({formatPct(c.clickRate || 0)})</span></TableCell>
                          <TableCell className="text-right font-medium text-emerald-500">{formatCurrency(c.revenue || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="lists" className="mt-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Contatos</TableHead>
                        <TableHead>Criada em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.lists?.length ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma lista</TableCell></TableRow>
                      ) : reportData.lists.map((list) => (
                        <TableRow key={list.id}>
                          <TableCell className="font-medium">{list.name}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-500">{formatNum(list.profileCount)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(list.created)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="segments" className="mt-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Perfis</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!reportData.segments?.length ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum segmento</TableCell></TableRow>
                      ) : reportData.segments.map((seg) => (
                        <TableRow key={seg.id}>
                          <TableCell className="font-medium">{seg.name} {seg.isStarred && <span className="text-amber-400 ml-1">★</span>}</TableCell>
                          <TableCell className="text-right font-medium text-blue-500">{formatNum(seg.profileCount)}</TableCell>
                          <TableCell>
                            <Badge className={seg.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}>
                              {seg.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ===== FOOTER ===== */}
        <div className="text-center pt-6 border-t text-sm text-muted-foreground">
          <p>Relatório gerado por <span className="text-primary font-medium">Convertfy</span></p>
          <p className="mt-1">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </div>
  )

  // ============ RENDER ============
  return (
    <>
      {!isFullscreen && <ReportContent />}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto p-6">
          <Button variant="outline" size="icon" onClick={toggleFullscreen} className="fixed top-4 right-4 z-[60] bg-background/80 backdrop-blur-sm shadow-lg">
            <X className="w-5 h-5" />
          </Button>
          <div className="max-w-7xl mx-auto">
            <ReportContent />
          </div>
        </div>
      )}
    </>
  )
}
