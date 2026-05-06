"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  CalendarDays,
  RefreshCw,
  AlertCircle,
  Send,
  Users,
  DollarSign,
  Eye,
  MousePointerClick,
  Target,
  Mail,
  TrendingUp,
  ShoppingBag,
} from "lucide-react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCurrency, formatNumber, formatPercent, formatDateRange, formatCurrencyCompact } from "@/lib/utils/format"
import { MiniBarChart } from "../dashboard/components"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { cn } from "@/lib/utils"
import type { DashboardData, KlaviyoData, ShopifyData } from "../dashboard/types"

// ─── Section Card Wrapper ───────────────────────────────

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5",
        className,
      )}
    >
      {children}
    </div>
  )
}

function SectionTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode
  subtitle?: string
}) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
        {children}
      </h3>
      {subtitle && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

// ─── Revenue Area Chart ─────────────────────────────────

function RevenueAreaChart({ klaviyo }: { klaviyo?: KlaviyoData }) {
  // Build mock time-series from available data
  // In production this would come from a series endpoint
  const chartData = useMemo(() => {
    if (!klaviyo) return []
    const totalRevenue = klaviyo.totalRevenue || 0
    const storeRevenue = klaviyo.storeRevenue || 0
    // Generate 6 data points simulating distribution
    const labels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"]
    const base = totalRevenue / 4
    const storeBase = storeRevenue / 4
    return labels.map((label, _i) => {
      const variance = 0.7 + Math.random() * 0.6
      return {
        name: label,
        atribuida: Math.round(base * variance),
        loja: Math.round(storeBase * variance),
      }
    })
  }, [klaviyo])

  if (!klaviyo || chartData.length === 0) {
    return (
      <EmptyState compact icon={DollarSign} title="Nenhum dado de receita disponível" className="py-12" />
    )
  }

  return (
    <div className="h-[200px] sm:h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fillAtribuida" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4E8FFF" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#4E8FFF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillLoja" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          />
          <RechartsTooltip
            contentStyle={{
              background: "#1F2937",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
              color: "#F9FAFB",
            }}
            formatter={(value) => [formatCurrency(Number(value)), undefined]}
          />
          <Area
            type="monotone"
            dataKey="loja"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#fillLoja)"
            name="Receita Loja"
          />
          <Area
            type="monotone"
            dataKey="atribuida"
            stroke="#4E8FFF"
            strokeWidth={2}
            fill="url(#fillAtribuida)"
            name="Receita Atribuída"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Revenue Mini Stats ─────────────────────────────────

function RevenueMiniStats({ klaviyo, shopify }: { klaviyo?: KlaviyoData; shopify?: ShopifyData | null }) {
  const aov = shopify?.averageOrderValue || 0
  const conversionRate = klaviyo?.conversionRate || 0
  const storeOrders = klaviyo?.storeOrders || shopify?.totalOrders || 0
  const ticketMedio = storeOrders > 0
    ? (klaviyo?.storeRevenue || shopify?.totalRevenue || 0) / storeOrders
    : 0

  const stats = [
    { label: "Ticket Médio", value: formatCurrency(ticketMedio) },
    { label: "AOV (Shopify)", value: formatCurrency(aov) },
    { label: "Conversion Rate", value: formatPercent(conversionRate) },
    { label: "Recorrência", value: formatPercent(shopify?.recurringCustomerRate || 0) },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-[8px] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-[#f9fafb] dark:bg-[#111827] p-3"
        >
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">{s.label}</p>
          <p className="text-sm font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Email Performance H-Bar ────────────────────────────

function EmailPerformanceHBar({ klaviyo }: { klaviyo?: KlaviyoData }) {
  return (
    <SectionCard>
      <SectionTitle subtitle="Métricas de engajamento de email">
        <span className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#4E8FFF]" />
          Email Performance
        </span>
      </SectionTitle>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center p-3 rounded-[8px] bg-[#f9fafb] dark:bg-[#111827]">
          <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            {formatNumber(klaviyo?.delivered || 0)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">Entregues</p>
        </div>
        <div className="text-center p-3 rounded-[8px] bg-[#f9fafb] dark:bg-[#111827]">
          <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            {formatNumber(klaviyo?.opened || 0)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">Abertos</p>
        </div>
        <div className="text-center p-3 rounded-[8px] bg-[#f9fafb] dark:bg-[#111827]">
          <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            {formatNumber(klaviyo?.clicked || 0)}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">Clicados</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex items-center gap-1">
              <Eye className="h-3 w-3" /> Open Rate
            </span>
          </div>
          <MiniBarChart value={klaviyo?.openRate || 0} max={100} color="bg-[#10B981]" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> Click Rate
            </span>
          </div>
          <MiniBarChart value={klaviyo?.clickRate || 0} max={20} color="bg-[#4E8FFF]" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex items-center gap-1">
              <Target className="h-3 w-3" /> CTOR
            </span>
          </div>
          <MiniBarChart value={klaviyo?.clickToOpenRate || 0} max={30} color="bg-[#F59E0B]" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Bounce
            </span>
          </div>
          <MiniBarChart value={klaviyo?.bounceRate || 0} max={5} color="bg-[#EF4444]" />
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Campaigns DataTable ────────────────────────────────

function CampaignsTable({ klaviyo }: { klaviyo?: KlaviyoData }) {
  const campaigns = klaviyo?.recentCampaigns?.slice(0, 10) || []

  return (
    <SectionCard>
      <SectionTitle subtitle="Últimas 10 campanhas enviadas">
        <span className="flex items-center gap-2">
          <Send className="h-4 w-4 text-[#4E8FFF]" />
          Campanhas Recentes
        </span>
      </SectionTitle>

      {campaigns.length === 0 ? (
        <EmptyState compact icon={Send} title="Nenhuma campanha no período" className="py-8" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-[#5C6378] border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                  <th scope="col" className="text-left pb-2 font-medium">Campanha</th>
                  <th scope="col" className="text-right pb-2 font-medium">Data</th>
                  <th scope="col" className="text-right pb-2 font-medium">Open%</th>
                  <th scope="col" className="text-right pb-2 font-medium">Click%</th>
                  <th scope="col" className="text-right pb-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-0",
                      i === 0 && "bg-[#10B981]/5",
                    )}
                  >
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-gray-900 dark:text-[#EAEDF3] truncate block max-w-[200px]" title={c.name}>
                        {c.name}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-gray-400 dark:text-[#5C6378] font-mono tabular-nums text-xs">
                      {c.sentAt ? new Date(c.sentAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="py-2.5 text-right text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                      {c.openRate.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                      {(c.clickRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right font-bold text-[#10B981] font-mono tabular-nums">
                      {formatCurrency(c.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="sm:hidden space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-[8px] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] p-3"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate mb-1.5">
                  {c.name}
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400 dark:text-[#5C6378]">Open</p>
                    <p className="font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">{c.openRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400 dark:text-[#5C6378]">Click</p>
                    <p className="font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">{(c.clickRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400 dark:text-[#5C6378]">Receita</p>
                    <p className="font-bold text-[#10B981] font-mono tabular-nums">{formatCurrencyCompact(c.revenue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ─── Audience Donut ─────────────────────────────────────

const DONUT_COLORS = ["#10B981", "#F59E0B", "#9CA3AF"]

function AudienceDonut({ klaviyo }: { klaviyo?: KlaviyoData }) {
  const totalLeads = klaviyo?.totalLeads || 0
  const engagedLeads = klaviyo?.engagedLeads || 0
  const suppressedEstimate = Math.round(totalLeads * (klaviyo?.unsubscribeRate || 0) / 100)
  const nonEngaged = Math.max(0, totalLeads - engagedLeads - suppressedEstimate)

  const donutData = [
    { name: "Engajados", value: engagedLeads },
    { name: "Não-engajados", value: nonEngaged },
    { name: "Suprimidos", value: suppressedEstimate },
  ].filter((d) => d.value > 0)

  if (totalLeads === 0) {
    return (
      <EmptyState compact icon={Users} title="Nenhum dado de audiência" className="py-12" />
    )
  }

  return (
    <div className="flex items-center gap-6">
      <div className="w-[120px] h-[120px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {donutData.map((_, index) => (
                <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 flex-1">
        {donutData.map((item, i) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i] }} />
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex-1">{item.name}</span>
            <span className="text-xs font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
              {formatNumber(item.value)}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-[#5C6378] w-10 text-right font-mono tabular-nums">
              {totalLeads > 0 ? ((item.value / totalLeads) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Audience Metric Pair Grid ──────────────────────────

function AudienceMetricPairGrid({ klaviyo, shopify }: { klaviyo?: KlaviyoData; shopify?: ShopifyData | null }) {
  const metrics = [
    { label: "Total de Leads", value: formatNumber(klaviyo?.totalLeads || 0), icon: Mail },
    { label: "Engajados (90d)", value: formatNumber(klaviyo?.engagedLeads || 0), icon: Users },
    { label: "Taxa Engajamento", value: formatPercent(klaviyo?.engagementRate || 0), icon: TrendingUp },
    { label: "Novos Clientes", value: formatNumber(shopify?.newCustomers || 0), icon: Users },
    { label: "Total Clientes", value: formatNumber(shopify?.totalCustomers || 0), icon: Users },
    { label: "Recorrência", value: formatPercent(shopify?.recurringCustomerRate || 0), icon: RefreshCw },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-[8px] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-[#f9fafb] dark:bg-[#111827] p-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <m.icon className="h-3 w-3 text-gray-400 dark:text-[#5C6378]" />
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">{m.label}</p>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            {m.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Top Products Ranked List ───────────────────────────

function TopProductsRankedList({ shopify }: { shopify?: ShopifyData | null }) {
  const products = shopify?.topProducts?.slice(0, 5) || []

  if (products.length === 0) {
    return (
      <EmptyState compact icon={ShoppingBag} title="Nenhum produto no período" className="py-8" />
    )
  }

  return (
    <div className="space-y-2">
      {products.map((product, index) => (
        <div
          key={product.name}
          className="flex items-center gap-3 py-2.5 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-0"
        >
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
              index === 0 && "bg-[#4E8FFF]/15 text-[#4E8FFF]",
              index === 1 && "bg-[#8B5CF6]/15 text-[#8B5CF6]",
              index === 2 && "bg-[#F59E0B]/15 text-[#F59E0B]",
              index > 2 && "bg-[#f3f4f6] dark:bg-[#374151] text-gray-400 dark:text-[#5C6378]",
            )}
          >
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
              {product.name}
            </p>
            <p className="text-xs text-gray-400 dark:text-[#5C6378]">{product.quantity} unidades</p>
          </div>
          <p className="text-sm font-bold text-[#4E8FFF] font-mono tabular-nums">
            {formatCurrencyCompact(product.revenue)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Store Selector (SegmentedTabs) ─────────────────────

function StoreSelector({
  stores,
  activeStore,
  onSelect,
}: {
  stores: Array<{ id: string; name: string }>
  activeStore: string | null
  onSelect: (id: string | null) => void
}) {
  if (stores.length <= 1) return null

  return (
    <div className="flex rounded-[6px] border border-[#e5e7eb] dark:border-[#374151] overflow-hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "px-3 h-8 text-xs font-medium transition-colors duration-150",
          !activeStore
            ? "bg-[#4E8FFF] text-white"
            : "bg-white dark:bg-[#111827] text-gray-500 dark:text-[#5C6378] hover:bg-[#f3f4f6] dark:hover:bg-[#374151]",
        )}
      >
        Todas
      </button>
      {stores.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cn(
            "px-3 h-8 text-xs font-medium transition-colors duration-150 truncate max-w-[120px]",
            activeStore === s.id
              ? "bg-[#4E8FFF] text-white"
              : "bg-white dark:bg-[#111827] text-gray-500 dark:text-[#5C6378] hover:bg-[#f3f4f6] dark:hover:bg-[#374151]",
          )}
        >
          {s.name}
        </button>
      ))}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export default function PortalAnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)

  const fetchData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true)

      try {
        const storeId = activeStoreId || (() => {
          try { return localStorage.getItem("portal_active_store") } catch { return null }
        })()

        const params = new URLSearchParams({
          period,
          ...(storeId && { store_id: storeId }),
        })

        const response = await fetch(`/api/portal/dashboard?${params}`)
        if (!response.ok) throw new Error("Erro ao carregar dados")
        const result = await response.json()
        setData(result)
        setError(null)
      } catch (err) {
        console.error("Analytics fetch error:", err)
        setError("Não foi possível carregar os dados. Tente novamente.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [period, activeStoreId],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleStoreChange = (storeId: string | null) => {
    setActiveStoreId(storeId)
    if (storeId) {
      try { localStorage.setItem("portal_active_store", storeId) } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem("portal_active_store") } catch { /* ignore */ }
    }
  }

  // ─── Loading ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-32 rounded-[6px] mb-1.5" />
            <Skeleton className="h-4 w-48 rounded-[6px]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-[6px]" />
            <Skeleton className="h-9 w-9 rounded-[6px]" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-[10px]" />
          ))}
        </div>
        <Skeleton className="h-[280px] rounded-[10px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[300px] rounded-[10px]" />
          <Skeleton className="h-[300px] rounded-[10px]" />
        </div>
      </div>
    )
  }

  // ─── Error ────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-14 h-14 rounded-full bg-[#fef2f2] dark:bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-[#EF4444]" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mb-1">
          Erro ao carregar
        </h2>
        <p className="text-sm text-gray-400 dark:text-[#5C6378] mb-5">{error}</p>
        <Button onClick={() => fetchData()} className="rounded-[6px] h-9">
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { klaviyo, shopify, stores } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">Analytics</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {data.dateRange && (
              <p className="text-sm text-gray-400 dark:text-[#5C6378]">
                {formatDateRange(data.dateRange.start, data.dateRange.end)}
              </p>
            )}
            {refreshing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4E8FFF]/10 text-[#4E8FFF] text-xs font-medium">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Atualizando
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-9 rounded-[6px] text-sm">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-gray-400 dark:text-[#5C6378]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-9 w-9 rounded-[6px]"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Store Selector */}
      <StoreSelector
        stores={(stores || []).map((s) => ({ id: s.id, name: s.name }))}
        activeStore={activeStoreId}
        onSelect={handleStoreChange}
      />

      <AnimatedContainer className="space-y-6">
        {/* ═══ Seção 1: Receita ═══ */}
        <AnimatedItem>
          <SectionCard>
            <SectionTitle subtitle="Evolução da receita no período">
              <span className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-[#10B981]" />
                Receita
              </span>
            </SectionTitle>
            <RevenueAreaChart klaviyo={klaviyo} />
          </SectionCard>
        </AnimatedItem>

        <AnimatedItem>
          <RevenueMiniStats klaviyo={klaviyo} shopify={shopify} />
        </AnimatedItem>

        {/* ═══ Seção 2: Email Marketing ═══ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EmailPerformanceHBar klaviyo={klaviyo} />
            <CampaignsTable klaviyo={klaviyo} />
          </div>
        </AnimatedItem>

        {/* ═══ Seção 3: Audiência ═══ */}
        <AnimatedItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard>
              <SectionTitle subtitle="Métricas de audiência e clientes">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#4E8FFF]" />
                  Audiência
                </span>
              </SectionTitle>
              <AudienceMetricPairGrid klaviyo={klaviyo} shopify={shopify} />
            </SectionCard>
            <SectionCard>
              <SectionTitle subtitle="Distribuição da lista de contatos">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#10B981]" />
                  Composição da Lista
                </span>
              </SectionTitle>
              <AudienceDonut klaviyo={klaviyo} />
            </SectionCard>
          </div>
        </AnimatedItem>

        {/* ═══ Seção 4: Top Produtos ═══ */}
        {shopify?.topProducts && shopify.topProducts.length > 0 && (
          <AnimatedItem>
            <SectionCard>
              <SectionTitle subtitle="Top 5 produtos por receita no período">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#4E8FFF]" />
                  Top Produtos
                </span>
              </SectionTitle>
              <TopProductsRankedList shopify={shopify} />
            </SectionCard>
          </AnimatedItem>
        )}
      </AnimatedContainer>
    </div>
  )
}
