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
  XCircle,
  X,
  MessageSquare,
  Eye,
  MousePointer,
  Package,
  Target,
  Sparkles,
  Maximize2,
  BarChart3,
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
const formatCurrency = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(num)
}

const formatCurrencyCompact = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  if (num >= 1000000) return `R$ ${(num / 1000000).toFixed(2)}M`
  if (num >= 1000) return `R$ ${(num / 1000).toFixed(2)}K`
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

// ============ MAIN COMPONENT ============
export function KlaviyoPerformanceReport({ storeId, storeName, savedReportData }: KlaviyoPerformanceReportProps) {
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(null)
  const [shopifyData, setShopifyData] = useState<ShopifyReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState("Iniciando...")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      document.body.style.overflow = !prev ? 'hidden' : ''
      return !prev
    })
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) toggleFullscreen() }
    window.addEventListener('keydown', handleEscape)
    return () => { window.removeEventListener('keydown', handleEscape); document.body.style.overflow = '' }
  }, [isFullscreen, toggleFullscreen])

  const loadAllData = useCallback(async (period: DateRange = dateRange) => {
    setIsLoading(true)
    setError(null)
    setLoadingStatus("Conectando às APIs...")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 180000)

    try {
      setLoadingStatus("Buscando dados do Klaviyo e Shopify...")
      const [klaviyoRes, shopifyRes] = await Promise.all([
        fetch(`/api/integrations/klaviyo/report?store_id=${storeId}&period=${period}`, { signal: controller.signal }),
        fetch(`/api/integrations/shopify/report?store_id=${storeId}&period=${period}`, { signal: controller.signal }).catch(() => null)
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
      setError(err instanceof Error && err.name === 'AbortError' ? "Tempo limite excedido." : "Erro de conexão")
    } finally {
      setIsLoading(false)
      setLoadingStatus("")
    }
  }, [storeId, dateRange])

  useEffect(() => {
    if (savedReportData) {
      setDateRange(savedReportData.period as DateRange || "30d")
      setReportData(savedReportData)
      loadAllData(savedReportData.period as DateRange || "30d")
    } else {
      loadAllData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, savedReportData])

  const handleDateRangeChange = (newRange: DateRange) => {
    if (newRange !== dateRange && !savedReportData) {
      setDateRange(newRange)
      loadAllData(newRange)
    }
  }

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return
    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `relatorio-${storeName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#18181b' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(reportRef.current).save()
    } catch (err) {
      console.error("Error exporting PDF:", err)
    } finally {
      setIsExporting(false)
    }
  }

  const getFormattedDateRange = () => {
    if (reportData?.dateRange?.start && reportData?.dateRange?.end) {
      const start = new Date(reportData.dateRange.start)
      const end = new Date(reportData.dateRange.end)
      return `${start.toLocaleDateString('pt-BR')} - ${end.toLocaleDateString('pt-BR')}`
    }
    return ''
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin" />
          <Sparkles className="w-8 h-8 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white">Gerando Relatório</h3>
          <p className="text-sm text-zinc-400">{loadingStatus}</p>
        </div>
      </div>
    )
  }

  // Error State
  if (error || !reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <XCircle className="w-16 h-16 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white">Erro ao Carregar</h3>
          <p className="text-sm text-zinc-400">{error}</p>
        </div>
        <Button onClick={() => loadAllData()}><RefreshCw className="w-4 h-4 mr-2" />Tentar Novamente</Button>
      </div>
    )
  }

  // ============ DATA CALCULATIONS ============
  const totalRevenue = shopifyData?.summary?.totalRevenue || reportData.revenue?.totalRevenue || 0
  const totalOrders = shopifyData?.summary?.totalOrders || reportData.revenue?.totalOrders || 0
  const avgTicket = shopifyData?.summary?.averageOrderValue || (totalOrders > 0 ? totalRevenue / totalOrders : 0)
  const totalCustomers = shopifyData?.customers?.totalCustomers || reportData.revenue?.uniqueCustomers || 0

  const emailRevenue = reportData.revenue?.klaviyoAttributedRevenue || 0
  const emailOrders = reportData.revenue?.klaviyoAttributedOrders || 0
  const emailPercent = totalRevenue > 0 ? (emailRevenue / totalRevenue) * 100 : 0

  const smsRevenue = shopifyData?.orders?.smsMarketing?.revenue || 0
  const smsOrders = shopifyData?.orders?.smsMarketing?.orders || 0
  const smsPercent = totalRevenue > 0 ? (smsRevenue / totalRevenue) * 100 : 0

  const convertfyRevenue = emailRevenue + smsRevenue
  const convertfyOrders = emailOrders + smsOrders
  const convertfyPercent = totalRevenue > 0 ? (convertfyRevenue / totalRevenue) * 100 : 0

  const flowRevenue = reportData.revenue?.flowRevenue || 0
  const campaignRevenue = reportData.revenue?.campaignRevenue || 0

  const recurringRate = shopifyData?.summary?.recurringCustomerRate || 0
  const recurringCustomers = shopifyData?.summary?.returningCustomers || 0
  const newCustomers = shopifyData?.customers?.newCustomersLast30Days || 0

  const totalLeads = reportData.overview?.totalSubscribers || 0
  const engagedLeads = reportData.engagement?.engagedProfiles || 0
  const engagementRate = parseFloat(reportData.engagement?.engagementRate || '0')

  const openRate = reportData.emailPerformance?.openRate || 0
  const clickRate = reportData.emailPerformance?.clickRate || 0
  const ctor = reportData.emailPerformance?.clickToOpenRate || 0
  const delivered = reportData.emailPerformance?.delivered || 0
  const bounced = reportData.emailPerformance?.bounced || 0
  const unsubscribed = reportData.emailPerformance?.unsubscribed || 0
  const bounceRate = delivered > 0 ? (bounced / delivered) * 100 : 0

  const liveFlows = reportData.automation?.liveFlows || 0
  const totalFlows = reportData.automation?.totalFlows || 0
  const sentCampaigns = reportData.campaigns?.sent || 0

  // ============ CARD STYLES ============
  const cardBase = "bg-zinc-900/80 border border-zinc-800/60 rounded-xl p-5 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-zinc-900/50 hover:border-zinc-700/60"
  const cardSmall = "bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-4 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-zinc-900/50 hover:border-zinc-700/60"

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div ref={reportRef} className="bg-zinc-900 text-white p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-800/60">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <BarChart3 className="w-7 h-7 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{storeName}</h1>
            <p className="text-sm text-zinc-500">{getFormattedDateRange()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-500">Relatório Convertfy</span>
        </div>
      </div>

      {/* Hero - Resultado Convertfy */}
      <div className={`${cardBase} !p-6 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/20 border-emerald-500/20`}>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <h2 className="text-base font-semibold text-white">Resultado Convertfy (Email + SMS)</h2>
        </div>
        <div className="grid grid-cols-4 gap-8">
          <div>
            <p className="text-3xl font-bold text-white tracking-tight">{formatCurrency(convertfyRevenue)}</p>
            <p className="text-sm text-zinc-500 mt-1">Receita Atribuída</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-emerald-500 tracking-tight">{formatPercent(convertfyPercent)}</p>
            <p className="text-sm text-zinc-500 mt-1">do Faturamento Total</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white tracking-tight">{formatNumber(convertfyOrders)}</p>
            <p className="text-sm text-zinc-500 mt-1">Pedidos Atribuídos</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#27272a" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="34" fill="none" stroke="#10b981" strokeWidth="6"
                  strokeDasharray={`${Math.min(convertfyPercent, 100) * 2.136} 213.6`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{convertfyPercent.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid - Row 1 */}
      <div className="grid grid-cols-4 gap-4">
        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrencyCompact(totalRevenue)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Faturamento Total</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Mail className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrencyCompact(emailRevenue)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Receita Email</p>
          <p className="text-xs text-zinc-600 mt-0.5">{formatPercent(emailPercent)} do total</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrencyCompact(smsRevenue)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Receita SMS</p>
          <p className="text-xs text-zinc-600 mt-0.5">{formatPercent(smsPercent)} do total</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(avgTicket)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Ticket Médio</p>
        </div>
      </div>

      {/* Metrics Grid - Row 2 */}
      <div className="grid grid-cols-4 gap-4">
        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Package className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(totalOrders)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Total de Pedidos</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Users className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(totalCustomers)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Total de Clientes</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Repeat className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-500">{formatPercent(recurringRate)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Taxa Recorrência</p>
          <p className="text-xs text-zinc-600 mt-0.5">{formatNumber(recurringCustomers)} retornaram</p>
        </div>

        <div className={cardSmall}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(newCustomers)}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">Novos Clientes</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Revenue Breakdown */}
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Receita por Canal</h3>
          </div>
          <div className="space-y-5">
            {/* Campaigns */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-400">Campanhas</span>
                </div>
                <span className="text-sm font-semibold text-white">{formatCurrencyCompact(campaignRevenue)}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                  style={{ width: `${convertfyRevenue > 0 ? Math.min((campaignRevenue / convertfyRevenue) * 100, 100) : 0}%` }} />
              </div>
            </div>
            {/* Flows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-400">Automações (Flows)</span>
                </div>
                <span className="text-sm font-semibold text-white">{formatCurrencyCompact(flowRevenue)}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                  style={{ width: `${convertfyRevenue > 0 ? Math.min((flowRevenue / convertfyRevenue) * 100, 100) : 0}%` }} />
              </div>
            </div>
            {/* SMS */}
            {smsRevenue > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">SMS Marketing</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{formatCurrencyCompact(smsRevenue)}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                    style={{ width: `${convertfyRevenue > 0 ? Math.min((smsRevenue / convertfyRevenue) * 100, 100) : 0}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800/60 flex justify-between">
            <span className="text-sm text-zinc-500">Total Convertfy</span>
            <span className="text-sm font-bold text-emerald-500">{formatCurrency(convertfyRevenue)}</span>
          </div>
        </div>

        {/* Email Performance */}
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Mail className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Performance de Email</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center transition-all duration-200 hover:bg-zinc-800/70">
              <Eye className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{formatPercent(openRate)}</p>
              <p className="text-xs text-zinc-500 mt-1">Taxa Abertura</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center transition-all duration-200 hover:bg-zinc-800/70">
              <MousePointer className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{formatPercent(clickRate)}</p>
              <p className="text-xs text-zinc-500 mt-1">Taxa Clique</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center transition-all duration-200 hover:bg-zinc-800/70">
              <Target className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{formatPercent(ctor)}</p>
              <p className="text-xs text-zinc-500 mt-1">CTOR</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4 text-center transition-all duration-200 hover:bg-zinc-800/70">
              <Send className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{formatNumber(delivered)}</p>
              <p className="text-xs text-zinc-500 mt-1">Entregues</p>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-xs text-zinc-600">
            <span>Bounces: {formatNumber(bounced)} ({formatPercent(bounceRate)})</span>
            <span>Descadastros: {formatNumber(unsubscribed)}</span>
          </div>
        </div>
      </div>

      {/* Three Column Stats */}
      <div className="grid grid-cols-3 gap-4">
        {/* Audience */}
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Users className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Audiência</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Total de Contatos</span>
              <span className="text-sm font-semibold text-white">{formatNumber(totalLeads)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Engajados (90d)</span>
              <span className="text-sm font-semibold text-emerald-500">{formatNumber(engagedLeads)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-500">Taxa Engajamento</span>
              <span className="text-sm font-semibold text-white">{formatPercent(engagementRate)}</span>
            </div>
          </div>
        </div>

        {/* Automations */}
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Zap className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Automações</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Flows Ativos</span>
              <span className="text-sm font-semibold text-emerald-500">{liveFlows}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Total de Flows</span>
              <span className="text-sm font-semibold text-white">{totalFlows}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-500">Receita Flows</span>
              <span className="text-sm font-semibold text-white">{formatCurrencyCompact(flowRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Campaigns */}
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Send className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Campanhas</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Enviadas</span>
              <span className="text-sm font-semibold text-emerald-500">{sentCampaigns}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800/60">
              <span className="text-sm text-zinc-500">Entregues</span>
              <span className="text-sm font-semibold text-white">{formatNumber(reportData.campaignPerformance?.totalDelivered)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-500">Receita</span>
              <span className="text-sm font-semibold text-white">{formatCurrencyCompact(campaignRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Flows Table */}
      {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Zap className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Top Automações por Receita</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-left">#</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-left">Nome</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Entregues</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Abertura</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Cliques</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {reportData.flowPerformance.flows.slice(0, 8).map((flow, i) => (
                  <tr key={flow.flowId} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 text-sm">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 text-sm font-medium text-white">{flow.name}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatNumber(flow.delivered)}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatPercent(flow.openRate)}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatPercent(flow.clickRate)}</td>
                    <td className="py-3 text-sm text-right font-semibold text-emerald-500">{formatCurrency(flow.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Best Sellers Table */}
      {shopifyData?.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
        <div className={cardBase}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Package className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Produtos Mais Vendidos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-left">#</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-left">Produto</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Qtd</th>
                  <th className="pb-3 text-xs text-zinc-600 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                  <tr key={product.productId} className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 text-sm">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 text-sm font-medium text-white">{product.title}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatNumber(product.quantitySold)}</td>
                    <td className="py-3 text-sm text-right font-semibold text-emerald-500">{formatCurrency(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-6 border-t border-zinc-800/60">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="text-sm text-zinc-500">Relatório gerado por <span className="text-emerald-500 font-semibold">Convertfy</span></span>
        </div>
        <p className="text-xs text-zinc-600">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
  )

  // Fullscreen Modal
  const FullscreenModal = () => {
    if (!mounted) return null
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-zinc-950 overflow-y-auto">
        <div className="sticky top-0 z-[10000] bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/60 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
            </div>
            <span className="font-semibold text-white">{storeName}</span>
            <span className="text-sm text-zinc-500">•</span>
            <span className="text-sm text-zinc-500">{getFormattedDateRange()}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleExportPDF} disabled={isExporting} className="bg-emerald-600 hover:bg-emerald-700 h-9 px-4">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="ml-2">Exportar PDF</span>
            </Button>
            <Button variant="outline" size="icon" onClick={toggleFullscreen} className="bg-zinc-900 border-zinc-700 h-9 w-9 hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto py-8 px-4">
          <ReportContent />
        </div>
      </div>,
      document.body
    )
  }

  // Main Render
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
          <Calendar className="w-4 h-4" />
          <span>{getFormattedDateRange()}</span>
        </div>
        <div className="flex items-center gap-3">
          {!savedReportData && (
            <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-1">
              {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                <button key={range} onClick={() => handleDateRangeChange(range)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${dateRange === range ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="icon" onClick={() => loadAllData()} disabled={isLoading} className="bg-zinc-900 border-zinc-800 h-9 w-9 hover:bg-zinc-800">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={toggleFullscreen} className="bg-zinc-900 border-zinc-800 h-9 w-9 hover:bg-zinc-800">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting} className="bg-emerald-600 hover:bg-emerald-700 h-9 px-4">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-zinc-800">
        <ReportContent />
      </div>
      {isFullscreen && <FullscreenModal />}
    </>
  )
}
