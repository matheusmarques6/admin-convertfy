"use client"

import { useState, useEffect, useCallback, use, useMemo } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Store,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  Mail,
  ShoppingCart,
  MousePointerClick,
  Eye,
  BarChart3,
  Percent,
  Link2,
  Globe,
  Monitor,
  Megaphone,
  Copy,
  Check,
  Clock,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency as formatCurrencyUtil } from "@/lib/utils/format"

interface StoreReport {
  store: {
    id: string
    store_name: string
    store_url: string
    platform: string
    is_active: boolean
    currency?: string
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
      utmConversions?: {
        totalOrdersWithUtm: number
        utmTrackingRate: number
        bySource: Array<{ source: string; orders: number; revenue: number }>
        byMedium: Array<{ medium: string; orders: number; revenue: number }>
        byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
      }
    }
    products?: {
      totalProducts: number
    }
    // Flattened fields (used by existing template - may come from different mapping)
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
}

interface UtmTemplate {
  id: string
  name: string
  description: string | null
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string | null
  utm_term: string | null
  usage_count: number
  created_at: string
}

// formatCurrency is imported from @/lib/utils/format as formatCurrencyUtil
// A local wrapper is used so the store currency is applied throughout the page

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

/** Reusable ranked list for UTM data in the store report */
function StoreUtmRankingList({
  items,
  labelKey,
  icon: Icon,
  currency = "BRL",
}: {
  items: Array<Record<string, string | number>>
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  currency?: string
}) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 dark:text-slate-400">
        <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhum dado disponivel</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 10).map((item, index) => (
        <div
          key={String(item[labelKey])}
          className="flex items-center gap-4 p-3 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            index === 0 ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
          }`}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {String(item[labelKey])}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{item.orders} pedidos</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-cyan-600 dark:text-cyan-400">{formatCurrencyUtil(item.revenue as number, currency)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/** UTM Attribution section for the store report page */
function UtmAttributionSection({
  utmConversions,
  currency = "BRL",
}: {
  currency?: string
  utmConversions?: {
    totalOrdersWithUtm: number
    utmTrackingRate: number
    bySource: Array<{ source: string; orders: number; revenue: number }>
    byMedium: Array<{ medium: string; orders: number; revenue: number }>
    byCampaign: Array<{ campaign: string; orders: number; revenue: number }>
  }
}) {
  if (!utmConversions) return null

  const hasAnyData =
    (utmConversions.bySource?.length > 0) ||
    (utmConversions.byMedium?.length > 0) ||
    (utmConversions.byCampaign?.length > 0)

  if (!hasAnyData && utmConversions.totalOrdersWithUtm === 0) return null

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-[#05AFF2]" />
          Atribuição UTM
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Rastreamento de origem dos pedidos</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatNumber(utmConversions.totalOrdersWithUtm)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos com UTM</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1A1F2E]">
          <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{formatPercent(utmConversions.utmTrackingRate)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Taxa de rastreio</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="source">
        <TabsList className="grid w-full grid-cols-3 h-9 mb-4">
          <TabsTrigger value="source" className="text-xs">Source</TabsTrigger>
          <TabsTrigger value="medium" className="text-xs">Medium</TabsTrigger>
          <TabsTrigger value="campaign" className="text-xs">Campaign</TabsTrigger>
        </TabsList>

        <TabsContent value="source" className="mt-0">
          <StoreUtmRankingList
            items={(utmConversions.bySource || []) as Array<Record<string, string | number>>}
            labelKey="source"
            icon={Globe}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="medium" className="mt-0">
          <StoreUtmRankingList
            items={(utmConversions.byMedium || []) as Array<Record<string, string | number>>}
            labelKey="medium"
            icon={Monitor}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="campaign" className="mt-0">
          <StoreUtmRankingList
            items={(utmConversions.byCampaign || []) as Array<Record<string, string | number>>}
            labelKey="campaign"
            icon={Megaphone}
            currency={currency}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Format relative time for freshness indicator */
function formatFreshness(isoDate: string): { text: string; isStale: boolean } {
  const now = Date.now()
  const fetched = new Date(isoDate).getTime()
  const diffMs = now - fetched
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return { text: "Atualizado agora", isStale: false }
  if (diffMinutes < 60) return { text: `Atualizado ha ${diffMinutes} min`, isStale: diffMinutes > 30 }
  const diffHours = Math.floor(diffMinutes / 60)
  return { text: `Atualizado ha ${diffHours}h`, isStale: true }
}

/** Build a preview URL from UTM params using URL constructor for proper encoding */
function buildUtmUrl(template: UtmTemplate, baseUrl?: string): string {
  try {
    const url = new URL(baseUrl || "https://loja.com")
    if (template.utm_source) url.searchParams.set("utm_source", template.utm_source)
    if (template.utm_medium) url.searchParams.set("utm_medium", template.utm_medium)
    if (template.utm_campaign) url.searchParams.set("utm_campaign", template.utm_campaign)
    if (template.utm_content) url.searchParams.set("utm_content", template.utm_content)
    if (template.utm_term) url.searchParams.set("utm_term", template.utm_term)
    return url.toString()
  } catch {
    return baseUrl || ""
  }
}

/** UTM Templates section for the portal store page */
function UtmTemplatesSection({
  templates,
  fetchedAt,
  storeUrl,
}: {
  templates: UtmTemplate[]
  fetchedAt: string | null
  storeUrl?: string
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const freshness = useMemo(
    () => (fetchedAt ? formatFreshness(fetchedAt) : null),
    [fetchedAt]
  )

  const handleCopy = async (template: UtmTemplate) => {
    const url = buildUtmUrl(template, storeUrl)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(template.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback: no-op
    }
  }

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Tag className="h-5 w-5 text-[#05AFF2]" />
            UTMs de Campanha
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Templates configurados pela agencia
          </p>
        </div>
        {freshness && (
          <span
            className={`text-xs flex items-center gap-1 ${
              freshness.isStale
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            <Clock className="h-3 w-3" />
            {freshness.text}
          </span>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum template UTM configurado para esta loja</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="p-4 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-800 dark:text-slate-100 truncate">
                    {template.name}
                  </h4>
                  {template.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {template.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 ml-2"
                  onClick={() => handleCopy(template)}
                >
                  {copiedId === template.id ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {template.utm_source}
                </span>
                <span className="text-slate-400">/</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {template.utm_medium}
                </span>
                <span className="text-slate-400">/</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {template.utm_campaign}
                </span>
              </div>

              {template.usage_count > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Usado {template.usage_count}x
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PortalStoreReportPage({
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
  const [utmTemplates, setUtmTemplates] = useState<UtmTemplate[]>([])
  const [utmFetchedAt, setUtmFetchedAt] = useState<string | null>(null)

  const fetchUtmTemplates = useCallback(async () => {
    try {
      const response = await fetch(`/api/portal/stores/${id}/utm-templates`)
      if (response.ok) {
        const data = await response.json()
        setUtmTemplates(data.templates || [])
        setUtmFetchedAt(data.fetchedAt || new Date().toISOString())
      }
    } catch {
      // UTM templates are non-critical; silently ignore errors
    }
  }, [id])

  const fetchReport = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const refreshParam = showRefresh ? "&force_refresh=true" : ""
      const response = await fetch(`/api/portal/stores/${id}/report?period=${period}${refreshParam}`)
      if (!response.ok) {
        throw new Error("Erro ao carregar relatório")
      }
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
  }, [id, period])

  useEffect(() => {
    fetchReport()
    fetchUtmTemplates()
  }, [fetchReport, fetchUtmTemplates])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-4">{error}</p>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/client/stores">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <Button onClick={() => fetchReport()} className="bg-primary hover:bg-primary/85 text-white shadow-sm">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  if (!report) return null

  const { store, klaviyo, shopify } = report
  const storeCurrency = store.currency || "BRL"
  const formatCurrency = (value: number) => formatCurrencyUtil(value, storeCurrency)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/client/stores">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{store.store_name}</h1>
            <p className="text-slate-500 dark:text-slate-400 capitalize">{store.platform}</p>
          </div>
          <Badge variant={store.is_active ? "default" : "secondary"}>
            {store.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
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
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="email">Email Marketing</TabsTrigger>
          <TabsTrigger value="ecommerce">E-commerce</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Leads</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(klaviyo?.totalLeads || 0)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Contatos na base</p>
            </div>

            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Leads Engajados</span>
                <TrendingUp className="h-4 w-4 text-[#05AFF2]" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(klaviyo?.engagedLeads || 0)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {formatPercent(klaviyo?.engagementRate || 0)} de engajamento
              </p>
            </div>

            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Receita Email</span>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCurrency(klaviyo?.totalRevenue || 0)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Atribuída via Klaviyo</p>
            </div>

            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Pedidos</span>
                <ShoppingCart className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold">
                {formatNumber(shopify?.totalOrders || 0)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No período selecionado</p>
            </div>
          </div>

          {/* Email Performance Summary */}
          {klaviyo && (
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Performance de Email</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Métricas de engajamento no período</p>
              </div>
              <div>
                <div className="grid gap-6 md:grid-cols-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Taxa de Abertura</span>
                      <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.openRate)}</div>
                    <Progress value={klaviyo.openRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Taxa de Clique</span>
                      <MousePointerClick className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.clickRate)}</div>
                    <Progress value={klaviyo.clickRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Taxa de Conversão</span>
                      <Percent className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold">{formatPercent(klaviyo.conversionRate)}</div>
                    <Progress value={klaviyo.conversionRate} className="mt-2 h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Emails Enviados</span>
                      <Mail className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold">{formatNumber(klaviyo.emailsSent)}</div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">No período</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Revenue Breakdown */}
          {klaviyo && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Receita por Canal</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Distribuição de receita atribuída</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Campanhas</span>
                      <span className="text-sm font-bold">{formatCurrency(klaviyo.campaignRevenue)}</span>
                    </div>
                    <Progress
                      value={(klaviyo.campaignRevenue / (klaviyo.totalRevenue || 1)) * 100}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Automações (Flows)</span>
                      <span className="text-sm font-bold">{formatCurrency(klaviyo.flowRevenue)}</span>
                    </div>
                    <Progress
                      value={(klaviyo.flowRevenue / (klaviyo.totalRevenue || 1)) * 100}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>

              {shopify && (
                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Métricas E-commerce</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Dados da loja</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Receita Total</span>
                      <span className="font-bold">{formatCurrency(shopify.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Ticket Médio</span>
                      <span className="font-bold">{formatCurrency(shopify.averageOrderValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Clientes Recorrentes</span>
                      <span className="font-bold">{formatPercent(shopify.recurringCustomerRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Novos Clientes</span>
                      <span className="font-bold">{formatNumber(shopify.newCustomers)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Email Marketing Tab */}
        <TabsContent value="email" className="space-y-6">
          {klaviyo ? (
            <>
              {/* Recent Campaigns */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Campanhas Recentes</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Últimos emails enviados</p>
                </div>
                  {klaviyo.recentCampaigns.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma campanha no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.recentCampaigns.map((campaign) => (
                        <div
                          key={campaign.id}
                          className="p-4 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-medium">{campaign.name}</h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                Enviada em {formatDate(campaign.sentAt)}
                              </p>
                            </div>
                            <Badge variant="neutral" showDot={false} className="bg-emerald-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-400">
                              {formatCurrency(campaign.revenue)}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Enviados</p>
                              <p className="font-medium">{formatNumber(campaign.recipients)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Entregues</p>
                              <p className="font-medium">{formatNumber(campaign.delivered)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Aberturas</p>
                              <p className="font-medium">{formatPercent(campaign.openRate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Cliques</p>
                              <p className="font-medium">{formatPercent(campaign.clickRate)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Receita</p>
                              <p className="font-medium text-emerald-600">{formatCurrency(campaign.revenue)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Top Flows */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Top Automações</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Flows com melhor performance</p>
                </div>
                  {klaviyo.topFlows.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum flow ativo no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {klaviyo.topFlows.map((flow, index) => (
                        <div
                          key={flow.id}
                          className="flex items-center gap-4 p-4 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{flow.name}</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {formatNumber(flow.recipients)} destinatários
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-600">{formatCurrency(flow.revenue)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatPercent(flow.openRate)} abertura
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Lists */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Listas de Email</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Segmentação da base</p>
                </div>
                  {klaviyo.lists.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma lista encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {klaviyo.lists.map((list) => (
                        <div
                          key={list.name}
                          className="flex items-center justify-between p-3 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
                        >
                          <span className="font-medium">{list.name}</span>
                          <Badge variant="neutral" showDot={false}>{formatNumber(list.count)} contatos</Badge>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40">
              <div className="flex flex-col items-center justify-center py-12 px-5">
                <Mail className="h-12 w-12 text-slate-500 dark:text-slate-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Klaviyo não conectado</h3>
                <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
                  Os dados de email marketing serão exibidos quando a integração com Klaviyo estiver configurada.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* E-commerce Tab */}
        <TabsContent value="ecommerce" className="space-y-6">
          {shopify ? (
            <>
              {/* E-commerce Metrics */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Receita Total</span>
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(shopify.totalRevenue)}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No período</p>
                </div>

                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Pedidos</span>
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(shopify.totalOrders)}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pedidos finalizados</p>
                </div>

                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Ticket Médio</span>
                    <BarChart3 className="h-4 w-4 text-[#05AFF2]" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(shopify.averageOrderValue)}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Valor médio por pedido</p>
                </div>

                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Clientes Recorrentes</span>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold">{formatPercent(shopify.recurringCustomerRate)}</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Taxa de recompra</p>
                </div>
              </div>

              {/* Top Products */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Produtos Mais Vendidos</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Top produtos no período</p>
                </div>
                  {shopify.topProducts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhum produto vendido no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {shopify.topProducts.map((product, index) => (
                        <div
                          key={product.name}
                          className="flex items-center gap-4 p-4 border border-slate-200/80 dark:border-slate-700/40 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{product.name}</h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {formatNumber(product.quantity)} unidades vendidas
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(product.revenue)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* UTM Attribution Section */}
              <UtmAttributionSection utmConversions={shopify.orders?.utmConversions} currency={storeCurrency} />

              {/* UTM Templates Section */}
              <UtmTemplatesSection
                templates={utmTemplates}
                fetchedAt={utmFetchedAt}
                storeUrl={store.store_url || undefined}
              />
            </>
          ) : (
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40">
              <div className="flex flex-col items-center justify-center py-12 px-5">
                <ShoppingCart className="h-12 w-12 text-slate-500 dark:text-slate-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Shopify não conectado</h3>
                <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
                  Os dados de e-commerce serão exibidos quando a integração com Shopify estiver configurada.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      {report.lastSyncedAt && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
          Última sincronização: {formatDate(report.lastSyncedAt)}
        </p>
      )}
    </div>
  )
}
