"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Users,
  Mail,
  Download,
  Loader2,
  Zap,
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
  X,
  MessageSquare,
  Eye,
  MousePointer,
  ArrowUpRight,
  Package,
  Percent,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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
const formatCurrency = (value: number | undefined | null, currency = 'BRL'): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num)
  } catch {
    return `R$ ${num.toFixed(2)}`
  }
}

const formatNumber = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR').format(Math.round(num))
}

const formatPercent = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${num.toFixed(1)}%`
}

const formatCompactNumber = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return formatNumber(num)
}

// ============ MAIN COMPONENT ============
export function KlaviyoPerformanceReport({ storeId, storeName, savedReportData }: KlaviyoPerformanceReportProps) {
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(null)
  const [shopifyData, setShopifyData] = useState<ShopifyReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState<string>("Iniciando...")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const isUsingSavedData = !!savedReportData

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

  // Load all data synchronously
  const loadAllData = useCallback(async (period: DateRange = dateRange) => {
    setIsLoading(true)
    setError(null)
    setLoadingStatus("Conectando às APIs...")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)

    try {
      // Load both APIs in parallel and wait for both to complete
      setLoadingStatus("Buscando dados do Klaviyo e Shopify...")

      const [klaviyoRes, shopifyRes] = await Promise.all([
        fetch(`/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}`, {
          signal: controller.signal
        }),
        fetch(`/api/integrations/shopify/report?store_id=${storeId}&period=${period}`, {
          signal: controller.signal
        }).catch(() => null)
      ])

      clearTimeout(timeoutId)
      setLoadingStatus("Processando dados...")

      const [klaviyoData, shopifyDataRes] = await Promise.all([
        klaviyoRes.json(),
        shopifyRes ? shopifyRes.json() : null
      ])

      // Set all data at once to avoid desync
      if (klaviyoData.success) {
        // Batch state updates
        setReportData(klaviyoData)
        setShopifyData(shopifyDataRes?.success && shopifyDataRes?.connected ? shopifyDataRes : null)
        setError(null)
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
      setLoadingStatus("")
    }
  }, [storeId, dateRange])

  // Load data on mount
  useEffect(() => {
    if (savedReportData) {
      const savedPeriod = savedReportData.period as DateRange || "30d"
      setDateRange(savedPeriod)
      setReportData(savedReportData)
      // Load Shopify data with same period
      loadAllData(savedPeriod)
    } else {
      loadAllData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, savedReportData])

  // Handle date range change
  const handleDateRangeChange = (newRange: DateRange) => {
    if (newRange !== dateRange && !isUsingSavedData) {
      setDateRange(newRange)
      loadAllData(newRange)
    }
  }

  // Export PDF
  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return

    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default
      const element = reportRef.current

      await html2pdf()
        .set({
          margin: 10,
          filename: `relatorio-${storeName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#09090b' },
          jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
        })
        .from(element)
        .save()
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsExporting(false)
    }
  }

  // Get formatted date range
  const getFormattedDateRange = (): string => {
    if (reportData?.dateRange?.start && reportData?.dateRange?.end) {
      const start = new Date(reportData.dateRange.start)
      const end = new Date(reportData.dateRange.end)
      return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    }
    const labels: Record<DateRange, string> = {
      '7d': 'Últimos 7 dias',
      '30d': 'Últimos 30 dias',
      '90d': 'Últimos 90 dias',
      'all': 'Último ano'
    }
    return labels[dateRange]
  }

  // ============ LOADING STATE ============
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-white">Gerando Relatório</h3>
          <p className="text-sm text-zinc-400">{loadingStatus}</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-150" />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-300" />
          </div>
        </div>
      </div>
    )
  }

  // ============ ERROR STATE ============
  if (error || !reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-500" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-white">Erro ao Carregar</h3>
          <p className="text-sm text-zinc-400 max-w-md">{error || "Não foi possível carregar os dados"}</p>
        </div>
        <Button onClick={() => loadAllData()} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar Novamente
        </Button>
      </div>
    )
  }

  // ============ DATA CALCULATIONS ============
  const shopifyRevenue = shopifyData?.summary?.totalRevenue || 0
  const totalRevenue = shopifyRevenue > 0 ? shopifyRevenue : (reportData.revenue?.totalRevenue || 0)
  const totalOrders = shopifyData?.summary?.totalOrders || reportData.revenue?.totalOrders || 0
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const emailRevenue = reportData.revenue?.klaviyoAttributedRevenue || 0
  const emailOrders = reportData.revenue?.klaviyoAttributedOrders || 0
  const emailTicket = emailOrders > 0 ? emailRevenue / emailOrders : 0
  const emailPercent = totalRevenue > 0 ? (emailRevenue / totalRevenue) * 100 : 0

  const smsRevenue = shopifyData?.orders?.smsMarketing?.revenue || 0
  const smsOrders = shopifyData?.orders?.smsMarketing?.orders || 0
  const smsPercent = shopifyData?.orders?.smsMarketing?.percentage || 0

  const flowRevenue = reportData.revenue?.flowRevenue || 0
  const campaignRevenue = reportData.revenue?.campaignRevenue || 0

  const recurringRate = shopifyData?.summary?.recurringCustomerRate || 0
  const recurringCustomers = shopifyData?.summary?.returningCustomers || 0
  const totalCustomers = shopifyData?.customers?.totalCustomers || reportData.revenue?.uniqueCustomers || 0

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div
      ref={reportRef}
      className={`${isFullscreen ? 'min-h-screen bg-zinc-950' : ''} text-white`}
      style={{ backgroundColor: '#09090b' }}
    >
      {/* Header */}
      <div className={`${isFullscreen ? 'px-8 py-6' : 'mb-6'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Relatório de Performance</h1>
                <p className="text-zinc-400 text-sm">{reportData.storeName}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-sm text-zinc-400 bg-zinc-800/50 px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4" />
              <span>{getFormattedDateRange()}</span>
            </div>

            {!isUsingSavedData && !isFullscreen && (
              <div className="flex items-center rounded-lg bg-zinc-800/50 p-1">
                {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                  <button
                    key={range}
                    onClick={() => handleDateRangeChange(range)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      dateRange === range
                        ? 'bg-emerald-500 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                  </button>
                ))}
              </div>
            )}

            {!isFullscreen && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAllData()}
                  disabled={isLoading}
                  className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span className="ml-2">Exportar PDF</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Hero KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border border-emerald-500/20 p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-sm text-zinc-400">Faturamento Total</span>
              </div>
              <p className="text-3xl font-bold text-emerald-400 mb-2">{formatCurrency(totalRevenue)}</p>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <ShoppingCart className="w-4 h-4" />
                <span>{formatNumber(totalOrders)} pedidos</span>
                <span className="text-zinc-600">•</span>
                <span>Ticket {formatCurrency(avgTicket)}</span>
              </div>
            </div>
          </div>

          {/* Email Revenue */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/5 border border-violet-500/20 p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-violet-400" />
                </div>
                <span className="text-sm text-zinc-400">Receita E-mail</span>
                <Badge className="ml-auto bg-violet-500/20 text-violet-300 border-0 text-xs">
                  {formatPercent(emailPercent)}
                </Badge>
              </div>
              <p className="text-3xl font-bold text-violet-400 mb-2">{formatCurrency(emailRevenue)}</p>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Package className="w-4 h-4" />
                <span>{formatNumber(emailOrders)} pedidos</span>
                <span className="text-zinc-600">•</span>
                <span>Ticket {formatCurrency(emailTicket)}</span>
              </div>
            </div>
          </div>

          {/* SMS Revenue */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/5 border border-cyan-500/20 p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-cyan-400" />
                </div>
                <span className="text-sm text-zinc-400">Receita SMS</span>
                {smsPercent > 0 && (
                  <Badge className="ml-auto bg-cyan-500/20 text-cyan-300 border-0 text-xs">
                    {formatPercent(smsPercent)}
                  </Badge>
                )}
              </div>
              <p className="text-3xl font-bold text-cyan-400 mb-2">{formatCurrency(smsRevenue)}</p>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Package className="w-4 h-4" />
                <span>{formatNumber(smsOrders)} pedidos via SMS</span>
              </div>
            </div>
          </div>

          {/* Recurring Rate */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20 p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Repeat className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-sm text-zinc-400">Taxa Recorrência</span>
              </div>
              <p className="text-3xl font-bold text-amber-400 mb-2">{formatPercent(recurringRate)}</p>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Users className="w-4 h-4" />
                <span>{formatNumber(recurringCustomers)} clientes retornaram</span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue by Channel */}
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              Receita por Canal
            </h3>

            <div className="space-y-4">
              {/* Campaigns */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Send className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Campanhas</p>
                    <p className="text-sm text-zinc-500">{formatCompactNumber(reportData.campaignPerformance?.totalDelivered)} enviados</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-blue-400">{formatCurrency(campaignRevenue)}</p>
              </div>

              {/* Flows */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Automações</p>
                    <p className="text-sm text-zinc-500">{formatCompactNumber(reportData.flowPerformance?.totalDelivered)} enviados</p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-amber-400">{formatCurrency(flowRevenue)}</p>
              </div>

              {/* SMS */}
              {smsRevenue > 0 && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">SMS Marketing</p>
                      <p className="text-sm text-zinc-500">{formatNumber(smsOrders)} conversões</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-cyan-400">{formatCurrency(smsRevenue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Email Performance */}
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Mail className="w-5 h-5 text-violet-400" />
              Performance de E-mail
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-800/50 text-center">
                <div className="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center mx-auto mb-2">
                  <Send className="w-5 h-5 text-zinc-400" />
                </div>
                <p className="text-2xl font-bold text-white">{formatCompactNumber(reportData.emailPerformance?.delivered)}</p>
                <p className="text-xs text-zinc-500 mt-1">Entregues</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                  <Eye className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold text-emerald-400">{formatPercent(reportData.emailPerformance?.openRate)}</p>
                <p className="text-xs text-zinc-500 mt-1">Taxa de Abertura</p>
              </div>

              <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 text-center">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center mx-auto mb-2">
                  <MousePointer className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-2xl font-bold text-violet-400">{formatPercent(reportData.emailPerformance?.clickRate)}</p>
                <p className="text-xs text-zinc-500 mt-1">Taxa de Clique</p>
              </div>

              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                  <Percent className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-2xl font-bold text-blue-400">{formatPercent(reportData.emailPerformance?.clickToOpenRate)}</p>
                <p className="text-xs text-zinc-500 mt-1">CTOR</p>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-zinc-800 text-sm">
              <span className="text-zinc-500">Bounces: <span className="text-zinc-400">{formatNumber(reportData.emailPerformance?.bounced)}</span></span>
              <span className="text-zinc-500">Descadastros: <span className="text-zinc-400">{formatNumber(reportData.emailPerformance?.unsubscribed)}</span></span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Audience */}
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Audiência
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Total de Contatos</span>
                <span className="font-semibold text-white">{formatCompactNumber(reportData.overview?.totalSubscribers)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Engajados (90d)</span>
                <span className="font-semibold text-emerald-400">{formatCompactNumber(reportData.engagement?.engagedProfiles)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Taxa Engajamento</span>
                <span className="font-semibold text-violet-400">{reportData.engagement?.engagementRate || 0}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Listas / Segmentos</span>
                <span className="font-semibold text-white">{reportData.overview?.totalLists || 0} / {reportData.overview?.totalSegments || 0}</span>
              </div>
            </div>
          </div>

          {/* Automations */}
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Automações
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Flows Ativos</span>
                <span className="font-semibold text-emerald-400">{reportData.automation?.liveFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Flows Rascunho</span>
                <span className="font-semibold text-zinc-400">{reportData.automation?.draftFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Total de Flows</span>
                <span className="font-semibold text-white">{reportData.automation?.totalFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Cobertura</span>
                <Badge className="bg-amber-500/20 text-amber-300 border-0">{reportData.automation?.automationCoverage || 0}%</Badge>
              </div>
            </div>
          </div>

          {/* Campaigns */}
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-400" />
              Campanhas
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Enviadas</span>
                <span className="font-semibold text-emerald-400">{reportData.campaigns?.sent || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Agendadas</span>
                <span className="font-semibold text-amber-400">{reportData.campaigns?.scheduled || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Rascunhos</span>
                <span className="font-semibold text-zinc-400">{reportData.campaigns?.drafts || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-500">Total</span>
                <span className="font-semibold text-white">{reportData.campaigns?.total || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Shopify Data */}
        {shopifyData && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Store className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Dados Shopify</h3>
                <p className="text-sm text-zinc-500">{shopifyData.shop?.name || shopifyData.storeName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatCurrency(shopifyData.summary?.totalRevenue)}</p>
                    <p className="text-xs text-zinc-500">Faturamento</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatNumber(shopifyData.summary?.totalOrders)}</p>
                    <p className="text-xs text-zinc-500">Pedidos</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatCompactNumber(totalCustomers)}</p>
                    <p className="text-xs text-zinc-500">Clientes</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">{formatCurrency(shopifyData.summary?.averageOrderValue)}</p>
                    <p className="text-xs text-zinc-500">Ticket Médio</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Best Sellers */}
            {shopifyData.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6">
                <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Produtos Mais Vendidos
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-xs font-medium text-zinc-500 pb-3 pr-4">#</th>
                        <th className="text-left text-xs font-medium text-zinc-500 pb-3 pr-4">Produto</th>
                        <th className="text-right text-xs font-medium text-zinc-500 pb-3 pr-4">Qtd.</th>
                        <th className="text-right text-xs font-medium text-zinc-500 pb-3">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                        <tr key={product.productId || i} className="border-b border-zinc-800/50 last:border-0">
                          <td className="py-3 pr-4 text-sm text-zinc-500">{i + 1}</td>
                          <td className="py-3 pr-4 text-sm text-white font-medium">{product.title}</td>
                          <td className="py-3 pr-4 text-sm text-right text-zinc-400">{formatNumber(product.quantitySold)}</td>
                          <td className="py-3 text-sm text-right text-emerald-400 font-medium">{formatCurrency(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Flows */}
        {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 p-6 mb-8">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Performance dos Flows
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 pb-3 pr-4">Nome</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-3 pr-4">Entregues</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-3 pr-4">Abertura</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-3 pr-4">Cliques</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-3">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.flowPerformance.flows.slice(0, 10).map((flow) => (
                    <tr key={flow.flowId} className="border-b border-zinc-800/50 last:border-0">
                      <td className="py-3 pr-4 text-sm text-white font-medium">{flow.name}</td>
                      <td className="py-3 pr-4 text-sm text-right text-zinc-400">{formatCompactNumber(flow.delivered)}</td>
                      <td className="py-3 pr-4 text-sm text-right text-emerald-400">{formatPercent(flow.openRate)}</td>
                      <td className="py-3 pr-4 text-sm text-right text-violet-400">{formatPercent(flow.clickRate)}</td>
                      <td className="py-3 text-sm text-right text-emerald-400 font-medium">{formatCurrency(flow.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-6 border-t border-zinc-800">
          <p className="text-sm text-zinc-500">
            Relatório gerado por <span className="text-emerald-400 font-medium">Convertfy</span>
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )

  // ============ RENDER ============
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto" style={{ backgroundColor: '#09090b' }}>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          className="fixed top-4 right-4 z-[60] bg-zinc-800 border-zinc-700 hover:bg-zinc-700 shadow-xl"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="max-w-7xl mx-auto py-8 px-6">
          <ReportContent />
        </div>
      </div>
    )
  }

  return <ReportContent />
}
