"use client"

import { useState, useEffect, useCallback, use } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Store,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Users,
  DollarSign,
  ShoppingCart,
  Mail,
  Eye,
  CheckCircle2,
  Circle,
  Clock,
  Key,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { Breadcrumbs } from "@/components/ui/breadcrumbs"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency as formatCurrencyUtil } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────

interface StoreReport {
  store: {
    id: string
    store_name: string
    store_url: string
    platform: string
    is_active: boolean
    currency?: string
    plan?: string
    created_at?: string
  }
  klaviyo?: {
    totalLeads: number
    engagedLeads: number
    engagementRate: number
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    emailsSent: number
    openRate: number
    clickRate: number
    conversionRate: number
    unsubscribeRate: number
    bounceRate: number
    lists: Array<{ name: string; count: number }>
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
      recipients: number
      openRate: number
      clickRate: number
    }>
  }
  shopify?: {
    connected?: boolean
    shop?: Record<string, unknown>
    orders?: {
      totalOrders: number
      totalRevenue: number
      averageOrderValue: number
      recurringCustomerRate: number
    }
    products?: {
      totalProducts: number
    }
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
    recurringCustomerRate: number
    newCustomers: number
    topProducts: Array<{
      name: string
      quantity: number
      revenue: number
    }>
  }
  period: string
  lastSyncedAt?: string
  onboarding?: {
    phases: Array<{
      id: string
      title: string
      status: "completed" | "in_progress" | "pending"
      completedAt?: string
    }>
  }
}

// ─── Helpers ────────────────────────────────────────────

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ─── Brand Icons ────────────────────────────────────────

function ShopifyIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 109 124" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M94.27 23.49C94.17 22.79 93.57 22.42 93.07 22.39C92.57 22.36 82.47 21.87 82.47 21.87C82.47 21.87 73.47 13 72.57 12.1C71.67 11.2 69.87 11.47 69.17 11.67C69.07 11.7 67.37 12.23 64.57 13.1C63.97 11.15 63.07 8.82 61.67 6.49C57.77 0.09 52.27 0 50.67 0C50.37 0 50.17 0.03 49.97 0.03C49.37 -0.07 48.87 0.43 48.47 0.93C48.07 1.43 40.17 11.2 38.27 16.4C36.47 21.3 35.67 21.9 35.27 22.1C32.27 23.2 23.07 26.1 23.07 26.1L23 26.13C19.7 27.13 19.57 27.23 19.17 30.33C18.87 32.63 9 105.15 9 105.15L72.3 117.55L104.1 110.35C104.1 110.35 94.37 24.19 94.27 23.49Z" fill="#95BF47"/>
      <path d="M53.07 41.39L49.37 55.09C49.37 55.09 46.07 53.39 42.07 53.59C36.07 53.89 36.07 57.59 36.07 58.49C36.37 64.49 49.87 65.59 50.57 77.89C51.17 87.49 45.37 94.09 36.97 94.59C26.87 95.19 21.37 89.39 21.37 89.39L23.67 80.59C23.67 80.59 29.17 84.69 33.57 84.39C36.47 84.19 37.57 81.79 37.47 80.09C37.07 72.39 26.07 72.79 25.47 61.59C24.97 52.09 31.07 42.49 45.47 41.59C50.67 41.29 53.07 41.39 53.07 41.39Z" fill="white"/>
    </svg>
  )
}

function KlaviyoIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center bg-black rounded-[6px]" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 12C22 12 17.5 16 12 16C6.5 16 2 12 2 12C2 12 6.5 8 12 8C17.5 8 22 12 22 12Z" fill="#BEF264"/>
        <circle cx="12" cy="12" r="3" fill="#000"/>
      </svg>
    </div>
  )
}

