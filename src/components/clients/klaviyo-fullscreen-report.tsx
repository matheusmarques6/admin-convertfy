"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
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
  MessageSquare,
  Eye,
  MousePointer,
  Package,
  Target,
  Sparkles,
  Star,
  UserCheck,
  BarChart2,
  ArrowLeft,
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
    campaignsInPeriod?: number
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

interface KlaviyoFullscreenReportProps {
  storeId: string
  storeName: string
  period: string
}

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

// ============ CIRCULAR PROGRESS COMPONENT ============
const CircularProgress = ({
  value,
  size = 100,
  strokeWidth = 8,
  label,
}: {
  value: number
  size?: number
  strokeWidth?: number
  label?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="url(#blueGradientFS)" strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
          <defs>
            <linearGradient id="blueGradientFS" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white">{value.toFixed(1)}%</span>
        </div>
      </div>
      {label && <p className="text-xs text-slate-400 mt-2 text-center uppercase tracking-wider">{label}</p>}
    </div>
  )
}

// ============ MAIN COMPONENT ============
export function KlaviyoFullscreenReport({ storeId, storeName, period }: KlaviyoFullscreenReportProps) {
  const router = useRouter()
  const [reportData, setReportData] = useState<KlaviyoReportData | null>(null)
  const [shopifyData, setShopifyData] = useState<ShopifyReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState("Iniciando...")
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const loadAllData = useCallback(async () => {
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
  }, [storeId, period])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const handleExportPDF = async () => {
    if (!reportRef.current || isExporting) return
    setIsExporting(true)
    try {
      const html2pdf = (await import("html2pdf.js")).default
      await html2pdf().set({
        margin: 0,
        filename: `relatorio-${storeName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0f172a' },
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

  const getMonthYear = () => {
    if (reportData?.dateRange?.end) {
      const date = new Date(reportData.dateRange.end)
      return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
    }
    return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin" />
          <Sparkles className="w-8 h-8 text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white">Gerando Relatório</h3>
          <p className="text-sm text-slate-400">{loadingStatus}</p>
        </div>
      </div>
    )
  }

  // Error State
  if (error || !reportData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <XCircle className="w-16 h-16 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white">Erro ao Carregar</h3>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />Voltar
          </Button>
          <Button onClick={() => loadAllData()}>
            <RefreshCw className="w-4 h-4 mr-2" />Tentar Novamente
          </Button>
        </div>
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
  const newCustomers = shopifyData?.customers?.newCustomersLast30Days || 0

  const totalLeads = reportData.overview?.totalSubscribers || 0
  const engagedLeads = reportData.engagement?.engagedProfiles || 0
  const engagementRate = totalLeads > 0 ? (engagedLeads / totalLeads) * 100 : 0

  const openRate = reportData.emailPerformance?.openRate || 0
  const clickRate = reportData.emailPerformance?.clickRate || 0
  const ctor = reportData.emailPerformance?.clickToOpenRate || 0
  const delivered = reportData.emailPerformance?.delivered || 0
  const bounced = reportData.emailPerformance?.bounced || 0

  // Use sentCampaigns (total sent) instead of campaignsInPeriod
  const sentCampaigns = reportData.overview?.sentCampaigns || reportData.campaigns?.sent || reportData.overview?.campaignsInPeriod || 0
  const liveFlows = reportData.automation?.liveFlows || 0
  const totalFlows = reportData.automation?.totalFlows || 0

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Fixed Header */}
      <div className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
            <Star className="w-4 h-4 text-blue-400 fill-blue-400" />
            <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
          </div>
          <span className="font-semibold text-white">{storeName}</span>
          <span className="text-sm text-slate-500">•</span>
          <span className="text-sm text-slate-400">{getFormattedDateRange()}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => loadAllData()} disabled={isLoading} className="bg-slate-900 border-slate-700 h-9 w-9">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting} className="bg-blue-600 hover:bg-blue-700 h-9 px-4">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="ml-2">Exportar PDF</span>
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950/50 to-slate-900 border-b border-slate-800/50">
          <div className="max-w-6xl mx-auto px-8 py-10">
            <div className="flex items-center justify-center gap-1 mb-4">
              <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
              <Star className="w-4 h-4 text-blue-400 fill-blue-400" />
              <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
            </div>
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-white tracking-tight mb-1">{storeName.toUpperCase()}</h1>
              <p className="text-lg text-slate-400 font-light">{getMonthYear()}</p>
              <p className="text-xs text-slate-500 uppercase tracking-[0.3em] mt-2">Apresentação de Resultados</p>
            </div>
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-full px-4 py-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-slate-300">{getFormattedDateRange()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
          {/* Campanhas e Engajamento */}
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" />
                Campanhas e Engajamento
              </h2>
              <p className="text-xs text-slate-500 mt-1">Visão geral do alcance e engajamento das suas campanhas</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 transition-all hover:border-blue-500/30 hover:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span className="text-xs text-slate-500">Campanhas Enviadas</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{sentCampaigns}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl p-4 border border-blue-500/20 transition-all hover:border-blue-400/40">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-slate-400">Taxa de Engajamento</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-400">{formatPercent(engagementRate)}</p>
                </div>
                <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 rounded-xl p-4 border border-violet-500/20 transition-all hover:border-violet-400/40">
                  <div className="flex items-center gap-2 mb-2">
                    <Repeat className="w-4 h-4 text-violet-400" />
                    <span className="text-xs text-slate-400">Taxa Recorrência</span>
                  </div>
                  <p className="text-2xl font-bold text-violet-400">{formatPercent(recurringRate)}</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 transition-all hover:border-blue-500/30 hover:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span className="text-xs text-slate-500">Novos Clientes</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(newCustomers)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/20 rounded-xl p-5 border border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total de Leads</p>
                      <p className="text-3xl font-bold text-white">{formatNumber(totalLeads)}</p>
                      <p className="text-xs text-slate-500 mt-1">Contatos na base</p>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                      <Users className="w-8 h-8 text-slate-400" />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-950/30 to-slate-800/20 rounded-xl p-5 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Leads Engajados 90d</p>
                      <p className="text-3xl font-bold text-white">{formatNumber(engagedLeads)}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatPercent(engagementRate)} de engajamento</p>
                    </div>
                    <CircularProgress value={engagementRate} size={70} strokeWidth={6} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Resultados Financeiros */}
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-400" />
                Resultados Financeiros
              </h2>
              <p className="text-xs text-slate-500 mt-1">Faturamento e atribuição de receita por canal</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30 text-center transition-all hover:border-blue-500/30">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                    <DollarSign className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{formatCurrencyCompact(totalRevenue)}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Faturamento Total</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30 text-center transition-all hover:border-blue-500/30">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                    <ShoppingCart className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{formatCurrency(avgTicket)}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Ticket Médio</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30 text-center transition-all hover:border-blue-500/30">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                    <Package className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(totalOrders)}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Total de Pedidos</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30 text-center transition-all hover:border-blue-500/30">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(totalCustomers)}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Total de Clientes</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-violet-950/40 rounded-xl p-6 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Receita Atribuída Convertfy</h3>
                </div>
                <div className="grid grid-cols-4 gap-6 items-center">
                  <div>
                    <p className="text-3xl font-bold text-white">{formatCurrencyCompact(convertfyRevenue)}</p>
                    <p className="text-xs text-slate-400 mt-1">Email + SMS</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-400">{formatPercent(convertfyPercent)}</p>
                    <p className="text-xs text-slate-400 mt-1">do Faturamento</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{formatNumber(convertfyOrders)}</p>
                    <p className="text-xs text-slate-400 mt-1">Pedidos</p>
                  </div>
                  <div className="flex justify-center">
                    <CircularProgress value={convertfyPercent} size={80} strokeWidth={7} label="Participação" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30 flex items-center justify-between transition-all hover:border-blue-500/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Faturamento Email</p>
                      <p className="text-xl font-bold text-white">{formatCurrencyCompact(emailRevenue)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold text-blue-400">{formatPercent(emailPercent)}</span>
                    <p className="text-xs text-slate-500">do total</p>
                  </div>
                </div>
                <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/30 flex items-center justify-between transition-all hover:border-violet-500/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Faturamento SMS</p>
                      <p className="text-xl font-bold text-white">{formatCurrencyCompact(smsRevenue)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold text-violet-400">{formatPercent(smsPercent)}</span>
                    <p className="text-xs text-slate-500">do total</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance de Email */}
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                Performance de Email
              </h2>
              <p className="text-xs text-slate-500 mt-1">Métricas de entrega, abertura e cliques</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-slate-800/30 rounded-xl p-4 text-center border border-slate-700/30 transition-all hover:border-blue-500/30 hover:scale-[1.02]">
                  <Send className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-white">{formatNumber(delivered)}</p>
                  <p className="text-xs text-slate-500 mt-1">Entregues</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl p-4 text-center border border-blue-500/20 transition-all hover:border-blue-400/40 hover:scale-[1.02]">
                  <Eye className="w-5 h-5 text-blue-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-blue-400">{formatPercent(openRate)}</p>
                  <p className="text-xs text-slate-400 mt-1">Taxa Abertura</p>
                </div>
                <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 rounded-xl p-4 text-center border border-violet-500/20 transition-all hover:border-violet-400/40 hover:scale-[1.02]">
                  <MousePointer className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-violet-400">{formatPercent(clickRate)}</p>
                  <p className="text-xs text-slate-400 mt-1">Taxa Clique</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4 text-center border border-slate-700/30 transition-all hover:border-blue-500/30 hover:scale-[1.02]">
                  <Target className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-white">{formatPercent(ctor)}</p>
                  <p className="text-xs text-slate-500 mt-1">CTOR</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4 text-center border border-slate-700/30 transition-all hover:border-blue-500/30 hover:scale-[1.02]">
                  <XCircle className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                  <p className="text-xl font-bold text-white">{formatNumber(bounced)}</p>
                  <p className="text-xs text-slate-500 mt-1">Bounces</p>
                </div>
              </div>
            </div>
          </div>

          {/* Automações e Campanhas */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  Automações (Flows)
                </h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Flows Ativos</span>
                  <span className="text-sm font-bold text-blue-400">{liveFlows}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Total de Flows</span>
                  <span className="text-sm font-bold text-white">{totalFlows}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Receita de Flows</span>
                  <span className="text-sm font-bold text-white">{formatCurrencyCompact(flowRevenue)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">% da Receita Convertfy</span>
                  <span className="text-sm font-bold text-violet-400">{convertfyRevenue > 0 ? formatPercent((flowRevenue / convertfyRevenue) * 100) : '0%'}</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-400" />
                  Campanhas
                </h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Campanhas Enviadas</span>
                  <span className="text-sm font-bold text-blue-400">{sentCampaigns}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Entregues</span>
                  <span className="text-sm font-bold text-white">{formatNumber(reportData.campaignPerformance?.totalDelivered)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-700/30">
                  <span className="text-sm text-slate-400">Receita de Campanhas</span>
                  <span className="text-sm font-bold text-white">{formatCurrencyCompact(campaignRevenue)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">% da Receita Convertfy</span>
                  <span className="text-sm font-bold text-violet-400">{convertfyRevenue > 0 ? formatPercent((campaignRevenue / convertfyRevenue) * 100) : '0%'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Automações */}
          {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  Top Automações por Receita
                </h2>
              </div>
              <div className="p-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="pb-3 text-xs text-slate-500 font-medium text-left">#</th>
                      <th className="pb-3 text-xs text-slate-500 font-medium text-left">Nome do Flow</th>
                      <th className="pb-3 text-xs text-slate-500 font-medium text-right">Entregues</th>
                      <th className="pb-3 text-xs text-slate-500 font-medium text-right">Abertura</th>
                      <th className="pb-3 text-xs text-slate-500 font-medium text-right">Cliques</th>
                      <th className="pb-3 text-xs text-slate-500 font-medium text-right">Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.flowPerformance.flows.slice(0, 6).map((flow, i) => (
                      <tr key={flow.flowId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 text-sm">
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-400'}`}>{i + 1}</span>
                        </td>
                        <td className="py-3 text-sm font-medium text-white">{flow.name}</td>
                        <td className="py-3 text-sm text-right text-slate-400">{formatNumber(flow.delivered)}</td>
                        <td className="py-3 text-sm text-right text-slate-300">{formatPercent(flow.openRate)}</td>
                        <td className="py-3 text-sm text-right text-slate-300">{formatPercent(flow.clickRate)}</td>
                        <td className="py-3 text-sm text-right font-bold text-blue-400">{formatCurrency(flow.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Produtos Mais Vendidos */}
          {shopifyData?.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700/50">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-400" />
                  Top 5 Produtos Mais Vendidos
                </h2>
              </div>
              <div className="p-6">
                <div className="grid gap-3">
                  {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                    <div key={product.productId} className="flex items-center gap-4 bg-slate-800/20 rounded-xl p-4 border border-slate-700/30 transition-all hover:border-blue-500/30 hover:bg-slate-800/40">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-400'}`}>{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{product.title}</p>
                        <p className="text-xs text-slate-500">{formatNumber(product.quantitySold)} unidades vendidas</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">{formatCurrency(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center py-8 border-t border-slate-800/50">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
              <Star className="w-4 h-4 text-blue-400 fill-blue-400" />
              <Star className="w-3 h-3 text-blue-400 fill-blue-400" />
            </div>
            <p className="text-sm text-slate-400">
              Relatório gerado por <span className="text-blue-400 font-semibold">Convertfy</span>
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
