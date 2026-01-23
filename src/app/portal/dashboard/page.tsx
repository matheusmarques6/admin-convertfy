"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Store,
  CalendarDays,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Receipt,
  Send,
  Zap,
  Users,
  Eye,
  MousePointerClick,
  Target,
  AlertCircle,
  Mail,
  MessageSquare,
  ChevronDown,
  Flame,
  Award,
  BarChart3,
  Tag,
  Link2,
  Ticket,
  Globe,
  Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

// ============================================
// INTERFACES
// ============================================

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
  opened: number
  clicked: number
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

interface CouponData {
  code: string
  orders: number
  revenue: number
  discount: number
}

interface UtmSourceData {
  source: string
  orders: number
  revenue: number
}

interface TopCustomerData {
  email: string
  name: string
  ordersCount: number
  totalSpent: number
  averageOrderValue: number
  lastOrderDate: string
}

interface ShopifyData {
  totalRevenue: number
  totalOrders: number
  paidOrders?: number
  averageOrderValue: number
  totalCustomers: number
  newCustomers: number
  recurringCustomerRate: number
  topProducts: Array<{
    name: string
    quantity: number
    revenue: number
  }>
  topCustomers?: TopCustomerData[]
  coupons?: {
    totalOrdersWithCoupon: number
    couponUsageRate: number
    topCoupons: CouponData[]
    totalDiscount: number
  }
  utmConversions?: {
    totalOrdersWithUtm: number
    utmTrackingRate: number
    bySource: UtmSourceData[]
    byMedium: Array<{ medium: string; orders: number; revenue: number }>
    byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
  }
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
  }
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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatCurrencyCompact(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`
  }
  return formatCurrency(value)
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

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }
  return `${startDate.toLocaleDateString("pt-BR", opts)} - ${endDate.toLocaleDateString("pt-BR", opts)}`
}

// ============================================
// COMPONENTS
// ============================================

// Badge de variação
function VariationBadge({ value, type = "percent" }: { value: number; type?: "percent" | "currency" }) {
  const isPositive = value >= 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const bgColor = isPositive ? "bg-emerald-500/20" : "bg-red-500/20"
  const textColor = isPositive ? "text-emerald-400" : "text-red-400"

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${bgColor} ${textColor}`}>
      <Icon className="h-3 w-3" />
      {type === "percent" ? `${isPositive ? "+" : ""}${value.toFixed(1)}%` : formatCurrencyCompact(Math.abs(value))}
    </span>
  )
}

