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
  TrendingDown,
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
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  CreditCard,
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

// ============ METRIC CARD COMPONENT ============
const MetricCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = 'emerald',
  size = 'default'
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'emerald' | 'violet' | 'blue' | 'amber' | 'cyan' | 'rose' | 'zinc'
  size?: 'default' | 'large'
}) => {
  const colorClasses = {
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400' },
    violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', icon: 'text-violet-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', icon: 'text-cyan-400' },
    rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', icon: 'text-rose-400' },
    zinc: { bg: 'bg-zinc-700/50', border: 'border-zinc-600/50', text: 'text-zinc-300', icon: 'text-zinc-400' },
  }
  const c = colorClasses[color]

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 ${size === 'large' ? 'p-6' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
            trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' :
            trend === 'down' ? 'bg-rose-500/10 text-rose-400' :
            'bg-zinc-700/50 text-zinc-400'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
             trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
            {trendValue}
          </div>
        )}
      </div>
      <p className={`${size === 'large' ? 'text-3xl' : 'text-2xl'} font-bold ${c.text} mb-1`}>{value}</p>
      <p className="text-xs text-zinc-400 uppercase tracking-wide">{title}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  )
}

// ============ CIRCULAR PROGRESS ============
const CircularProgress = ({
  value,
  size = 80,
  strokeWidth = 6,
  color = '#10b981',
  label,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{value.toFixed(1)}%</span>
        </div>
      </div>
      {label && <p className="text-xs text-zinc-400 mt-2 text-center">{label}</p>}
    </div>
  )
}