function PlatformIcon({ platform, size = 40 }: { platform: string; size?: number }) {
  if (platform === "shopify") {
    return (
      <div className="flex items-center justify-center rounded-[8px] bg-[#95BF47]/10" style={{ width: size, height: size }}>
        <ShopifyIcon size={size * 0.55} />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center rounded-[8px] bg-slate-100 dark:bg-slate-800" style={{ width: size, height: size }}>
      <Store className="text-slate-500 dark:text-slate-400" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

// ─── KPI Card ───────────────────────────────────────────

function MiniKpi({
  label,
  value,
  icon: Icon,
  iconColor = "text-gray-400",
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
}) {
  return (
    <div className="p-4 rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-gray-400 dark:text-[#5C6378]">{label}</span>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
        {value}
      </p>
    </div>
  )
}

// ─── Integration Card (Portal DS pattern) ───────────────

function IntegrationCard({
  name,
  icon,
  connected,
  details,
}: {
  name: string
  icon: React.ReactNode
  connected: boolean
  details: Array<{ label: string; value: string }>
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">{name}</h4>
        </div>
        <StatusBadge status={connected ? "connected" : "disconnected"} />
      </div>
      {connected && details.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-400 dark:text-[#5C6378]">{d.label}</span>
              <span className="font-medium text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      )}
      {!connected && (
        <p className="text-sm text-gray-400 dark:text-[#5C6378] pt-3 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
          Integração ainda não configurada. Entre em contato com a equipe Convertfy.
        </p>
      )}
    </div>
  )
}

// ─── Onboarding Stepper (read-only) ─────────────────────

const DEFAULT_ONBOARDING_PHASES = [
  { id: "setup", title: "Configuração Inicial", status: "pending" as const },
  { id: "integration", title: "Integração de Plataformas", status: "pending" as const },
  { id: "design", title: "Design de Templates", status: "pending" as const },
  { id: "flows", title: "Configuração de Flows", status: "pending" as const },
  { id: "review", title: "Revisão e Aprovação", status: "pending" as const },
  { id: "launch", title: "Lançamento", status: "pending" as const },
]

function OnboardingStepper({
  phases,
}: {
  phases: Array<{
    id: string
    title: string
    status: "completed" | "in_progress" | "pending"
    completedAt?: string
  }>
}) {
  return (
    <div className="space-y-0">
      {phases.map((phase, index) => {
        const isLast = index === phases.length - 1
        return (
          <div key={phase.id} className="flex gap-3">
            {/* Line + Icon */}
            <div className="flex flex-col items-center">
              {phase.status === "completed" ? (
                <div className="w-8 h-8 rounded-full bg-[#10B981]/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                </div>
              ) : phase.status === "in_progress" ? (
                <div className="w-8 h-8 rounded-full bg-[#4E8FFF]/10 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-[#4E8FFF]" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#f3f4f6] dark:bg-[#374151] flex items-center justify-center shrink-0">
                  <Circle className="h-4 w-4 text-[#9CA3AF]" />
                </div>
              )}
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-[24px]",
                    phase.status === "completed"
                      ? "bg-[#10B981]/30"
                      : "bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.08)]",
                  )}
                />
              )}
            </div>
            {/* Content */}
            <div className={cn("pb-6", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium leading-8",
                  phase.status === "completed" && "text-[#10B981]",
                  phase.status === "in_progress" && "text-gray-900 dark:text-[#EAEDF3]",
                  phase.status === "pending" && "text-gray-400 dark:text-[#5C6378]",
                )}
              >
                {phase.title}
              </p>
              {phase.completedAt && (
                <p className="text-xs text-gray-400 dark:text-[#5C6378]">
                  Concluído em {formatDate(phase.completedAt)}
                </p>
              )}
              {phase.status === "in_progress" && (
                <p className="text-xs text-[#4E8FFF]">Em andamento</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────

export default function PortalStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [report, setReport] = useState<StoreReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState("30d")
  const [activeTab, setActiveTab] = useState("overview")

  const fetchReport = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true)
      try {
        const refreshParam = showRefresh ? "&force_refresh=true" : ""
        const response = await fetch(
          `/api/portal/stores/${id}/report?period=${period}${refreshParam}`,
        )
        if (!response.ok) throw new Error("Erro ao carregar relatório")
        const data = await response.json()
        setReport(data)
        setError(null)
      } catch (err) {
        console.error("Report fetch error:", err)
        setError("Não foi possível carregar o relatório")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [id, period],
  )

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // ─── Loading ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-48 rounded-[6px]" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-[8px]" />
          <div>
            <Skeleton className="h-6 w-40 mb-1 rounded-[6px]" />
            <Skeleton className="h-4 w-28 rounded-[6px]" />
          </div>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-[10px]" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-[6px]" />
        <Skeleton className="h-64 rounded-[10px]" />
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
        <div className="flex gap-2">
          <Button variant="secondary" asChild className="rounded-[6px] h-9">
            <Link href="/client/stores">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Voltar
            </Link>
          </Button>
          <Button onClick={() => fetchReport()} className="rounded-[6px] h-9">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!report) return null

  const { store, klaviyo, shopify } = report
  const storeCurrency = store.currency || "BRL"
  const formatCurrency = (value: number) => formatCurrencyUtil(value, storeCurrency)

  const onboardingPhases = report.onboarding?.phases || DEFAULT_ONBOARDING_PHASES

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Minhas Lojas", href: "/client/stores" },
          { label: store.store_name },
        ]}
      />

      {/* Store Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PlatformIcon platform={store.platform} size={44} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
                {store.store_name}
              </h1>
              <StatusBadge status={store.is_active ? "active" : "inactive"} />
            </div>
            {store.store_url && (
              <a
                href={store.store_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-[#5C6378] hover:text-[#4E8FFF] transition-colors"
              >
                {store.store_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9 rounded-[6px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            className="rounded-[6px] h-9 text-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MiniKpi
          label="Receita 30d"
          value={formatCurrency(klaviyo?.totalRevenue || shopify?.totalRevenue || 0)}
          icon={DollarSign}
          iconColor="text-[#10B981]"
        />
        <MiniKpi
          label="Pedidos 30d"
          value={formatNumber(shopify?.totalOrders || 0)}
          icon={ShoppingCart}
          iconColor="text-[#F59E0B]"
        />
        <MiniKpi
          label="Subscribers"
          value={formatNumber(klaviyo?.totalLeads || 0)}
          icon={Users}
          iconColor="text-[#4E8FFF]"
        />
        <MiniKpi
          label="Open Rate"
          value={formatPercent(klaviyo?.openRate || 0)}
          icon={Eye}
          iconColor="text-[#8B5CF6]"
        />
      </div>

      {/* UnderlineTabs */}
      <UnderlineTabs value={activeTab} onValueChange={setActiveTab}>
        <UnderlineTabItem value="overview">Overview</UnderlineTabItem>
        <UnderlineTabItem value="integrations">Integrações</UnderlineTabItem>
        <UnderlineTabItem value="onboarding">Onboarding</UnderlineTabItem>
      </UnderlineTabs>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Store Info - key:value pairs */}
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] mb-4">
              Informações da Loja
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 dark:text-[#5C6378]">Plataforma</span>
                <span className="font-medium text-gray-900 dark:text-[#EAEDF3] capitalize">{store.platform}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 dark:text-[#5C6378]">URL</span>
                {store.store_url ? (
                  <a
                    href={store.store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#4E8FFF] hover:underline inline-flex items-center gap-1"
                  >
                    {store.store_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-gray-400 dark:text-[#5C6378]">—</span>
                )}
              </div>
              {store.plan && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Plano</span>
                  <span className="font-medium text-gray-900 dark:text-[#EAEDF3]">{store.plan}</span>
                </div>
              )}
              {store.created_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Data de criação</span>
                  <span className="font-medium text-gray-900 dark:text-[#EAEDF3]">{formatDate(store.created_at)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 dark:text-[#5C6378]">Status</span>
                <StatusBadge status={store.is_active ? "active" : "inactive"} />
              </div>
            </div>
          </div>

          {/* E-commerce Metrics */}
          {shopify && (
            <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] mb-4">
                Métricas E-commerce
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Receita Total</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatCurrency(shopify.totalRevenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Ticket Médio</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatCurrency(shopify.averageOrderValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Clientes Recorrentes</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatPercent(shopify.recurringCustomerRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Novos Clientes</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatNumber(shopify.newCustomers)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Email Performance */}
          {klaviyo && (
            <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] mb-4">
                Performance de Email
              </h3>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Taxa de Abertura</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatPercent(klaviyo.openRate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Taxa de Clique</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatPercent(klaviyo.clickRate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Conversão</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatPercent(klaviyo.conversionRate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Emails Enviados</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatNumber(klaviyo.emailsSent)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Breakdown */}
          {klaviyo && (
            <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] mb-4">
                Receita por Canal
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Campanhas</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatCurrency(klaviyo.campaignRevenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 dark:text-[#5C6378]">Automações (Flows)</span>
                  <span className="font-semibold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                    {formatCurrency(klaviyo.flowRevenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                  <span className="font-medium text-gray-900 dark:text-[#EAEDF3]">Total Atribuído</span>
                  <span className="font-bold text-[#10B981] font-mono tabular-nums">
                    {formatCurrency(klaviyo.totalRevenue)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "integrations" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Shopify Integration Card */}
          <IntegrationCard
            name="Shopify"
            icon={<PlatformIcon platform="shopify" size={36} />}
            connected={!!shopify?.connected || !!shopify}
            details={
              shopify
                ? [
                    { label: "Pedidos", value: formatNumber(shopify.totalOrders) },
                    { label: "Receita", value: formatCurrency(shopify.totalRevenue) },
                    { label: "Ticket Médio", value: formatCurrency(shopify.averageOrderValue) },
                    { label: "Produtos", value: shopify.products ? formatNumber(shopify.products.totalProducts) : "—" },
                  ]
                : []
            }
          />

          {/* Klaviyo Integration Card */}
          <IntegrationCard
            name="Klaviyo"
            icon={<KlaviyoIcon size={36} />}
            connected={!!klaviyo}
            details={
              klaviyo
                ? [
                    { label: "Subscribers", value: formatNumber(klaviyo.totalLeads) },
                    { label: "Engajados", value: `${formatNumber(klaviyo.engagedLeads)} (${formatPercent(klaviyo.engagementRate)})` },
                    { label: "Open Rate", value: formatPercent(klaviyo.openRate) },
                    { label: "Click Rate", value: formatPercent(klaviyo.clickRate) },
                    { label: "Receita Atribuída", value: formatCurrency(klaviyo.totalRevenue) },
                  ]
                : []
            }
          />
        </div>
      )}

      {activeTab === "onboarding" && (
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-5">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              Progresso do Onboarding
            </h3>
            <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-0.5">
              Acompanhe o progresso da configuração da sua loja
            </p>
          </div>
          <OnboardingStepper phases={onboardingPhases} />
        </div>
      )}

      {/* Last Synced */}
      {report.lastSyncedAt && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378] text-center">
          Última sincronização: {formatDate(report.lastSyncedAt)}
        </p>
      )}
    </div>
  )
}
