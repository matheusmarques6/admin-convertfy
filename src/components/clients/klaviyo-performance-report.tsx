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
  Package,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"

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

const formatCurrencyCompact = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  if (num >= 1000000) return `R$ ${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `R$ ${(num / 1000).toFixed(1)}K`
  return formatCurrency(num)
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

// ============ MINI BAR CHART COMPONENT ============
const MiniBarChart = ({ data, color }: { data: number[], color: string }) => {
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((value, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm ${color}`}
          style={{ height: `${Math.max((value / max) * 100, 8)}%`, opacity: 0.4 + (i / data.length) * 0.6 }}
        />
      ))}
    </div>
  )
}

// ============ CIRCULAR PROGRESS COMPONENT ============
const CircularProgress = ({
  value,
  size = 120,
  strokeWidth = 8,
  color = '#10b981',
  bgColor = '#27272a'
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  )
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

      if (klaviyoData.success) {
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
          filename: `relatorio-convertfy-${storeName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0a0a0a' },
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
          <div className="w-24 h-24 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-emerald-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold text-white">Gerando Relatório de Performance</h3>
          <p className="text-sm text-zinc-400">{loadingStatus}</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '300ms' }} />
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
  const emailPercent = totalRevenue > 0 ? (emailRevenue / totalRevenue) * 100 : 0

  const smsRevenue = shopifyData?.orders?.smsMarketing?.revenue || 0
  const smsOrders = shopifyData?.orders?.smsMarketing?.orders || 0
  const smsPercent = totalRevenue > 0 ? (smsRevenue / totalRevenue) * 100 : 0

  // CONVERTFY TOTAL = Email + SMS
  const convertfyRevenue = emailRevenue + smsRevenue
  const convertfyOrders = emailOrders + smsOrders
  const convertfyPercent = totalRevenue > 0 ? (convertfyRevenue / totalRevenue) * 100 : 0

  const flowRevenue = reportData.revenue?.flowRevenue || 0
  const campaignRevenue = reportData.revenue?.campaignRevenue || 0

  const recurringRate = shopifyData?.summary?.recurringCustomerRate || 0
  const recurringCustomers = shopifyData?.summary?.returningCustomers || 0
  const totalCustomers = shopifyData?.customers?.totalCustomers || reportData.revenue?.uniqueCustomers || 0

  // Mock data for mini charts (in production, use real time series)
  const revenueChartData = [30, 45, 35, 55, 40, 60, 50, 70, 65, 80, 75, 90]
  const ordersChartData = [12, 18, 15, 22, 20, 28, 25, 35, 30, 40, 38, 45]

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div
      ref={reportRef}
      className={`${isFullscreen ? 'min-h-screen' : ''} text-white`}
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className={`${isFullscreen ? 'max-w-7xl mx-auto px-8 py-6' : ''}`}>
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Relatório de Performance</h1>
              <p className="text-zinc-500 text-sm flex items-center gap-2">
                <Store className="w-4 h-4" />
                {reportData.storeName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
              <Calendar className="w-4 h-4" />
              <span>{getFormattedDateRange()}</span>
            </div>

            {!isUsingSavedData && !isFullscreen && (
              <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-1">
                {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                  <button
                    key={range}
                    onClick={() => handleDateRangeChange(range)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      dateRange === range
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                  </button>
                ))}
              </div>
            )}

            {!isFullscreen && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => loadAllData()}
                  disabled={isLoading}
                  className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 h-10 w-10"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 h-10 w-10"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-4 shadow-lg shadow-emerald-500/20"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span className="ml-2 hidden sm:inline">Exportar PDF</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ============ HERO SECTION - CONVERTFY RESULTS ============ */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-transparent border border-emerald-500/20 p-8 mb-8">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl -ml-32 -mb-32" />

          <div className="relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              {/* Left side - Main result */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                    <Crown className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Resultado Convertfy</p>
                    <p className="text-xs text-zinc-500">Email Marketing + SMS</p>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-5xl lg:text-6xl font-bold text-white mb-2">
                    {formatCurrency(convertfyRevenue)}
                  </p>
                  <p className="text-zinc-400 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {formatNumber(convertfyOrders)} pedidos atribuídos
                  </p>
                </div>

                {/* Breakdown */}
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
                    <Mail className="w-5 h-5 text-violet-400" />
                    <div>
                      <p className="text-sm text-zinc-400">E-mail</p>
                      <p className="text-lg font-bold text-violet-400">{formatCurrencyCompact(emailRevenue)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3">
                    <MessageSquare className="w-5 h-5 text-cyan-400" />
                    <div>
                      <p className="text-sm text-zinc-400">SMS</p>
                      <p className="text-lg font-bold text-cyan-400">{formatCurrencyCompact(smsRevenue)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side - Circular percentage */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <CircularProgress
                    value={convertfyPercent}
                    size={180}
                    strokeWidth={12}
                    color="#10b981"
                    bgColor="#1f1f1f"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-4xl font-bold text-white">{convertfyPercent.toFixed(1)}%</p>
                    <p className="text-sm text-zinc-400">do faturamento</p>
                  </div>
                </div>
                <p className="text-center text-sm text-zinc-500 mt-4 max-w-[180px]">
                  Receita gerada via Convertfy em relação ao faturamento total
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ============ MAIN METRICS GRID ============ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <MiniBarChart data={revenueChartData} color="bg-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrencyCompact(totalRevenue)}</p>
            <p className="text-sm text-zinc-500">Faturamento Total</p>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <ArrowUpRight className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">{formatNumber(totalOrders)} pedidos</span>
            </div>
          </div>

          {/* Email Revenue */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-violet-400" />
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-medium">
                  {formatPercent(emailPercent)}
                </span>
              </div>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrencyCompact(emailRevenue)}</p>
            <p className="text-sm text-zinc-500">Receita E-mail</p>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <Package className="w-3 h-3 text-violet-400" />
              <span className="text-zinc-400">{formatNumber(emailOrders)} pedidos</span>
            </div>
          </div>

          {/* SMS Revenue */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-cyan-400" />
              </div>
              {smsPercent > 0 && (
                <div className="text-right">
                  <span className="inline-flex items-center px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs font-medium">
                    {formatPercent(smsPercent)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatCurrencyCompact(smsRevenue)}</p>
            <p className="text-sm text-zinc-500">Receita SMS</p>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <Package className="w-3 h-3 text-cyan-400" />
              <span className="text-zinc-400">{formatNumber(smsOrders)} pedidos</span>
            </div>
          </div>

          {/* Recurring Rate */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Repeat className="w-5 h-5 text-amber-400" />
              </div>
              <MiniBarChart data={ordersChartData} color="bg-amber-400" />
            </div>
            <p className="text-2xl font-bold text-white mb-1">{formatPercent(recurringRate)}</p>
            <p className="text-sm text-zinc-500">Taxa Recorrência</p>
            <div className="flex items-center gap-1 mt-2 text-xs">
              <Users className="w-3 h-3 text-amber-400" />
              <span className="text-zinc-400">{formatNumber(recurringCustomers)} retornaram</span>
            </div>
          </div>
        </div>

        {/* ============ REVENUE BREAKDOWN ============ */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue by Channel */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                Receita por Canal
              </h3>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-lg">
                Total: {formatCurrencyCompact(convertfyRevenue)}
              </span>
            </div>

            <div className="space-y-4">
              {/* Campaigns Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Send className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Campanhas</p>
                      <p className="text-xs text-zinc-500">{formatCompactNumber(reportData.campaignPerformance?.totalDelivered)} enviados</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-blue-400">{formatCurrencyCompact(campaignRevenue)}</p>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-1000"
                    style={{ width: `${convertfyRevenue > 0 ? (campaignRevenue / convertfyRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Flows Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">Automações</p>
                      <p className="text-xs text-zinc-500">{formatCompactNumber(reportData.flowPerformance?.totalDelivered)} enviados</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-amber-400">{formatCurrencyCompact(flowRevenue)}</p>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-1000"
                    style={{ width: `${convertfyRevenue > 0 ? (flowRevenue / convertfyRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* SMS Bar */}
              {smsRevenue > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">SMS Marketing</p>
                        <p className="text-xs text-zinc-500">{formatNumber(smsOrders)} conversões</p>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-cyan-400">{formatCurrencyCompact(smsRevenue)}</p>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-1000"
                      style={{ width: `${convertfyRevenue > 0 ? (smsRevenue / convertfyRevenue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Performance */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-violet-400" />
                Performance de E-mail
              </h3>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-lg">
                {formatCompactNumber(reportData.emailPerformance?.delivered)} enviados
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center border border-zinc-700/50">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                  <Eye className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-3xl font-bold text-emerald-400 mb-1">{formatPercent(reportData.emailPerformance?.openRate)}</p>
                <p className="text-xs text-zinc-500">Taxa de Abertura</p>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4 text-center border border-zinc-700/50">
                <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
                  <MousePointer className="w-6 h-6 text-violet-400" />
                </div>
                <p className="text-3xl font-bold text-violet-400 mb-1">{formatPercent(reportData.emailPerformance?.clickRate)}</p>
                <p className="text-xs text-zinc-500">Taxa de Clique</p>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4 text-center border border-zinc-700/50">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-blue-400 mb-1">{formatPercent(reportData.emailPerformance?.clickToOpenRate)}</p>
                <p className="text-xs text-zinc-500">CTOR</p>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4 text-center border border-zinc-700/50">
                <div className="w-12 h-12 rounded-xl bg-zinc-600/50 flex items-center justify-center mx-auto mb-3">
                  <Send className="w-6 h-6 text-zinc-400" />
                </div>
                <p className="text-3xl font-bold text-zinc-300 mb-1">{formatCompactNumber(reportData.emailPerformance?.delivered)}</p>
                <p className="text-xs text-zinc-500">Entregues</p>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-zinc-800 text-sm">
              <div className="flex items-center gap-2 text-zinc-500">
                <ArrowDownRight className="w-4 h-4 text-red-400" />
                <span>Bounces: <span className="text-zinc-300">{formatNumber(reportData.emailPerformance?.bounced)}</span></span>
              </div>
              <div className="flex items-center gap-2 text-zinc-500">
                <X className="w-4 h-4 text-amber-400" />
                <span>Descadastros: <span className="text-zinc-300">{formatNumber(reportData.emailPerformance?.unsubscribed)}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* ============ STATS GRID ============ */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {/* Audience */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Audiência
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Total de Contatos</span>
                <span className="font-semibold text-white">{formatCompactNumber(reportData.overview?.totalSubscribers)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Engajados (90d)</span>
                <span className="font-semibold text-emerald-400">{formatCompactNumber(reportData.engagement?.engagedProfiles)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Taxa Engajamento</span>
                <span className="font-semibold text-violet-400">{reportData.engagement?.engagementRate || 0}%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-zinc-400">Listas / Segmentos</span>
                <span className="font-semibold text-white">{reportData.overview?.totalLists || 0} / {reportData.overview?.totalSegments || 0}</span>
              </div>
            </div>
          </div>

          {/* Automations */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Automações
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Flows Ativos</span>
                <span className="font-semibold text-emerald-400">{reportData.automation?.liveFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Flows Rascunho</span>
                <span className="font-semibold text-zinc-400">{reportData.automation?.draftFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Total de Flows</span>
                <span className="font-semibold text-white">{reportData.automation?.totalFlows || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-zinc-400">Cobertura</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-sm font-medium">{reportData.automation?.automationCoverage || 0}%</span>
              </div>
            </div>
          </div>

          {/* Campaigns */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-400" />
              Campanhas
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Enviadas</span>
                <span className="font-semibold text-emerald-400">{reportData.campaigns?.sent || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Agendadas</span>
                <span className="font-semibold text-amber-400">{reportData.campaigns?.scheduled || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-sm text-zinc-400">Rascunhos</span>
                <span className="font-semibold text-zinc-400">{reportData.campaigns?.drafts || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="font-semibold text-white">{reportData.campaigns?.total || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============ TOP FLOWS TABLE ============ */}
        {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Top Automações por Receita
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-xs font-medium text-zinc-500 pb-4 pr-4">#</th>
                    <th className="text-left text-xs font-medium text-zinc-500 pb-4 pr-4">Nome do Flow</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-4 pr-4">Entregues</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-4 pr-4">Abertura</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-4 pr-4">Cliques</th>
                    <th className="text-right text-xs font-medium text-zinc-500 pb-4">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.flowPerformance.flows.slice(0, 8).map((flow, index) => (
                    <tr key={flow.flowId} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-4 pr-4">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-medium ${
                          index < 3 ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-sm text-white font-medium">{flow.name}</td>
                      <td className="py-4 pr-4 text-sm text-right text-zinc-400">{formatCompactNumber(flow.delivered)}</td>
                      <td className="py-4 pr-4 text-sm text-right">
                        <span className="text-emerald-400">{formatPercent(flow.openRate)}</span>
                      </td>
                      <td className="py-4 pr-4 text-sm text-right">
                        <span className="text-violet-400">{formatPercent(flow.clickRate)}</span>
                      </td>
                      <td className="py-4 text-sm text-right font-semibold text-emerald-400">{formatCurrency(flow.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============ SHOPIFY DATA ============ */}
        {shopifyData && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-green-400" />
                Dados da Loja
              </h3>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-lg">
                {shopifyData.shop?.name || shopifyData.storeName}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-green-400" />
                  </div>
                  <p className="text-xs text-zinc-500">Faturamento</p>
                </div>
                <p className="text-xl font-bold text-white">{formatCurrencyCompact(shopifyData.summary?.totalRevenue)}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="text-xs text-zinc-500">Pedidos</p>
                </div>
                <p className="text-xl font-bold text-white">{formatNumber(shopifyData.summary?.totalOrders)}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-violet-400" />
                  </div>
                  <p className="text-xs text-zinc-500">Clientes</p>
                </div>
                <p className="text-xl font-bold text-white">{formatCompactNumber(totalCustomers)}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-xs text-zinc-500">Ticket Médio</p>
                </div>
                <p className="text-xl font-bold text-white">{formatCurrency(avgTicket)}</p>
              </div>
            </div>

            {/* Best Sellers */}
            {shopifyData.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
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
                          <td className="py-3 pr-4">
                            <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                              i < 3 ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-white">{product.title}</td>
                          <td className="py-3 pr-4 text-sm text-right text-zinc-400">{formatNumber(product.quantitySold)}</td>
                          <td className="py-3 text-sm text-right text-green-400 font-medium">{formatCurrency(product.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ FOOTER ============ */}
        <div className="text-center pt-8 border-t border-zinc-800">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm text-zinc-400">
              Relatório gerado por <span className="text-emerald-400 font-semibold">Convertfy</span>
            </p>
          </div>
          <p className="text-xs text-zinc-600">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )

  // ============ RENDER ============
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto" style={{ backgroundColor: '#0a0a0a' }}>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          className="fixed top-6 right-6 z-[60] bg-zinc-900 border-zinc-700 hover:bg-zinc-800 shadow-xl h-10 w-10"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="py-8 px-6">
          <ReportContent />
        </div>
      </div>
    )
  }

  return <ReportContent />
}