// ============ PROGRESS BAR ============
const ProgressBar = ({
  value,
  label,
  amount,
  color = 'emerald',
  icon: Icon,
}: {
  value: number
  label: string
  amount: string
  color?: string
  icon: React.ElementType
}) => {
  const colorClasses: Record<string, string> = {
    emerald: 'from-emerald-500 to-emerald-400',
    violet: 'from-violet-500 to-violet-400',
    blue: 'from-blue-500 to-blue-400',
    amber: 'from-amber-500 to-amber-400',
    cyan: 'from-cyan-500 to-cyan-400',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 text-${color}-400`} />
          <span className="text-sm text-zinc-300">{label}</span>
        </div>
        <span className="text-sm font-semibold text-white">{amount}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colorClasses[color] || colorClasses.emerald} rounded-full transition-all duration-1000`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
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
        margin: [8, 8, 8, 8],
        filename: `relatorio-${storeName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#09090b' },
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

  const liveFlows = reportData.automation?.liveFlows || 0
  const totalFlows = reportData.automation?.totalFlows || 0
  const sentCampaigns = reportData.campaigns?.sent || 0

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div ref={reportRef} className="bg-zinc-950 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{storeName}</h1>
            <p className="text-sm text-zinc-400">{getFormattedDateRange()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-400">Relatório Convertfy</span>
        </div>
      </div>

      {/* Hero - Resultado Convertfy */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-zinc-900 border border-emerald-500/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-emerald-400">Resultado Convertfy (Email + SMS)</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-3xl font-bold text-white">{formatCurrency(convertfyRevenue)}</p>
            <p className="text-sm text-zinc-400">Receita Atribuída</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-emerald-400">{formatPercent(convertfyPercent)}</p>
            <p className="text-sm text-zinc-400">do Faturamento Total</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{formatNumber(convertfyOrders)}</p>
            <p className="text-sm text-zinc-400">Pedidos Atribuídos</p>
          </div>
          <div className="flex items-center gap-4">
            <CircularProgress value={convertfyPercent} size={70} color="#10b981" />
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Faturamento Total" value={formatCurrencyCompact(totalRevenue)} icon={DollarSign} color="emerald" />
        <MetricCard title="Receita Email" value={formatCurrencyCompact(emailRevenue)} subtitle={`${formatPercent(emailPercent)} do total`} icon={Mail} color="violet" />
        <MetricCard title="Receita SMS" value={formatCurrencyCompact(smsRevenue)} subtitle={`${formatPercent(smsPercent)} do total`} icon={MessageSquare} color="cyan" />
        <MetricCard title="Ticket Médio" value={formatCurrency(avgTicket)} icon={CreditCard} color="amber" />
      </div>

      {/* Orders & Customers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total de Pedidos" value={formatNumber(totalOrders)} icon={ShoppingCart} color="blue" />
        <MetricCard title="Total de Clientes" value={formatNumber(totalCustomers)} icon={Users} color="violet" />
        <MetricCard title="Taxa Recorrência" value={formatPercent(recurringRate)} subtitle={`${formatNumber(recurringCustomers)} retornaram`} icon={Repeat} color="emerald" />
        <MetricCard title="Novos Clientes" value={formatNumber(newCustomers)} icon={TrendingUp} color="cyan" />
      </div>

      {/* Revenue Breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Receita por Canal
          </h3>
          <div className="space-y-4">
            <ProgressBar value={convertfyRevenue > 0 ? (campaignRevenue / convertfyRevenue) * 100 : 0} label="Campanhas" amount={formatCurrencyCompact(campaignRevenue)} color="blue" icon={Send} />
            <ProgressBar value={convertfyRevenue > 0 ? (flowRevenue / convertfyRevenue) * 100 : 0} label="Automações (Flows)" amount={formatCurrencyCompact(flowRevenue)} color="amber" icon={Zap} />
            {smsRevenue > 0 && <ProgressBar value={convertfyRevenue > 0 ? (smsRevenue / convertfyRevenue) * 100 : 0} label="SMS Marketing" amount={formatCurrencyCompact(smsRevenue)} color="cyan" icon={MessageSquare} />}
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between text-sm">
            <span className="text-zinc-400">Total Convertfy</span>
            <span className="font-bold text-emerald-400">{formatCurrency(convertfyRevenue)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-400" />
            Performance de Email
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <Eye className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-400">{formatPercent(openRate)}</p>
              <p className="text-xs text-zinc-400">Taxa Abertura</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <MousePointer className="w-6 h-6 text-violet-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-violet-400">{formatPercent(clickRate)}</p>
              <p className="text-xs text-zinc-400">Taxa Clique</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <Target className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-400">{formatPercent(ctor)}</p>
              <p className="text-xs text-zinc-400">CTOR</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <Send className="w-6 h-6 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatNumber(delivered)}</p>
              <p className="text-xs text-zinc-400">Entregues</p>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-xs text-zinc-500">
            <span>Bounces: {formatNumber(bounced)}</span>
            <span>Descadastros: {formatNumber(unsubscribed)}</span>
          </div>
        </div>
      </div>

      {/* Audience & Automation */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            Audiência
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Total de Contatos</span>
              <span className="font-semibold">{formatNumber(totalLeads)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Engajados (90d)</span>
              <span className="font-semibold text-emerald-400">{formatNumber(engagedLeads)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-400">Taxa Engajamento</span>
              <span className="font-semibold text-violet-400">{formatPercent(engagementRate)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Automações
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Flows Ativos</span>
              <span className="font-semibold text-emerald-400">{liveFlows}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Total de Flows</span>
              <span className="font-semibold">{totalFlows}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-400">Receita Flows</span>
              <span className="font-semibold text-amber-400">{formatCurrencyCompact(flowRevenue)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-400" />
            Campanhas
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Enviadas</span>
              <span className="font-semibold text-emerald-400">{sentCampaigns}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-800">
              <span className="text-sm text-zinc-400">Entregues</span>
              <span className="font-semibold">{formatNumber(reportData.campaignPerformance?.totalDelivered)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-zinc-400">Receita</span>
              <span className="font-semibold text-blue-400">{formatCurrencyCompact(campaignRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Flows */}
      {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Top Automações por Receita
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-3 text-xs text-zinc-500 font-medium">#</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium">Nome</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Entregues</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Abertura</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Cliques</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {reportData.flowPerformance.flows.slice(0, 8).map((flow, i) => (
                  <tr key={flow.flowId} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-3 text-sm">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 text-sm font-medium">{flow.name}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatNumber(flow.delivered)}</td>
                    <td className="py-3 text-sm text-right text-emerald-400">{formatPercent(flow.openRate)}</td>
                    <td className="py-3 text-sm text-right text-violet-400">{formatPercent(flow.clickRate)}</td>
                    <td className="py-3 text-sm text-right font-semibold text-emerald-400">{formatCurrency(flow.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Best Sellers */}
      {shopifyData?.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-400" />
            Produtos Mais Vendidos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-3 text-xs text-zinc-500 font-medium">#</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium">Produto</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                  <th className="pb-3 text-xs text-zinc-500 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                  <tr key={product.productId} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-3 text-sm">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>{i + 1}</span>
                    </td>
                    <td className="py-3 text-sm font-medium">{product.title}</td>
                    <td className="py-3 text-sm text-right text-zinc-400">{formatNumber(product.quantitySold)}</td>
                    <td className="py-3 text-sm text-right font-semibold text-emerald-400">{formatCurrency(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-6 border-t border-zinc-800">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-zinc-400">Relatório gerado por <span className="text-emerald-400 font-semibold">Convertfy</span></span>
        </div>
        <p className="text-xs text-zinc-600">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>
  )

  // Fullscreen Modal
  const FullscreenModal = () => {
    if (!mounted) return null
    return createPortal(
      <div className="fixed inset-0 z-[9999] overflow-auto bg-zinc-950">
        <Button variant="outline" size="icon" onClick={toggleFullscreen} className="fixed top-4 right-4 z-[10000] bg-zinc-900 border-zinc-700 h-10 w-10">
          <X className="w-5 h-5" />
        </Button>
        <Button onClick={handleExportPDF} disabled={isExporting} className="fixed top-4 right-16 z-[10000] bg-emerald-600 hover:bg-emerald-700 h-10 px-4">
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="ml-2">PDF</span>
        </Button>
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
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${dateRange === range ? 'bg-emerald-500 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="icon" onClick={() => loadAllData()} disabled={isLoading} className="bg-zinc-900 border-zinc-800 h-9 w-9">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={toggleFullscreen} className="bg-zinc-900 border-zinc-800 h-9 w-9">
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
