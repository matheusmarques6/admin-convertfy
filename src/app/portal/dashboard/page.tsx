"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  DollarSign,
  Store,
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
  BarChart3,
  CreditCard,
  CalendarDays,
  Video,
  Zap,
  Send,
  Target,
  Package,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  Receipt,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  smsRevenue: number
  emailsSent: number
  delivered: number
  openRate: number
  clickRate: number
  clickToOpenRate: number
  conversionRate: number
  unsubscribeRate: number
  bounceRate: number
  bounces: number
  campaignsCount: number
  campaignDelivered: number
  campaignRevenuePercent: number
  flowsCount: number
  activeFlows: number
  flowDelivered: number
  flowRevenuePercent: number
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
    delivered: number
    openRate: number
    clickRate: number
  }>
}

interface ShopifyData {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  totalCustomers: number
  newCustomers: number
  recurringCustomerRate: number
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
  dateRange?: {
    start: string
    end: string
  }
  lastUpdated: string
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
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

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const formatOpts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }
  return `${startDate.toLocaleDateString("pt-BR", formatOpts)} - ${endDate.toLocaleDateString("pt-BR", formatOpts)}`
}

// ============================================
// CUSTOM CHART COMPONENTS
// ============================================

// Circular Progress Ring Component
function CircularProgress({
  value,
  size = 120,
  strokeWidth = 10,
  color = "#10b981",
  bgColor = "#1f2937",
  label,
  sublabel
}: {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
  label?: string
  sublabel?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{value.toFixed(1)}%</span>
        {label && <span className="text-xs text-gray-400">{label}</span>}
        {sublabel && <span className="text-[10px] text-gray-500">{sublabel}</span>}
      </div>
    </div>
  )
}

// Metric Card with dark theme
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-emerald-400",
  iconBgColor = "bg-emerald-400/10",
  trend,
  trendValue,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  iconBgColor?: string
  trend?: "up" | "down" | "neutral"
  trendValue?: string
}) {
  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-5 hover:bg-slate-800/70 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`rounded-lg p-2.5 ${iconBgColor}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-gray-400"
          }`}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
            {trendValue}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}