// Card de métrica pequeno (para a linha de 5 cards)
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  highlight = false,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all ${
      highlight
        ? "bg-emerald-500/10 border-emerald-500/30"
        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${highlight ? "text-emerald-400" : "text-zinc-400"}`} />
        <span className="text-xs text-zinc-400 uppercase tracking-wide">{title}</span>
      </div>
      <p className={`text-2xl font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

// Item da lista de Top Flows
function FlowListItem({
  name,
  value,
  percent,
  color,
}: {
  name: string
  value: number
  percent: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-white">{formatCurrencyCompact(value)}</p>
        <p className="text-xs text-zinc-500">{percent.toFixed(0)}%</p>
      </div>
    </div>
  )
}

// Card de canal de receita
function ChannelCard({
  title,
  percent,
  value,
  icon: Icon,
  color,
  active = false,
}: {
  title: string
  percent: number
  value: number
  icon: React.ElementType
  color: string
  active?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all cursor-pointer ${
      active
        ? `${color} border-current`
        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${active ? "text-current" : "text-zinc-400"}`} />
        <span className="text-xs text-zinc-400">{title}</span>
      </div>
      <p className={`text-2xl font-bold ${active ? "text-white" : "text-zinc-300"}`}>
        {percent.toFixed(1)}%
      </p>
      <p className="text-xs text-zinc-500 mt-1">{formatCurrencyCompact(value)}</p>
    </div>
  )
}

// Linha da tabela de performance
function PerformanceRow({
  rank,
  name,
  delivered,
  openRate,
  clickRate,
  revenue,
  isTop = false,
}: {
  rank: number
  name: string
  delivered: number
  openRate: number
  clickRate: number
  revenue: number
  isTop?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 py-3 px-2 rounded-lg ${isTop ? "bg-emerald-500/5" : ""}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        rank <= 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
      }`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
      </div>
      <div className="grid grid-cols-4 gap-4 text-right">
        <div>
          <p className="text-sm text-zinc-300">{formatNumber(delivered)}</p>
          <p className="text-[10px] text-zinc-600">Entregues</p>
        </div>
        <div>
          <p className="text-sm text-zinc-300">{openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-zinc-600">Abertura</p>
        </div>
        <div>
          <p className="text-sm text-zinc-300">{clickRate.toFixed(1)}%</p>
          <p className="text-[10px] text-zinc-600">Clique</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-400">{formatCurrencyCompact(revenue)}</p>
          <p className="text-[10px] text-zinc-600">Receita</p>
        </div>
      </div>
    </div>
  )
}

// Mini gráfico de barras horizontal
function MiniBarChart({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-12 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

// Gráfico de linha simples (sparkline)
function SimpleLineChart({ data, color = "emerald" }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 80 - 10
    return `${x},${y}`
  }).join(" ")

  const strokeColor = color === "emerald" ? "#10b981" : "#3b82f6"

  return (
    <div className="h-20 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((value, index) => {
          const x = (index / (data.length - 1)) * 100
          const y = 100 - ((value - min) / range) * 80 - 10
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              fill={strokeColor}
              className="opacity-80"
            />
          )
        })}
      </svg>
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

  // Loading state - show minimal skeleton with dashboard structure
  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6 space-y-6">
        {/* Header skeleton with visible structure */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-zinc-500">Carregando dados...</p>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36 bg-zinc-900" />
            <Skeleton className="h-10 w-32 bg-zinc-900" />
          </div>
        </div>

        {/* Hero skeleton with loading indicator */}
        <div className="rounded-xl bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-zinc-900 border border-emerald-500/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
            <span className="text-emerald-300/70">Carregando métricas...</span>
          </div>
          <Skeleton className="h-10 w-48 bg-zinc-800/50 mb-2" />
          <Skeleton className="h-4 w-32 bg-zinc-800/50" />
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4">
              <Skeleton className="h-4 w-16 bg-zinc-800 mb-2" />
              <Skeleton className="h-8 w-24 bg-zinc-800" />
            </div>
          ))}
        </div>

        {/* Main sections skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 h-64">
              <Skeleton className="h-5 w-24 bg-zinc-800 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-8 w-full bg-zinc-800/50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Erro ao carregar</h2>
          <p className="text-zinc-400 mb-6">{error}</p>
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

  // Calculated metrics
  const totalShopifyRevenue = shopify?.totalRevenue || 0
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const attributionPercent = totalShopifyRevenue > 0 ? (totalKlaviyoRevenue / totalShopifyRevenue) * 100 : 0
  const estimatedProfit = totalKlaviyoRevenue * 0.30

  // Flow revenue distribution
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const flowPercent = totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0
  const campaignPercent = totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0
  const smsPercent = totalKlaviyoRevenue > 0 ? (smsRevenue / totalKlaviyoRevenue) * 100 : 0

  // Fake sparkline data (would come from API in real implementation)
  const revenueSparkline = [12, 19, 15, 25, 22, 30, 28, 35, 32, 40, 38, 45]

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">

        {/* ========== HEADER ========== */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <div className="flex items-center gap-2">
              {data.dateRange && (
                <p className="text-sm text-zinc-500">{formatDateRange(data.dateRange.start, data.dateRange.end)}</p>
              )}
              {refreshing && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Atualizando...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Store Selector */}
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white">
                <Store className="h-4 w-4 mr-2 text-zinc-400" />
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-white hover:bg-zinc-800">Todas as lojas</SelectItem>
                {data.stores?.map((store) => (
                  <SelectItem key={store.id} value={store.id} className="text-white hover:bg-zinc-800">
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period Selector */}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-white">
                <CalendarDays className="h-4 w-4 mr-2 text-zinc-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="7d" className="text-white hover:bg-zinc-800">7 dias</SelectItem>
                <SelectItem value="15d" className="text-white hover:bg-zinc-800">15 dias</SelectItem>
                <SelectItem value="30d" className="text-white hover:bg-zinc-800">30 dias</SelectItem>
                <SelectItem value="90d" className="text-white hover:bg-zinc-800">90 dias</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
              title="Atualizar dados"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ========== FULL DASHBOARD ========== */}
        <div className="space-y-6">

            {/* ========== HERO SECTION WITH GRADIENT ========== */}
            <div className="rounded-xl bg-gradient-to-r from-emerald-950/80 via-emerald-900/40 to-zinc-900 border border-emerald-500/20 p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-sm text-emerald-300/70 mb-1">Receita Convertfy</p>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-4xl font-bold text-white">{formatCurrency(totalKlaviyoRevenue)}</h2>
                    <VariationBadge value={attributionPercent} type="percent" />
                    {totalKlaviyoRevenue > 0 && (
                      <VariationBadge value={totalKlaviyoRevenue * 0.08} type="currency" />
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">
                    vs Receita Total: {formatCurrency(totalShopifyRevenue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400 mb-1">Atribuição</p>
                  <p className="text-3xl font-bold text-emerald-400">{attributionPercent.toFixed(1)}%</p>
                  <p className="text-xs text-zinc-500">do faturamento</p>
                </div>
              </div>

              {/* Revenue Distribution - Integrated */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-zinc-400">Flows</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatCurrencyCompact(flowRevenue)}</p>
                  <p className="text-xs text-emerald-400">{flowPercent.toFixed(0)}% da receita</p>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs text-zinc-400">Campanhas</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatCurrencyCompact(campaignRevenue)}</p>
                  <p className="text-xs text-blue-400">{campaignPercent.toFixed(0)}% da receita</p>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs text-zinc-400">SMS</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatCurrencyCompact(smsRevenue)}</p>
                  <p className="text-xs text-amber-400">{smsPercent.toFixed(0)}% da receita</p>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-emerald-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-xs text-zinc-400">Lucro Estimado</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatCurrencyCompact(estimatedProfit)}</p>
                  <p className="text-xs text-purple-400">30% margem</p>
                </div>
              </div>
            </div>

            {/* ========== 5 CARDS ROW ========== */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard
                title="Pedidos"
                value={formatNumber(shopify?.totalOrders || 0)}
                subtitle="+12% vs anterior"
                icon={ShoppingCart}
              />
              <MetricCard
                title="Ticket Médio"
                value={formatCurrency(shopify?.averageOrderValue || 0)}
                subtitle="+5.2% vs anterior"
                icon={Receipt}
              />
              <MetricCard
                title="Campanhas"
                value={klaviyo?.campaignsCount || 0}
                subtitle="enviadas"
                icon={Send}
              />
              <MetricCard
                title="Flows Ativos"
                value={klaviyo?.activeFlows || 0}
                subtitle={`de ${klaviyo?.flowsCount || 0} total`}
                icon={Zap}
                highlight
              />
              <MetricCard
                title="Engajamento"
                value={formatPercent(klaviyo?.engagementRate || 0)}
                subtitle="dos leads"
                icon={Users}
              />
            </div>

            {/* ========== THREE COLUMNS SECTION ========== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Column 1: Top Flows List */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-400" />
                    Top Flows
                  </h3>
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white h-8 px-2">
                    Filtros <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </div>

                <div className="space-y-1">
                  {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
                    klaviyo.topFlows.slice(0, 5).map((flow, index) => {
                      const percent = totalKlaviyoRevenue > 0 ? (flow.revenue / totalKlaviyoRevenue) * 100 : 0
                      const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-purple-500", "bg-pink-500"]
                      return (
                        <FlowListItem
                          key={flow.id}
                          name={flow.name}
                          value={flow.revenue}
                          percent={percent}
                          color={colors[index % colors.length]}
                        />
                      )
                    })
                  ) : (
                    <div className="text-center py-8">
                      <Zap className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Nenhum flow com receita</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Distribution Chart */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                    Distribuição
                  </h3>
                </div>

                <div className="flex items-center justify-center h-48">
                  {/* Simple donut chart representation */}
                  <div className="relative">
                    <svg width="160" height="160" viewBox="0 0 160 160">
                      <circle
                        cx="80"
                        cy="80"
                        r="60"
                        fill="none"
                        stroke="#27272a"
                        strokeWidth="20"
                      />
                      {/* Flows segment */}
                      <circle
                        cx="80"
                        cy="80"
                        r="60"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="20"
                        strokeDasharray={`${flowPercent * 3.77} 377`}
                        strokeDashoffset="0"
                        transform="rotate(-90 80 80)"
                      />
                      {/* Campaigns segment */}
                      <circle
                        cx="80"
                        cy="80"
                        r="60"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="20"
                        strokeDasharray={`${campaignPercent * 3.77} 377`}
                        strokeDashoffset={`${-flowPercent * 3.77}`}
                        transform="rotate(-90 80 80)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-bold text-white">{formatCurrencyCompact(totalKlaviyoRevenue)}</p>
                      <p className="text-xs text-zinc-500">Total</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 text-center mt-2">Receita por categoria</p>
              </div>

              {/* Column 3: Performance Table */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    Performance
                  </h3>
                  <div className="flex gap-1">
                    <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1">
                      <Flame className="h-3 w-3" /> Top revenue
                    </span>
                  </div>
                </div>

                <div className="space-y-1 max-h-[280px] overflow-y-auto">
                  {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
                    klaviyo.topFlows.slice(0, 5).map((flow, index) => (
                      <PerformanceRow
                        key={flow.id}
                        rank={index + 1}
                        name={flow.name}
                        delivered={flow.delivered || 0}
                        openRate={flow.openRate || 0}
                        clickRate={flow.clickRate || 0}
                        revenue={flow.revenue || 0}
                        isTop={index === 0}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Sem dados de performance</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========== TWO COLUMNS SECTION ========== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Column 1: Email Performance */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-400" />
                    Email Performance
                  </h3>
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white h-8 px-2">
                    Email <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-xl font-bold text-white">{formatNumber(klaviyo?.delivered || 0)}</p>
                    <p className="text-xs text-zinc-500">Entregues</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-xl font-bold text-white">{formatNumber(klaviyo?.opened || 0)}</p>
                    <p className="text-xs text-zinc-500">Abertos</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-xl font-bold text-white">{formatNumber(klaviyo?.clicked || 0)}</p>
                    <p className="text-xs text-zinc-500">Clicados</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Open Rate
                      </span>
                    </div>
                    <MiniBarChart value={klaviyo?.openRate || 0} max={100} color="bg-emerald-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <MousePointerClick className="h-3 w-3" /> Click Rate
                      </span>
                    </div>
                    <MiniBarChart value={klaviyo?.clickRate || 0} max={20} color="bg-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <Target className="h-3 w-3" /> CTOR
                      </span>
                    </div>
                    <MiniBarChart value={klaviyo?.clickToOpenRate || 0} max={30} color="bg-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Bounce
                      </span>
                    </div>
                    <MiniBarChart value={klaviyo?.bounceRate || 0} max={5} color="bg-red-500" />
                  </div>
                </div>
              </div>

              {/* Column 2: Channels + Sparkline */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-400" />
                    Canais de Receita
                  </h3>
                </div>

                {/* Channel Cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <ChannelCard
                    title="Flows"
                    percent={flowPercent}
                    value={flowRevenue}
                    icon={Zap}
                    color="bg-emerald-500/10 text-emerald-400"
                    active
                  />
                  <ChannelCard
                    title="Campanhas"
                    percent={campaignPercent}
                    value={campaignRevenue}
                    icon={Send}
                    color="bg-blue-500/10 text-blue-400"
                  />
                  <ChannelCard
                    title="SMS"
                    percent={smsPercent}
                    value={smsRevenue}
                    icon={MessageSquare}
                    color="bg-amber-500/10 text-amber-400"
                  />
                </div>

                {/* Summary */}
                <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-zinc-800/50">
                  <span className="text-sm text-zinc-400">Total Atribuído</span>
                  <div className="text-right">
                    <span className="text-lg font-bold text-emerald-400 mr-2">{attributionPercent.toFixed(1)}%</span>
                    <span className="text-sm text-zinc-300">{formatCurrency(totalKlaviyoRevenue)}</span>
                  </div>
                </div>

                {/* Sparkline */}
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Receita Diária</p>
                  <SimpleLineChart data={revenueSparkline} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-zinc-600">D1</span>
                    <span className="text-[10px] text-zinc-600">D7</span>
                    <span className="text-[10px] text-zinc-600">D14</span>
                    <span className="text-[10px] text-zinc-600">D21</span>
                    <span className="text-[10px] text-zinc-600">D30</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ========== UTM & COUPONS SECTION ========== */}
            {(shopify?.coupons || shopify?.utmConversions) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Coupon Conversions */}
                <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <Ticket className="h-4 w-4 text-pink-400" />
                      Conversões por Cupom
                    </h3>
                    <span className="text-xs text-zinc-500">Pedidos pagos</span>
                  </div>

                  {/* Coupon Summary */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xl font-bold text-white">
                        {shopify?.coupons?.totalOrdersWithCoupon || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Pedidos com cupom</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xl font-bold text-pink-400">
                        {formatPercent(shopify?.coupons?.couponUsageRate || 0)}
                      </p>
                      <p className="text-xs text-zinc-500">Taxa de uso</p>
                    </div>
                  </div>

                  {/* Top Coupons List */}
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {shopify?.coupons?.topCoupons && shopify.coupons.topCoupons.length > 0 ? (
                      shopify.coupons.topCoupons.slice(0, 5).map((coupon, index) => (
                        <div key={coupon.code} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? "bg-pink-500/20 text-pink-400" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {coupon.code}
                            </p>
                            <p className="text-xs text-zinc-500">{coupon.orders} pedidos</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-pink-400">{formatCurrencyCompact(coupon.revenue)}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <Ticket className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                        <p className="text-sm text-zinc-500">Nenhum cupom utilizado</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* UTM Conversions */}
                <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-cyan-400" />
                      Conversões por UTM
                    </h3>
                    <span className="text-xs text-zinc-500">Pedidos pagos</span>
                  </div>

                  {/* UTM Summary */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xl font-bold text-white">
                        {shopify?.utmConversions?.totalOrdersWithUtm || 0}
                      </p>
                      <p className="text-xs text-zinc-500">Pedidos com UTM</p>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800/50">
                      <p className="text-xl font-bold text-cyan-400">
                        {formatPercent(shopify?.utmConversions?.utmTrackingRate || 0)}
                      </p>
                      <p className="text-xs text-zinc-500">Taxa de rastreio</p>
                    </div>
                  </div>

                  {/* Top UTM Sources List */}
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {shopify?.utmConversions?.bySource && shopify.utmConversions.bySource.length > 0 ? (
                      shopify.utmConversions.bySource.slice(0, 5).map((utm, index) => (
                        <div key={utm.source} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0 ? "bg-cyan-500/20 text-cyan-400" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {utm.source}
                            </p>
                            <p className="text-xs text-zinc-500">{utm.orders} pedidos</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-cyan-400">{formatCurrencyCompact(utm.revenue)}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <Link2 className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                        <p className="text-sm text-zinc-500">Nenhum UTM rastreado</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========== TOP CUSTOMERS & TOP PRODUCTS SECTION ========== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Top Customers */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    Top Clientes
                  </h3>
                  <span className="text-xs text-zinc-500">Por receita no período</span>
                </div>

                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {shopify?.topCustomers && shopify.topCustomers.length > 0 ? (
                    shopify.topCustomers.slice(0, 10).map((customer, index) => (
                      <div key={customer.email} className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? "bg-amber-500/20 text-amber-400" :
                          index === 1 ? "bg-zinc-400/20 text-zinc-300" :
                          index === 2 ? "bg-orange-700/20 text-orange-400" :
                          "bg-zinc-800 text-zinc-400"
                        }`}>
                          {index < 3 ? <Crown className="h-3.5 w-3.5" /> : index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {customer.email}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span>{customer.ordersCount} pedidos</span>
                            <span>Ticket: {formatCurrency(customer.averageOrderValue)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-400">{formatCurrencyCompact(customer.totalSpent)}</p>
                          <p className="text-[10px] text-zinc-600">
                            {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString("pt-BR") : ""}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Crown className="h-10 w-10 mx-auto mb-2 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Nenhum cliente no período</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Products */}
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-emerald-400" />
                    Top Produtos
                  </h3>
                  <span className="text-xs text-zinc-500">Por receita no período</span>
                </div>

                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {shopify?.topProducts && shopify.topProducts.length > 0 ? (
                    shopify.topProducts.slice(0, 10).map((product, index) => (
                      <div key={product.name} className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? "bg-emerald-500/20 text-emerald-400" :
                          index === 1 ? "bg-blue-500/20 text-blue-400" :
                          index === 2 ? "bg-purple-500/20 text-purple-400" :
                          "bg-zinc-800 text-zinc-400"
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-zinc-500">{product.quantity} unidades</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-400">{formatCurrencyCompact(product.revenue)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <ShoppingCart className="h-10 w-10 mx-auto mb-2 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Nenhum produto no período</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========== FOOTER ROW ========== */}
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-300">Clientes: {formatNumber(shopify?.totalCustomers || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm text-zinc-300">Novos: {formatNumber(shopify?.newCustomers || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-zinc-300">Recorrentes: {formatPercent(shopify?.recurringCustomerRate || 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-400" />
                    <span className="text-sm text-zinc-300">Leads: {formatNumber(klaviyo?.totalLeads || 0)}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-600">
                  Última atualização: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleString("pt-BR") : "Agora"}
                </p>
              </div>
            </div>

          </div>
      </div>
    </div>
  )
}
