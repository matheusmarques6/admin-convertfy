"use client"

import { useState, useEffect, useRef } from "react"
import { format } from "date-fns"
import { useStoreEmailReport, useShopifyReport } from "@/lib/hooks/use-api-data"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"
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
  ExternalLink,
  MessageSquare,
  Eye,
  MousePointer,
  Package,
  Target,
  Sparkles,
  Star,
  UserCheck,
  BarChart2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { RateLimitBanner } from "@/components/ui/rate-limit-banner"
import { formatCurrency as formatCurrencyUtil, formatCurrencyCompact as formatCurrencyCompactUtil } from "@/lib/utils/format"

// ============ INTERFACES ============
interface StoreEmailReportData {
  success: boolean
  connected: boolean
  platform?: "klaviyo" | "omnisend" | "none"
  storeName: string
  generatedAt: string
  period: string
  dateRange: { start: string; end: string }
  account?: { currency: string; currencySymbol: string; locale: string }
  revenue: {
    /** Receita TOTAL da loja no periodo (Statistics/Klaviyo metric-aggregates). */
    storeRevenue?: number
    /** Pedidos TOTAIS da loja no periodo. */
    storeOrders?: number
    /** Atribuida a email: soma de campaign + flow revenue. */
    totalRevenue: number
    klaviyoAttributedRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalOrders: number
    klaviyoAttributedOrders: number
    averageOrderValue: number
    /** storeRevenue > 0 ? (attributed / storeRevenue) * 100 : 0 */
    recoveryRate?: number
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

interface StoreEmailPerformanceReportProps {
  storeId: string
  storeName: string
  savedReportData?: StoreEmailReportData | null
}

type DateRange = "7d" | "30d" | "90d" | "all" | "custom"

// ============ FORMATTERS ============
// Currency-aware formatters — currency is resolved per-report inside the component

const formatNumber = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return new Intl.NumberFormat('pt-BR').format(Math.round(num))
}

const formatPercent = (value: number | undefined | null): string => {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${num.toFixed(2)}%`
}

/** Creates currency formatters bound to a specific currency code */
function createCurrencyFormatters(currency: string) {
  const fmtCurrency = (value: number | undefined | null): string => {
    const num = typeof value === 'number' && !isNaN(value) ? value : 0
    return formatCurrencyUtil(num, currency)
  }
  const fmtCurrencyCompact = (value: number | undefined | null): string => {
    const num = typeof value === 'number' && !isNaN(value) ? value : 0
    return formatCurrencyCompactUtil(num, currency)
  }
  return { formatCurrency: fmtCurrency, formatCurrencyCompact: fmtCurrencyCompact }
}

// ============ CIRCULAR PROGRESS COMPONENT ============
const CircularProgress = ({
  value,
  size = 100,
  strokeWidth = 8,
  label,
  sublabel,
}: {
  value: number
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#blueGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
          <defs>
            <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-foreground">{value.toFixed(1)}%</span>
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground mt-2 text-center uppercase tracking-wider">{label}</p>}
      {sublabel && <p className="text-[10px] text-muted-foreground text-center">{sublabel}</p>}
    </div>
  )
}

// ============ MAIN COMPONENT ============
export function StoreEmailPerformanceReport({ storeId, storeName, savedReportData }: StoreEmailPerformanceReportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(
    (savedReportData?.period as DateRange) || "30d"
  )
  const [customDates, setCustomDates] = useState<CustomDateRange | undefined>()
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const reportRef = useRef<HTMLDivElement>(null)

  const handleCustomDateApply = (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    const dates: CustomDateRange = {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    }
    setCustomDates(dates)
    setDateRange("custom")
  }

  // SWR hooks for data fetching
  const {
    data: reportRaw,
    error: reportError,
    isLoading: klaviyoLoading,
    isValidating: reportValidating,
    mutate: mutateReport,
  } = useStoreEmailReport(storeId, dateRange, customDates)

  const {
    data: shopifyRaw,
    mutate: mutateShopify,
  } = useShopifyReport(storeId, dateRange, customDates)

  // Derive typed data from SWR responses
  const reportData: StoreEmailReportData | null =
    savedReportData || (reportRaw as StoreEmailReportData)?.success ? (reportRaw as StoreEmailReportData) : null
  const shopifyData: ShopifyReportData | null =
    (shopifyRaw as ShopifyReportData)?.success && (shopifyRaw as ShopifyReportData)?.connected ? (shopifyRaw as ShopifyReportData) : null

  const isLoading = klaviyoLoading && !savedReportData
  const error = reportError
    ? (reportError instanceof Error ? reportError.message : "Erro de conexão")
    : (reportRaw && !(reportRaw as StoreEmailReportData)?.success)
      ? ((reportRaw as Record<string, string>)?.error || "Erro ao carregar relatório")
      : null

  // Set dateRange when savedReportData changes
  useEffect(() => {
    if (savedReportData?.period) {
      setDateRange(savedReportData.period as DateRange)
    }
  }, [savedReportData])

  const openFullscreenReport = () => {
    let url = `/report?store_id=${storeId}&period=${dateRange}`
    if (dateRange === "custom" && customDates) {
      url += `&start_date=${customDates.startDate}&end_date=${customDates.endDate}`
    }
    window.open(url, '_blank')
  }

  const handleDateRangeChange = (newRange: DateRange) => {
    if (newRange !== dateRange && !savedReportData) {
      setDateRange(newRange)
      if (newRange !== "custom") {
        setCustomDates(undefined)
        setCustomStart(undefined)
        setCustomEnd(undefined)
      }
    }
  }

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-border border-t-blue-500 animate-spin" />
          <Sparkles className="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">Gerando Relatório</h3>
          <p className="text-sm text-muted-foreground">Buscando dados...</p>
        </div>
      </div>
    )
  }

  // Error State
  if (error || !reportData) {
    const err = error as Error | string | undefined
    const errorMessage = err instanceof Error ? err.message : typeof err === "string" ? err : "Não foi possível carregar os dados do relatório."
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <XCircle className="w-16 h-16 text-destructive" />
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold text-foreground">Erro ao Carregar</h3>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </div>
        <Button onClick={() => { mutateReport(); mutateShopify() }}><RefreshCw className="w-4 h-4 mr-2" />Tentar Novamente</Button>
      </div>
    )
  }

  // Derive currency formatters from report account data (reactive to data changes)
  const reportCurrency = reportData.account?.currency || "BRL"
  const { formatCurrency, formatCurrencyCompact } = createCurrencyFormatters(reportCurrency)

  // ============ DATA CALCULATIONS ============
  // Prioridade: Shopify (quando conectado) > storeRevenue da plataforma de email
  // (Statistics API / metric-aggregates) > totalRevenue (atribuida, caminho legado).
  // storeRevenue reflete a receita TOTAL da loja; totalRevenue reflete apenas a
  // receita atribuida ao email marketing. Sem essa prioridade, o card
  // "FATURAMENTO TOTAL" exibia o attributed (~€12K) em vez do store (~€371K)
  // e o TICKET MEDIO ficava em ~3,14 (12853/4089 em vez de 371644/4089).
  const totalRevenue =
    shopifyData?.summary?.totalRevenue
    || reportData.revenue?.storeRevenue
    || reportData.revenue?.totalRevenue
    || 0
  const totalOrders =
    shopifyData?.summary?.totalOrders
    || reportData.revenue?.storeOrders
    || reportData.revenue?.totalOrders
    || 0
  const avgTicket =
    shopifyData?.summary?.averageOrderValue
    || (totalOrders > 0 ? totalRevenue / totalOrders : 0)
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
  const engagementRate = Math.min(totalLeads > 0 ? (engagedLeads / totalLeads) * 100 : 0, 100)

  const openRate = reportData.emailPerformance?.openRate || 0
  const clickRate = reportData.emailPerformance?.clickRate || 0
  const ctor = reportData.emailPerformance?.clickToOpenRate || 0
  const delivered = reportData.emailPerformance?.delivered || 0
  const bounced = reportData.emailPerformance?.bounced || 0

  // Use campaignsInPeriod (campaigns sent in selected period)
  const sentCampaigns = reportData.overview?.campaignsInPeriod ?? reportData.overview?.sentCampaigns ?? reportData.campaigns?.sent ?? 0
  const liveFlows = reportData.automation?.liveFlows || 0
  const totalFlows = reportData.automation?.totalFlows || 0

  // ============ REPORT CONTENT ============
  const ReportContent = () => (
    <div ref={reportRef} className="bg-card text-foreground min-h-screen">
      {/* ===== HEADER / OVERVIEW ===== */}
      <div className="bg-card border-b border-border/50">
        <div className="max-w-6xl mx-auto px-8 py-10">
          {/* Stars decoration */}
          <div className="flex items-center justify-center gap-1 mb-4">
            <Star className="w-3 h-3 text-primary fill-primary" />
            <Star className="w-4 h-4 text-primary fill-primary" />
            <Star className="w-3 h-3 text-primary fill-primary" />
          </div>

          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">{storeName.toUpperCase()}</h1>
            <p className="text-lg text-muted-foreground font-light">{getMonthYear()}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.3em] mt-2">Apresentação de Resultados</p>
          </div>

          {/* Period badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 bg-muted/50 border border-border/50 rounded-full px-4 py-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground/80">{getFormattedDateRange()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">

        {/* ===== SECTION: CAMPANHAS E ENGAJAMENTO ===== */}
        <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
          <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Campanhas e Engajamento
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Visão geral do alcance e engajamento das suas campanhas</p>
          </div>

          <div className="p-6">
            {/* Top metrics row */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-muted/30 rounded-[8px] p-4 border border-border/30 transition-all hover:border-primary/30 hover:bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Campanhas Enviadas</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{sentCampaigns}</p>
              </div>

              <div className="bg-primary/10 rounded-[8px] p-4 border border-primary/20 transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Taxa de Engajamento</span>
                </div>
                <p className="text-2xl font-bold text-primary">{formatPercent(engagementRate)}</p>
              </div>

              <div className="bg-primary/10 rounded-[8px] p-4 border border-primary/20 transition-all hover:border-primary/40">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-4 h-4 text-primary/80" />
                  <span className="text-xs text-muted-foreground">Taxa Recorrência</span>
                </div>
                <p className="text-2xl font-bold text-primary/80">{formatPercent(recurringRate)}</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-4 border border-border/30 transition-all hover:border-primary/30 hover:bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Novos Clientes</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{formatNumber(newCustomers)}</p>
              </div>
            </div>

            {/* Leads section */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/20 rounded-[8px] p-5 border border-border/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total de Leads</p>
                    <p className="text-3xl font-bold text-foreground">{formatNumber(totalLeads)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Contatos na base</p>
                  </div>
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-primary uppercase tracking-wider mb-1">Leads Engajados 90d</p>
                    <p className="text-3xl font-bold text-foreground">{formatNumber(engagedLeads)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatPercent(engagementRate)} de engajamento</p>
                  </div>
                  <CircularProgress value={engagementRate} size={70} strokeWidth={6} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION: RESULTADOS FINANCEIROS ===== */}
        <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
          <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Resultados Financeiros
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Faturamento e atribuição de receita por canal</p>
          </div>

          <div className="p-6">
            {/* Main financial metrics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-muted/30 rounded-[8px] p-5 border border-border/30 text-center transition-all hover:border-primary/30">
                <div className="w-12 h-12 rounded-[8px] bg-muted flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrencyCompact(totalRevenue)}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Faturamento Total</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-5 border border-border/30 text-center transition-all hover:border-primary/30">
                <div className="w-12 h-12 rounded-[8px] bg-muted flex items-center justify-center mx-auto mb-3">
                  <ShoppingCart className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(avgTicket)}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Ticket Médio</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-5 border border-border/30 text-center transition-all hover:border-primary/30">
                <div className="w-12 h-12 rounded-[8px] bg-muted flex items-center justify-center mx-auto mb-3">
                  <Package className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold text-foreground">{formatNumber(totalOrders)}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total de Pedidos</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-5 border border-border/30 text-center transition-all hover:border-primary/30">
                <div className="w-12 h-12 rounded-[8px] bg-muted flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold text-foreground">{formatNumber(totalCustomers)}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total de Clientes</p>
              </div>
            </div>

            {/* Convertfy attribution */}
            <div className="bg-primary/10 rounded-[8px] p-6 border border-primary/20">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Receita Atribuída Convertfy</h3>
              </div>

              <div className="grid grid-cols-4 gap-6 items-center">
                <div>
                  <p className="text-3xl font-bold text-foreground">{formatCurrencyCompact(convertfyRevenue)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Email + SMS</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{formatPercent(convertfyPercent)}</p>
                  <p className="text-xs text-muted-foreground mt-1">do Faturamento</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{formatNumber(convertfyOrders)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Pedidos</p>
                </div>
                <div className="flex justify-center">
                  <CircularProgress value={convertfyPercent} size={80} strokeWidth={7} label="Participação" />
                </div>
              </div>
            </div>

            {/* Channel breakdown */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-muted/20 rounded-[8px] p-4 border border-border/30 flex items-center justify-between transition-all hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Faturamento Email</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrencyCompact(emailRevenue)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-semibold text-primary">{formatPercent(emailPercent)}</span>
                  <p className="text-xs text-muted-foreground">do total</p>
                </div>
              </div>

              <div className="bg-muted/20 rounded-[8px] p-4 border border-border/30 flex items-center justify-between transition-all hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-primary/80" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Faturamento SMS</p>
                    <p className="text-xl font-bold text-foreground">{formatCurrencyCompact(smsRevenue)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-semibold text-primary/80">{formatPercent(smsPercent)}</span>
                  <p className="text-xs text-muted-foreground">do total</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION: PERFORMANCE DE EMAIL ===== */}
        <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
          <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              Performance de Email
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Métricas de entrega, abertura e cliques</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-muted/30 rounded-[8px] p-4 text-center border border-border/30 transition-all hover:border-primary/30 hover:scale-[1.02]">
                <Send className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-xl font-bold text-foreground">{formatNumber(delivered)}</p>
                <p className="text-xs text-muted-foreground mt-1">Entregues</p>
              </div>

              <div className="bg-primary/10 rounded-[8px] p-4 text-center border border-primary/20 transition-all hover:border-primary/40 hover:scale-[1.02]">
                <Eye className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-xl font-bold text-primary">{formatPercent(openRate)}</p>
                <p className="text-xs text-muted-foreground mt-1">Taxa Abertura</p>
              </div>

              <div className="bg-primary/10 rounded-[8px] p-4 text-center border border-primary/20 transition-all hover:border-primary/40 hover:scale-[1.02]">
                <MousePointer className="w-5 h-5 text-primary/80 mx-auto mb-2" />
                <p className="text-xl font-bold text-primary/80">{formatPercent(clickRate)}</p>
                <p className="text-xs text-muted-foreground mt-1">Taxa Clique</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-4 text-center border border-border/30 transition-all hover:border-primary/30 hover:scale-[1.02]">
                <Target className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-xl font-bold text-foreground">{formatPercent(ctor)}</p>
                <p className="text-xs text-muted-foreground mt-1">CTOR</p>
              </div>

              <div className="bg-muted/30 rounded-[8px] p-4 text-center border border-border/30 transition-all hover:border-primary/30 hover:scale-[1.02]">
                <XCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-xl font-bold text-foreground">{formatNumber(bounced)}</p>
                <p className="text-xs text-muted-foreground mt-1">Bounces</p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION: AUTOMAÇÕES E CAMPANHAS ===== */}
        <div className="grid grid-cols-2 gap-6">
          {/* Automações */}
          <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
            <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Automações (Flows)
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Flows Ativos</span>
                <span className="text-sm font-bold text-primary">{liveFlows}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Total de Flows</span>
                <span className="text-sm font-bold text-foreground">{totalFlows}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Receita de Flows</span>
                <span className="text-sm font-bold text-foreground">{formatCurrencyCompact(flowRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">% da Receita Convertfy</span>
                <span className="text-sm font-bold text-primary/80">{convertfyRevenue > 0 ? formatPercent((flowRevenue / convertfyRevenue) * 100) : '0%'}</span>
              </div>
            </div>
          </div>

          {/* Campanhas */}
          <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
            <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Campanhas
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Campanhas Enviadas</span>
                <span className="text-sm font-bold text-primary">{sentCampaigns}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Entregues</span>
                <span className="text-sm font-bold text-foreground">{formatNumber(reportData.campaignPerformance?.totalDelivered)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-sm text-muted-foreground">Receita de Campanhas</span>
                <span className="text-sm font-bold text-foreground">{formatCurrencyCompact(campaignRevenue)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">% da Receita Convertfy</span>
                <span className="text-sm font-bold text-primary/80">{convertfyRevenue > 0 ? formatPercent((campaignRevenue / convertfyRevenue) * 100) : '0%'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== SECTION: TOP AUTOMAÇÕES ===== */}
        {reportData.flowPerformance?.flows && reportData.flowPerformance.flows.length > 0 && (
          <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
            <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                Top Automações por Receita
              </h2>
            </div>
            <div className="p-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-left">#</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-left">Nome do Flow</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Entregues</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Abertura</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Cliques</th>
                    <th className="pb-3 text-xs text-muted-foreground font-medium text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.flowPerformance.flows.slice(0, 6).map((flow, i) => (
                    <tr key={flow.flowId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 text-sm">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                      </td>
                      <td className="py-3 text-sm font-medium text-foreground">{flow.name}</td>
                      <td className="py-3 text-sm text-right text-muted-foreground">{formatNumber(flow.delivered)}</td>
                      <td className="py-3 text-sm text-right text-foreground/80">{formatPercent(flow.openRate)}</td>
                      <td className="py-3 text-sm text-right text-foreground/80">{formatPercent(flow.clickRate)}</td>
                      <td className="py-3 text-sm text-right font-bold text-primary">{formatCurrency(flow.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== SECTION: PRODUTOS MAIS VENDIDOS ===== */}
        {shopifyData?.bestSellingProducts && shopifyData.bestSellingProducts.length > 0 && (
          <div className="bg-card rounded-[8px] border border-border/50 overflow-hidden">
            <div className="bg-muted/50 px-6 py-4 border-b border-border/50">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Top 5 Produtos Mais Vendidos
              </h2>
            </div>
            <div className="p-6">
              <div className="grid gap-3">
                {shopifyData.bestSellingProducts.slice(0, 5).map((product, i) => (
                  <div key={product.productId} className="flex items-center gap-4 bg-muted/20 rounded-[8px] p-4 border border-border/30 transition-all hover:border-primary/30 hover:bg-muted/40">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{product.title}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(product.quantitySold)} unidades vendidas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{formatCurrency(product.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== FOOTER ===== */}
        <div className="text-center py-8 border-t border-border/50">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-primary fill-primary" />
              <Star className="w-4 h-4 text-primary fill-primary" />
              <Star className="w-3 h-3 text-primary fill-primary" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Relatório gerado por <span className="text-primary font-semibold">Convertfy</span>
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )

  // Detect zero-data scenario (connected but no reporting data)
  const isAllDataZero = campaignRevenue === 0 && flowRevenue === 0
    && sentCampaigns === 0 && totalFlows === 0 && delivered === 0

  // Detect rate limiting from report response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isRateLimited = (reportRaw as any)?.rateLimited === true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rateLimitFromCache = (reportRaw as any)?.fromCache === true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rateLimitFetchedAt = (reportRaw as any)?.fetchedAt as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rateLimitPlatform = ((reportRaw as any)?.platform === "omnisend" ? "omnisend" : "klaviyo") as "klaviyo" | "omnisend"

  // Main Render
  return (
    <>
      {isRateLimited && (
        <RateLimitBanner fromCache={rateLimitFromCache} fetchedAt={rateLimitFetchedAt} platform={rateLimitPlatform} />
      )}
      {isAllDataZero && !isRateLimited && (
        <div className="flex items-center gap-3 p-4 mb-4 rounded-[8px] border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning">Nenhum dado encontrado</p>
            <p className="text-xs text-muted-foreground">
              {(() => {
                const p = reportData.platform
                if (p === "omnisend") {
                  return "A integração Omnisend está conectada mas não retornou nenhuma campanha, automação ou receita no período selecionado. Verifique se a loja já enviou campanhas ou se há pedidos atribuídos no Omnisend."
                }
                if (p === "klaviyo") {
                  return "Verifique se a API Key do Klaviyo tem permissão para acessar relatórios (Reporting scope)."
                }
                return "Nenhuma plataforma de email marketing está configurada para esta loja. Conecte Klaviyo ou Omnisend na aba Integrações."
              })()}
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card px-4 py-2 rounded-[8px] border border-border">
          <Calendar className="w-4 h-4" />
          <span>{getFormattedDateRange()}</span>
        </div>
        <div className="flex items-center gap-3">
          {!savedReportData && (
            <>
            <div className="flex items-center rounded-[8px] bg-card border border-border p-1">
              {(["7d", "30d", "90d", "all"] as DateRange[]).map(range => (
                <button key={range} onClick={() => handleDateRangeChange(range)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${dateRange === range ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "90d" ? "90D" : "1A"}
                </button>
              ))}
            </div>
            <DateRangePicker
              startDate={customStart}
              endDate={customEnd}
              onApply={handleCustomDateApply}
            />
            </>
          )}
          <Button variant="secondary" size="icon" onClick={() => { mutateReport(); mutateShopify() }} disabled={reportValidating} className="bg-card border-border h-9 w-9 hover:bg-muted">
            <RefreshCw className={`w-4 h-4 ${reportValidating ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="secondary" size="icon" onClick={openFullscreenReport} className="bg-card border-border h-9 w-9 hover:bg-muted" title="Abrir em nova página">
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button onClick={handleExportPDF} disabled={isExporting} className="bg-primary hover:bg-primary/90 h-9 px-4">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Exportar</span>
          </Button>
        </div>
      </div>
      <div className="rounded-[8px] overflow-hidden border border-border">
        <ReportContent />
      </div>
    </>
  )
}
