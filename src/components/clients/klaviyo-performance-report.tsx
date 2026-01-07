"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  Users,
  Mail,
  Download,
  Loader2,
  Zap,
  RefreshCw,
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
  Sparkles,
  Maximize2,
  Star,
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
  if (num >= 1000000) return `R$ ${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `R$ ${(num / 1000).toFixed(1)}K`
  return formatCurrency(num)
}

const formatNumber = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR').format(Math.round(num))
}

const formatPercent = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${num.toFixed(2)}%`
}

const formatCompactNumber = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
  return formatNumber(num)
}

// ============ CIRCULAR PROGRESS COMPONENT ============
const CircularProgress = ({
  value,
  label,
  sublabel,
  size = 100,
  strokeWidth = 6,
  color = '#10b981',
}: {
  value: string | number
  label: string
  sublabel?: string
  size?: number
  strokeWidth?: number
  color?: string
}) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(numValue, 100) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1a1a2e"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white">{typeof value === 'number' ? formatPercent(value) : value}</span>
        </div>
      </div>
      <p className="text-xs text-zinc-400 mt-2 text-center font-medium uppercase tracking-wide">{label}</p>
      {sublabel && <p className="text-[10px] text-zinc-500 text-center">{sublabel}</p>}
    </div>
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
  const [mounted, setMounted] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const isUsingSavedData = !!savedReportData

  useEffect(() => {
    setMounted(true)
  }, [])

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const newValue = !prev
      if (newValue) {
        document.body.style.overflow = 'hidden'
      } else {
        document.body.style.overflow = ''
      }
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

  // Load all data
  const loadAllData = useCallback(async (period: DateRange = dateRange) => {
    setIsLoading(true)
    setError(null)
    setLoadingStatus("Conectando às APIs...")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)

    try {
      setLoadingStatus("Buscando dados...")

      const [klaviyoRes, shopifyRes] = await Promise.all([
        fetch(`/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}`, {
          signal: controller.signal
        }),
        fetch(`/api/integrations/shopify/report?store_id=${storeId}&period=${period}`, {
          signal: controller.signal
        }).catch(() => null)
      ])

      clearTimeout(timeoutId)
      setLoadingStatus("Processando...")

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
          margin: [10, 10, 10, 10],
          filename: `relatorio-${storeName.replace(/\s+/g, '-').toLowerCase()}-${getMonthYear()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#0d0d1a',
            logging: false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(element)
        .save()
    } catch (err) {
      console.error("Error exporting PDF:", err)
    } finally {
      setIsExporting(false)
    }
  }

  // Get month/year for header
  const getMonthYear = (): string => {
    if (reportData?.dateRange?.end) {
      const date = new Date(reportData.dateRange.end)
      return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
    }
    return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
  }

  // Get formatted date range
  const getFormattedDateRange = (): string => {
    if (reportData?.dateRange?.start && reportData?.dateRange?.end) {
      const start = new Date(reportData.dateRange.start)
      const end = new Date(reportData.dateRange.end)
      return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    }
    return ''
  }

  // ============ LOADING STATE ============
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-white">Gerando Relatório</h3>
          <p className="text-sm text-zinc-400">{loadingStatus}</p>
        </div>
      </div>
    )
  }

  // ============ ERROR STATE ============
  if (error || !reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-white">Erro ao Carregar</h3>
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
  const emailPercent = totalRevenue > 0 ? (emailRevenue / totalRevenue) * 100 : 0
  const trafficPercent = 100 - emailPercent

  const smsRevenue = shopifyData?.orders?.smsMarketing?.revenue || 0

  const convertfyRevenue = emailRevenue + smsRevenue
  const convertfyPercent = totalRevenue > 0 ? (convertfyRevenue / totalRevenue) * 100 : 0

  const flowRevenue = reportData.revenue?.flowRevenue || 0
  const campaignRevenue = reportData.revenue?.campaignRevenue || 0

  const recurringRate = shopifyData?.summary?.recurringCustomerRate || 0
  const totalLeads = reportData.overview?.totalSubscribers || 0
  const engagedLeads = reportData.engagement?.engagedProfiles || 0
  const newCustomers = shopifyData?.customers?.newCustomersLast30Days || 0
  const returningCustomers = shopifyData?.summary?.returningCustomers || 0

  // ============ REPORT CONTENT ============
  const ReportContent = ({ forPdf = false }: { forPdf?: boolean }) => (
    <div
      ref={forPdf ? undefined : reportRef}
      className="text-white font-sans"
      style={{
        backgroundColor: '#0d0d1a',
        minHeight: forPdf ? 'auto' : undefined,
      }}
    >
      {/* ============ HEADER ============ */}
      <div
        className="text-center py-8 px-6"
        style={{
          background: 'linear-gradient(180deg, #0d0d1a 0%, #12122a 100%)',
        }}
      >
        <div className="flex justify-center gap-1 mb-4">
          {[1,2,3,4].map(i => (
            <Star key={i} className="w-4 h-4 text-white fill-white" />
          ))}
        </div>
        <h1 className="text-2xl font-bold tracking-wider mb-1">{storeName.toUpperCase()}</h1>
        <p className="text-zinc-400 text-sm tracking-widest">{getMonthYear()}</p>
        <p className="text-xs text-zinc-500 mt-3 tracking-[0.2em] uppercase">Apresentação de Resultados</p>
      </div>

      {/* ============ ATTENTION BOX ============ */}
      <div className="mx-6 mb-8">
        <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/50">
          <h3 className="text-amber-400 font-bold text-center mb-3 tracking-wider">ATENÇÃO</h3>
          <p className="text-zinc-400 text-xs text-center leading-relaxed">
            A seguir, apresento os resultados da {storeName} no período de{' '}
            <span className="text-white font-medium">{getFormattedDateRange()}</span>, com o objetivo de fornecer uma análise mensal do crescimento.
            A gestão desses resultados foi realizada pela Agência <span className="text-emerald-400 font-semibold">Convertfy</span>
          </p>
        </div>
      </div>

      {/* ============ CONVERSÃO INDIVIDUAL POR FUNIL ============ */}
      <div className="mx-6 mb-8">
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-center font-bold tracking-wider mb-2">CONVERSÃO INDIVIDUAL POR FUNIL</h3>
          <p className="text-center text-xs text-zinc-500 mb-6">Analisado entre os dias {getFormattedDateRange()}</p>

          <div className="grid grid-cols-3 gap-4">
            <CircularProgress
              value={`${newCustomers}/${returningCustomers}`}
              label="Funil de LTV"
              sublabel="Novos / Retornantes"
              color="#8b5cf6"
            />
            <CircularProgress
              value={parseFloat(reportData.engagement?.engagementRate || '0')}
              label="Crescimento de Leads"
              color="#f59e0b"
            />
            <CircularProgress
              value={recurringRate}
              label="Taxa de Clientes Recorrentes"
              color="#10b981"
            />
          </div>
        </div>
      </div>

      {/* ============ LEADS X ENGAJADOS ============ */}
      <div className="mx-6 mb-8">
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-center font-bold tracking-wider mb-6">LEADS X ENGAJADOS</h3>

          <div className="flex justify-center gap-12">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-5 h-5 text-zinc-400" />
                <span className="text-3xl font-bold">{formatCompactNumber(totalLeads)}</span>
              </div>
              <p className="text-xs text-zinc-500">Total de Leads</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-5 h-5 text-emerald-400" />
                <span className="text-3xl font-bold text-emerald-400">{formatCompactNumber(engagedLeads)}</span>
              </div>
              <p className="text-xs text-zinc-500">Engajados</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ RESULTADOS FINANCEIROS ============ */}
      <div className="mx-6 mb-8">
        <div
          className="rounded-xl p-6"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
        >
          <h3 className="text-center font-bold tracking-wider mb-2">RESULTADOS FINANCEIROS</h3>
          <p className="text-center text-xs text-zinc-500 mb-6">Faturamento {getFormattedDateRange()}</p>

          {/* Main metrics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrencyCompact(totalRevenue)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Faturamento</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full border-2 border-zinc-500 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-zinc-400" />
                </div>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(avgTicket)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Ticket Médio</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full border-2 border-violet-500 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-violet-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-violet-400">{formatCurrencyCompact(emailRevenue)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Faturamento Email</p>
            </div>
          </div>

          {/* Traffic vs Email breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-lg font-bold">{formatPercent(trafficPercent)}</p>
                <p className="text-[10px] text-zinc-500">Tráfego</p>
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center gap-3">
              <Mail className="w-5 h-5 text-violet-400" />
              <div>
                <p className="text-lg font-bold text-violet-400">{formatPercent(emailPercent)}</p>
                <p className="text-[10px] text-zinc-500">Email</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ RESULTADO CONVERTFY ============ */}
      <div className="mx-6 mb-8">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20 p-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-emerald-400" />
            <h3 className="font-bold tracking-wider text-emerald-400">RESULTADO CONVERTFY</h3>
          </div>

          <div className="text-center mb-4">
            <p className="text-4xl font-bold text-white mb-1">{formatCurrency(convertfyRevenue)}</p>
            <p className="text-sm text-zinc-400">{formatPercent(convertfyPercent)} do faturamento total</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-center">
              <Mail className="w-5 h-5 text-violet-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-violet-400">{formatCurrencyCompact(emailRevenue)}</p>
              <p className="text-xs text-zinc-500">E-mail Marketing</p>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-center">
              <MessageSquare className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-cyan-400">{formatCurrencyCompact(smsRevenue)}</p>
              <p className="text-xs text-zinc-500">SMS Marketing</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ PERFORMANCE DE EMAIL ============ */}
      <div className="mx-6 mb-8">
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-center font-bold tracking-wider mb-6">PERFORMANCE DE E-MAIL</h3>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                <Eye className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-emerald-400">{formatPercent(reportData.emailPerformance?.openRate)}</p>
              <p className="text-[10px] text-zinc-500">Abertura</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-2">
                <MousePointer className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-xl font-bold text-violet-400">{formatPercent(reportData.emailPerformance?.clickRate)}</p>
              <p className="text-[10px] text-zinc-500">Clique</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-xl font-bold text-blue-400">{formatPercent(reportData.emailPerformance?.clickToOpenRate)}</p>
              <p className="text-[10px] text-zinc-500">CTOR</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-700/50 flex items-center justify-center mx-auto mb-2">
                <Send className="w-5 h-5 text-zinc-400" />
              </div>
              <p className="text-xl font-bold">{formatCompactNumber(reportData.emailPerformance?.delivered)}</p>
              <p className="text-[10px] text-zinc-500">Enviados</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ RECEITA POR CANAL ============ */}
      <div className="mx-6 mb-8">
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
          <h3 className="text-center font-bold tracking-wider mb-6">RECEITA POR CANAL</h3>

          <div className="space-y-4">
            {/* Campanhas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Send className="w-5 h-5 text-blue-400" />
                  <span className="text-sm">Campanhas</span>
                </div>
                <span className="text-sm font-bold text-blue-400">{formatCurrencyCompact(campaignRevenue)}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                  style={{ width: `${convertfyRevenue > 0 ? (campaignRevenue / convertfyRevenue) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Automações */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <span className="text-sm">Automações</span>
                </div>
                <span className="text-sm font-bold text-amber-400">{formatCurrencyCompact(flowRevenue)}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                  style={{ width: `${convertfyRevenue > 0 ? (flowRevenue / convertfyRevenue) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* SMS */}
            {smsRevenue > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-cyan-400" />
                    <span className="text-sm">SMS</span>
                  </div>
                  <span className="text-sm font-bold text-cyan-400">{formatCurrencyCompact(smsRevenue)}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                    style={{ width: `${convertfyRevenue > 0 ? (smsRevenue / convertfyRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ TOP FLOWS ============ */}
      {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
        <div className="mx-6 mb-8">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
            <h3 className="text-center font-bold tracking-wider mb-6">TOP AUTOMAÇÕES</h3>

            <div className="space-y-3">
              {reportData.flowPerformance.flows.slice(0, 5).map((flow, index) => (
                <div key={flow.flowId} className="flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                    index < 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{flow.name}</p>
                    <p className="text-xs text-zinc-500">{formatPercent(flow.openRate)} abertura</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrencyCompact(flow.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ DADOS DA LOJA ============ */}
      {shopifyData && (
        <div className="mx-6 mb-8">
          <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Store className="w-5 h-5 text-green-400" />
              <h3 className="font-bold tracking-wider">DADOS DA LOJA</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <ShoppingCart className="w-5 h-5 text-blue-400 mx-auto mb-2" />
                <p className="text-xl font-bold">{formatNumber(totalOrders)}</p>
                <p className="text-xs text-zinc-500">Pedidos</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <Users className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                <p className="text-xl font-bold">{formatCompactNumber(shopifyData.customers?.totalCustomers)}</p>
                <p className="text-xs text-zinc-500">Clientes</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <Repeat className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
                <p className="text-xl font-bold text-emerald-400">{formatPercent(recurringRate)}</p>
                <p className="text-xs text-zinc-500">Recorrência</p>
              </div>
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <Package className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                <p className="text-xl font-bold">{formatNumber(shopifyData.products?.activeProducts)}</p>
                <p className="text-xs text-zinc-500">Produtos</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ FOOTER ============ */}
      <div className="text-center py-8 px-6 border-t border-zinc-800">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <p className="text-sm text-zinc-400">
            Relatório gerado por <span className="text-emerald-400 font-semibold">Convertfy</span>
          </p>
        </div>
        <p className="text-xs text-zinc-600">
          {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  )

  // ============ FULLSCREEN MODAL ============
  const FullscreenModal = () => {
    if (!mounted) return null

    return createPortal(
      <div
        className="fixed inset-0 z-[9999] overflow-auto"
        style={{ backgroundColor: '#0d0d1a' }}
      >
        {/* Close button */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          className="fixed top-4 right-4 z-[10000] bg-zinc-900 border-zinc-700 hover:bg-zinc-800 h-10 w-10 shadow-xl"
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Export button */}
        <Button
          onClick={handleExportPDF}
          disabled={isExporting}
          className="fixed top-4 right-16 z-[10000] bg-emerald-600 hover:bg-emerald-700 h-10 px-4 shadow-xl"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="ml-2">PDF</span>
        </Button>

        <div className="max-w-2xl mx-auto py-8">
          <div ref={reportRef}>
            <ReportContent forPdf={false} />
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ============ RENDER ============
  return (
    <>
      {/* Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
          <Calendar className="w-4 h-4" />
          <span>{getFormattedDateRange()}</span>
        </div>

        <div className="flex items-center gap-3">
          {!isUsingSavedData && (
            <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-1">
              {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => handleDateRangeChange(range)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    dateRange === range
                      ? 'bg-emerald-500 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                </button>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => loadAllData()}
            disabled={isLoading}
            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 h-9 w-9"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>

          <Button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="rounded-2xl overflow-hidden border border-zinc-800">
        <div ref={!isFullscreen ? reportRef : undefined}>
          <ReportContent />
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && <FullscreenModal />}
    </>
  )
}