// Section Header Component
function SectionHeader({
  title,
  icon: Icon,
  description,
  action
}: {
  title: string
  icon: React.ElementType
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-emerald-500/10 p-2">
          <Icon className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description && <p className="text-sm text-gray-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all")
  const [period, setPeriod] = useState("30d")

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

  // Loading state with dark theme
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64 bg-slate-800" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-40 bg-slate-800" />
            <Skeleton className="h-10 w-32 bg-slate-800" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-slate-800" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-xl bg-slate-800" />
          <Skeleton className="h-64 rounded-xl bg-slate-800" />
        </div>
        <Skeleton className="h-96 rounded-xl bg-slate-800" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Erro ao carregar</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <Button onClick={() => fetchDashboard()} className="bg-emerald-500 hover:bg-emerald-600">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const klaviyo = data.klaviyo
  const shopify = data.shopify

  // Calculate metrics
  const totalShopifyRevenue = shopify?.totalRevenue || 0
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const attributionPercent = totalShopifyRevenue > 0 ? ((totalKlaviyoRevenue / totalShopifyRevenue) * 100) : 0

  // Estimated profit (assuming 30% margin on Convertfy attributed revenue)
  const estimatedMargin = 0.30
  const estimatedProfit = totalKlaviyoRevenue * estimatedMargin

  // ROI calculation (revenue generated / estimated investment)
  const estimatedInvestment = 3000 // placeholder - could come from invoices
  const roi = estimatedInvestment > 0 ? ((totalKlaviyoRevenue - estimatedInvestment) / estimatedInvestment) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">

        {/* ========== HEADER ========== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {data.selectedStore?.name || data.client?.name || "Dashboard"}
              </h1>
              {data.dateRange && (
                <p className="text-sm text-gray-400">
                  {formatDateRange(data.dateRange.start, data.dateRange.end)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Store Selector */}
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-white">
                <Store className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all" className="text-white hover:bg-slate-700">Todas as lojas</SelectItem>
                {data.stores?.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="text-white hover:bg-slate-700">
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period Selector */}
            <Select value={period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white">
                <CalendarDays className="h-4 w-4 mr-2 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="1d" className="text-white hover:bg-slate-700">Hoje</SelectItem>
                <SelectItem value="7d" className="text-white hover:bg-slate-700">7 dias</SelectItem>
                <SelectItem value="15d" className="text-white hover:bg-slate-700">15 dias</SelectItem>
                <SelectItem value="30d" className="text-white hover:bg-slate-700">30 dias</SelectItem>
                <SelectItem value="90d" className="text-white hover:bg-slate-700">90 dias</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            {/* Export Button */}
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {selectedStoreId === "all" ? (
          // ========== SELECT STORE MESSAGE ==========
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-16 text-center">
            <div className="rounded-full bg-slate-700/50 p-6 w-fit mx-auto mb-6">
              <Store className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Selecione uma loja</h3>
            <p className="text-gray-400 max-w-md mx-auto mb-8">
              Para visualizar os dados detalhados do relatório e acompanhar os resultados da Convertfy, selecione uma loja específica.
            </p>
            {data.stores && data.stores.length > 0 && (
              <div className="flex flex-wrap gap-3 justify-center">
                {data.stores.map((store) => (
                  <Button
                    key={store.id}
                    variant="outline"
                    onClick={() => setSelectedStoreId(store.id)}
                    className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Store className="h-4 w-4 mr-2" />
                    {store.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          // ========== FULL DASHBOARD ==========
          <div className="space-y-6">

            {/* ========== FINANCIAL OVERVIEW - Main Focus ========== */}
            <div className="rounded-xl bg-gradient-to-br from-emerald-900/30 via-slate-800/50 to-slate-900 border border-emerald-500/20 p-6">
              <SectionHeader
                title="RESULTADOS CONVERTFY"
                icon={Zap}
                description="Receita gerada através de email marketing e automações"
              />

              <div className="grid gap-6 lg:grid-cols-12 mt-6">
                {/* Main Revenue Metric */}
                <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 rounded-xl bg-slate-800/50 border border-emerald-500/20">
                  <CircularProgress
                    value={attributionPercent}
                    size={140}
                    strokeWidth={12}
                    color="#10b981"
                    bgColor="#1e293b"
                    label="do Faturamento"
                    sublabel="Total"
                  />
                  <p className="text-3xl font-bold text-emerald-400 mt-4">{formatCurrency(totalKlaviyoRevenue)}</p>
                  <p className="text-sm text-gray-400">Receita Atribuída Convertfy</p>
                </div>

                {/* Financial Metrics Grid */}
                <div className="lg:col-span-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    title="RECEITA TOTAL LOJA"
                    value={formatCurrency(totalShopifyRevenue)}
                    icon={DollarSign}
                    iconColor="text-blue-400"
                    iconBgColor="bg-blue-400/10"
                    subtitle="Faturamento Shopify"
                  />
                  <MetricCard
                    title="LUCRO ESTIMADO"
                    value={formatCurrency(estimatedProfit)}
                    icon={PiggyBank}
                    iconColor="text-emerald-400"
                    iconBgColor="bg-emerald-400/10"
                    subtitle="30% margem média"
                    trend="up"
                    trendValue={`+${formatPercent(estimatedMargin * 100)}`}
                  />
                  <MetricCard
                    title="ROI CONVERTFY"
                    value={`${roi.toFixed(0)}%`}
                    icon={TrendingUp}
                    iconColor="text-purple-400"
                    iconBgColor="bg-purple-400/10"
                    trend={roi > 0 ? "up" : "down"}
                    trendValue={roi > 0 ? "Positivo" : "Negativo"}
                  />
                  <MetricCard
                    title="TICKET MÉDIO"
                    value={formatCurrencyFull(shopify?.averageOrderValue || 0)}
                    icon={Receipt}
                    iconColor="text-amber-400"
                    iconBgColor="bg-amber-400/10"
                  />
                  <MetricCard
                    title="TOTAL PEDIDOS"
                    value={formatNumber(shopify?.totalOrders || 0)}
                    icon={ShoppingCart}
                    iconColor="text-cyan-400"
                    iconBgColor="bg-cyan-400/10"
                  />
                  <MetricCard
                    title="CLIENTES"
                    value={formatNumber(shopify?.totalCustomers || 0)}
                    icon={Users}
                    iconColor="text-pink-400"
                    iconBgColor="bg-pink-400/10"
                    subtitle={`${formatNumber(shopify?.newCustomers || 0)} novos`}
                  />
                </div>
              </div>

              {/* Revenue Breakdown Bar */}
              <div className="mt-6 p-4 rounded-xl bg-slate-800/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-400">Distribuição da Receita Convertfy</span>
                  <span className="text-sm text-emerald-400">{formatCurrency(totalKlaviyoRevenue)}</span>
                </div>
                <div className="flex h-4 rounded-full overflow-hidden bg-slate-700">
                  {klaviyo?.flowRevenue && klaviyo.flowRevenue > 0 && (
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{ width: `${(klaviyo.flowRevenue / totalKlaviyoRevenue) * 100}%` }}
                      title={`Flows: ${formatCurrency(klaviyo.flowRevenue)}`}
                    />
                  )}
                  {klaviyo?.campaignRevenue && klaviyo.campaignRevenue > 0 && (
                    <div
                      className="bg-blue-500 transition-all"
                      style={{ width: `${(klaviyo.campaignRevenue / totalKlaviyoRevenue) * 100}%` }}
                      title={`Campanhas: ${formatCurrency(klaviyo.campaignRevenue)}`}
                    />
                  )}
                  {klaviyo?.smsRevenue && klaviyo.smsRevenue > 0 && (
                    <div
                      className="bg-amber-500 transition-all"
                      style={{ width: `${(klaviyo.smsRevenue / totalKlaviyoRevenue) * 100}%` }}
                      title={`SMS: ${formatCurrency(klaviyo.smsRevenue)}`}
                    />
                  )}
                </div>
                <div className="flex gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-gray-400">Flows {formatCurrency(klaviyo?.flowRevenue || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-gray-400">Campanhas {formatCurrency(klaviyo?.campaignRevenue || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-gray-400">SMS {formatCurrency(klaviyo?.smsRevenue || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========== ENGAGEMENT & LEADS ========== */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Leads Overview */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <SectionHeader title="BASE DE LEADS" icon={Users} description="Contatos e engajamento" />

                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                    <Users className="h-8 w-8 text-blue-400 mb-3" />
                    <p className="text-3xl font-bold text-white">{formatNumber(klaviyo?.totalLeads || 0)}</p>
                    <p className="text-sm text-gray-400">Total de Leads</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-3xl font-bold text-emerald-400">{formatNumber(klaviyo?.engagedLeads || 0)}</p>
                        <p className="text-sm text-gray-400">Leads Engajados 90d</p>
                      </div>
                      <CircularProgress
                        value={klaviyo?.engagementRate || 0}
                        size={70}
                        strokeWidth={6}
                        color="#10b981"
                        bgColor="#1e293b"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-400">Taxa de Engajamento</span>
                    <span className="text-sm font-medium text-emerald-400">{formatPercent(klaviyo?.engagementRate || 0)}</span>
                  </div>
                  <Progress value={klaviyo?.engagementRate || 0} className="h-2 bg-slate-700" />
                </div>
              </div>

              {/* Email Performance */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <SectionHeader title="PERFORMANCE DE EMAIL" icon={Mail} description="Métricas de entrega e engajamento" />

                <div className="grid grid-cols-5 gap-3 mt-4">
                  {[
                    { label: "Entregues", value: klaviyo?.delivered || 0, icon: Send, color: "text-blue-400" },
                    { label: "Abertura", value: `${(klaviyo?.openRate || 0).toFixed(1)}%`, icon: Eye, color: "text-emerald-400" },
                    { label: "Cliques", value: `${(klaviyo?.clickRate || 0).toFixed(1)}%`, icon: MousePointerClick, color: "text-amber-400" },
                    { label: "CTOR", value: `${(klaviyo?.clickToOpenRate || 0).toFixed(1)}%`, icon: Target, color: "text-purple-400" },
                    { label: "Bounces", value: klaviyo?.bounces || 0, icon: AlertCircle, color: "text-red-400" },
                  ].map((metric) => (
                    <div key={metric.label} className="text-center p-3 rounded-xl bg-slate-900/50 border border-slate-700/30">
                      <metric.icon className={`h-5 w-5 mx-auto mb-2 ${metric.color}`} />
                      <p className="text-lg font-bold text-white">
                        {typeof metric.value === "number" ? formatNumber(metric.value) : metric.value}
                      </p>
                      <p className="text-[10px] text-gray-500 uppercase">{metric.label}</p>
                    </div>
                  ))}
                </div>

                {/* Open Rate Progress */}
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Taxa de Abertura", value: klaviyo?.openRate || 0, color: "bg-emerald-500" },
                    { label: "Taxa de Clique", value: klaviyo?.clickRate || 0, color: "bg-amber-500" },
                    { label: "Click-to-Open Rate", value: klaviyo?.clickToOpenRate || 0, color: "bg-purple-500" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-32">{item.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${Math.min(item.value, 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-white w-12 text-right">{item.value.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ========== FLOWS & CAMPAIGNS ========== */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Flows */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <SectionHeader title="AUTOMAÇÕES (FLOWS)" icon={Zap} />

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-3xl font-bold text-emerald-400">{klaviyo?.activeFlows || 0}</p>
                    <p className="text-sm text-gray-400">Flows Ativos</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                    <p className="text-3xl font-bold text-white">{klaviyo?.flowsCount || 0}</p>
                    <p className="text-sm text-gray-400">Total de Flows</p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(klaviyo?.flowRevenue || 0)}</p>
                      <p className="text-sm text-gray-400">Receita de Flows</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">
                        {formatPercent(klaviyo?.totalRevenue ? ((klaviyo.flowRevenue || 0) / klaviyo.totalRevenue) * 100 : 0)}
                      </p>
                      <p className="text-xs text-gray-500">da Receita Convertfy</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaigns */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <SectionHeader title="CAMPANHAS" icon={Send} />

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <p className="text-3xl font-bold text-blue-400">{klaviyo?.campaignsCount || 0}</p>
                    <p className="text-sm text-gray-400">Enviadas</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                    <p className="text-3xl font-bold text-white">{formatNumber(klaviyo?.campaignDelivered || 0)}</p>
                    <p className="text-sm text-gray-400">Entregues</p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-blue-400">{formatCurrency(klaviyo?.campaignRevenue || 0)}</p>
                      <p className="text-sm text-gray-400">Receita de Campanhas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">
                        {formatPercent(klaviyo?.totalRevenue ? ((klaviyo.campaignRevenue || 0) / klaviyo.totalRevenue) * 100 : 0)}
                      </p>
                      <p className="text-xs text-gray-500">da Receita Convertfy</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ========== TOP FLOWS TABLE ========== */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
              <SectionHeader title="TOP AUTOMAÇÕES POR RECEITA" icon={BarChart3} />

              {!klaviyo?.topFlows || klaviyo.topFlows.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">Nenhum flow com receita no período</p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-gray-400 w-12">#</TableHead>
                        <TableHead className="text-gray-400">Nome do Flow</TableHead>
                        <TableHead className="text-gray-400 text-right">Entregues</TableHead>
                        <TableHead className="text-gray-400 text-right">Abertura</TableHead>
                        <TableHead className="text-gray-400 text-right">Cliques</TableHead>
                        <TableHead className="text-gray-400 text-right">Receita</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {klaviyo.topFlows.slice(0, 10).map((flow, index) => (
                        <TableRow key={flow.id} className="border-slate-700/50 hover:bg-slate-700/30">
                          <TableCell>
                            <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                              {index + 1}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-white">{flow.name}</TableCell>
                          <TableCell className="text-right text-gray-300">{formatNumber(flow.delivered || 0)}</TableCell>
                          <TableCell className="text-right text-gray-300">{formatPercent(flow.openRate || 0)}</TableCell>
                          <TableCell className="text-right text-gray-300">{formatPercent(flow.clickRate || 0)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-400">{formatCurrencyFull(flow.revenue || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* ========== TOP PRODUCTS ========== */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
              <SectionHeader title="TOP 5 PRODUTOS MAIS VENDIDOS" icon={Package} />

              {!shopify?.topProducts || shopify.topProducts.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">Nenhum produto vendido no período</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {shopify.topProducts.slice(0, 5).map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/30 hover:bg-slate-700/30 transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? "bg-amber-500/20 text-amber-400" :
                        index === 1 ? "bg-gray-400/20 text-gray-400" :
                        index === 2 ? "bg-orange-500/20 text-orange-400" :
                        "bg-slate-600/20 text-slate-400"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white truncate">{product.name}</h4>
                        <p className="text-sm text-gray-500">
                          {formatNumber(product.quantity)} unidades vendidas
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-400">{formatCurrencyFull(product.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ========== UPCOMING CAMPAIGNS & MEETINGS ========== */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Upcoming Campaigns */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <SectionHeader title="PRÓXIMAS CAMPANHAS" icon={CalendarDays} />
                  <Button variant="ghost" size="sm" asChild className="text-gray-400 hover:text-white hover:bg-slate-700">
                    <Link href="/portal/campaigns">
                      Ver todas
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                {(data.upcomingCampaigns?.length || 0) === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-10 w-10 mx-auto mb-2 text-gray-600" />
                    <p className="text-gray-400">Nenhuma campanha agendada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.upcomingCampaigns.slice(0, 4).map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-700/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{campaign.name}</p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(campaign.scheduledDate)}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          Agendada
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Meetings */}
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <SectionHeader title="PRÓXIMAS REUNIÕES" icon={Video} description="Reuniões agendadas com a equipe" />

                {(data.meetings?.length || 0) === 0 ? (
                  <div className="text-center py-8">
                    <Video className="h-10 w-10 mx-auto mb-2 text-gray-600" />
                    <p className="text-gray-400">Nenhuma reunião agendada</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-4">
                    {data.meetings.slice(0, 4).map((meeting) => (
                      <div
                        key={meeting.id}
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-700/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Video className="h-5 w-5 text-purple-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{meeting.title}</p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(meeting.scheduledAt)}
                              {meeting.duration && ` • ${meeting.duration} min`}
                            </p>
                          </div>
                        </div>
                        {meeting.meetingUrl && (
                          <Button size="sm" className="bg-purple-500 hover:bg-purple-600 text-white" asChild>
                            <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">
                              Entrar
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ========== FINANCIAL SECTION ========== */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader title="FINANCEIRO" icon={CreditCard} description="Controle de faturas e pagamentos" />
                <Button variant="ghost" size="sm" asChild className="text-gray-400 hover:text-white hover:bg-slate-700">
                  <Link href="/portal/invoices">
                    Ver todas
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              {/* Financial Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-3 mt-4">
                <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-amber-400" />
                    <span className="text-sm text-amber-400">Total Pendente</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-400">
                    {formatCurrencyFull(data.invoices?.totalPending || 0)}
                  </p>
                  <p className="text-xs text-amber-500/70 mt-1">
                    {data.invoices?.pending || 0} fatura(s)
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <span className="text-sm text-red-400">Total Vencido</span>
                  </div>
                  <p className="text-2xl font-bold text-red-400">
                    {formatCurrencyFull(data.invoices?.totalOverdue || 0)}
                  </p>
                  <p className="text-xs text-red-500/70 mt-1">
                    {data.invoices?.overdue || 0} fatura(s)
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm text-emerald-400">Total Pago</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {formatCurrencyFull(data.invoices?.totalPaid || 0)}
                  </p>
                  <p className="text-xs text-emerald-500/70 mt-1">
                    Pagamentos realizados
                  </p>
                </div>
              </div>

              {/* Recent Invoices */}
              {data.invoices?.recent && data.invoices.recent.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Últimas Faturas</h4>
                  <div className="space-y-2">
                    {data.invoices.recent.slice(0, 5).map((invoice) => {
                      const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== "paid"
                      return (
                        <div
                          key={invoice.id}
                          className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-700/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              invoice.status === "paid" ? "bg-emerald-500/20" :
                              isOverdue ? "bg-red-500/20" : "bg-amber-500/20"
                            }`}>
                              {invoice.status === "paid" ? (
                                <CheckCircle className="h-5 w-5 text-emerald-400" />
                              ) : isOverdue ? (
                                <AlertCircle className="h-5 w-5 text-red-400" />
                              ) : (
                                <Clock className="h-5 w-5 text-amber-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-white">{formatCurrencyFull(invoice.amount)}</p>
                              <p className="text-xs text-gray-500">
                                Vencimento: {formatDate(invoice.dueDate)}
                              </p>
                            </div>
                          </div>
                          <Badge className={
                            invoice.status === "paid" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            isOverdue ? "bg-red-500/20 text-red-400 border-red-500/30" :
                            "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          }>
                            {invoice.status === "paid" ? "Paga" :
                             isOverdue ? "Vencida" :
                             invoice.status === "pending" ? "Pendente" : invoice.status}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Last Updated Footer */}
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">
            Última atualização: {data.lastUpdated ? formatDateTime(data.lastUpdated) : "Agora"}
          </p>
        </div>
      </div>
    </div>
  )
}
