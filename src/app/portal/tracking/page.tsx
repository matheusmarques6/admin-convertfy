"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Package,
  Truck,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Search,
  Copy,
  Check,
  Code2,
  Eye,
  BarChart3,
  Settings2,
  Palette,
  Save,
  Loader2,
  ExternalLink,
  Globe,
  ShieldCheck,
  Box,
  MapPin,
  ClipboardCheck,
  Plane,
  Home,
  Calendar,
  Mail,
  Hash,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import { TRACKING_STATUS_LABELS } from "@/types/tracking"
import type { TrackingStatus } from "@/types/tracking"
import {
  getTrackingTranslations,
  getTimelineStepLabel,
  SUPPORTED_LANGUAGES,
} from "@/lib/translations/tracking"

// =================== Types ===================

interface TrackingCode {
  id: string
  tracking_number: string
  carrier_name: string | null
  status: TrackingStatus
  status_detail: string | null
  last_event: string | null
  last_event_at: string | null
  tracking_events: unknown[]
}

interface RecentOrder {
  id: string
  order_name: string | null
  customer_name: string | null
  customer_email: string | null
  total_price: number | null
  currency: string
  financial_status: string | null
  fulfillment_status: string | null
  shipped_at: string | null
  delivered_at: string | null
  order_created_at: string | null
  tracking_codes: TrackingCode[]
}

interface DashboardData {
  stats: {
    totalOrders: number
    inTransit: number
    delivered: number
    pending: number
    deliveryRate: number
  }
  recentOrders: RecentOrder[]
}

interface PluginConfig {
  plugin_type: "basic" | "complete"
  primary_color: string
  accent_color: string
  icon_color: string
  hide_carrier: boolean
  hide_redirect: boolean
  blocked_words: string
  not_found_message: string
  custom_css: string
  show_estimated_delivery: boolean
  show_carrier_logo: boolean
  language: string
}

interface TrackingStoreInfo {
  id: string
  shop_domain: string
  shop_name: string | null
  is_active: boolean
}

// =================== Constants ===================

const statusBadgeColors: Record<string, string> = {
  pending: "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300",
  info_received: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_transit: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_for_delivery: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  delivered: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed_attempt: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  exception: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  expired: "bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400",
}

const DEFAULT_CONFIG: PluginConfig = {
  plugin_type: "complete",
  primary_color: "#6366F1",
  accent_color: "#8B5CF6",
  icon_color: "#6366F1",
  hide_carrier: false,
  hide_redirect: false,
  blocked_words: "",
  not_found_message: "Pedido não encontrado. Verifique o número informado e tente novamente.",
  custom_css: "",
  show_estimated_delivery: true,
  show_carrier_logo: true,
  language: "pt-BR",
}

const TIMELINE_STEP_KEYS_COMPLETE = [
  { key: "order_placed", icon: ClipboardCheck },
  { key: "confirmed", icon: CheckCircle2 },
  { key: "preparing", icon: Box },
  { key: "shipped", icon: Package },
  { key: "in_transit", icon: Truck },
  { key: "customs", icon: ShieldCheck },
  { key: "local_transit", icon: MapPin },
  { key: "out_for_delivery", icon: Plane },
  { key: "delivered", icon: Home },
]

const TIMELINE_STEP_KEYS_BASIC = [
  { key: "order_placed", icon: ClipboardCheck },
  { key: "shipped", icon: Package },
  { key: "in_transit", icon: Truck },
  { key: "out_for_delivery", icon: Plane },
  { key: "delivered", icon: Home },
]

// =================== Helpers ===================

function formatDate(d: string | null) {
  if (!d) return "-"
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function formatCurrency(value: number | null, currency = "BRL") {
  if (!value) return "R$ 0,00"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value)
}

type TabKey = "dashboard" | "plugin" | "embed"

// =================== Component ===================

export default function PortalTrackingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard")
  const [copiedScript, setCopiedScript] = useState<string | null>(null)

  // Plugin config state
  const [config, setConfig] = useState<PluginConfig>(DEFAULT_CONFIG)
  const [_trackingStores, setTrackingStores] = useState<TrackingStoreInfo[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // Translation for preview/script only
  const pt = getTrackingTranslations(config.language)

  // =================== Data Fetching ===================

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const response = await fetch("/api/portal/tracking")
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Tracking fetch error:", err)
      setError("Não foi possível carregar os dados.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/tracking/config")
      if (!response.ok) return
      const result = await response.json()
      if (result.config) {
        setConfig({ ...DEFAULT_CONFIG, ...result.config })
      }
      if (result.stores) setTrackingStores(result.stores)
      if (result.selected_store_id) setSelectedStoreId(result.selected_store_id)
    } catch {
      // silently fail - use defaults
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchConfig()
  }, [fetchData, fetchConfig])

  // =================== Handlers ===================

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedScript(key)
    setTimeout(() => setCopiedScript(null), 2000)
  }

  const savePluginConfig = async () => {
    if (!selectedStoreId) return
    setSavingConfig(true)
    setConfigSaved(false)
    try {
      const response = await fetch("/api/portal/tracking/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStoreId, config }),
      })
      if (!response.ok) throw new Error("Erro ao salvar")
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 3000)
    } catch {
      // ignore
    } finally {
      setSavingConfig(false)
    }
  }

  // =================== Embed Codes ===================

  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const storeParam = selectedStoreId || "YOUR_STORE_ID"

  const widgetScript = `<!-- Convertfy Tracking Widget -->
<script src="${baseUrl}/api/script/widget.js?store=${storeParam}" async></script>
<div id="convertfy-tracking"></div>`

  const iframeEmbed = `<iframe
  src="${baseUrl}/tracking/embed?store=${storeParam}&primary=${encodeURIComponent(config.primary_color)}&accent=${encodeURIComponent(config.accent_color)}&icon=${encodeURIComponent(config.icon_color)}&type=${config.plugin_type}&lang=${config.language}"
  width="100%"
  height="600"
  frameborder="0"
  style="border:none;border-radius:12px;"
></iframe>`

  const directLink = `${baseUrl}/tracking/${storeParam}`

  // =================== Render ===================

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-200 dark:bg-slate-700" />
        <Skeleton className="h-12 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 bg-white dark:bg-[#151922] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 bg-white dark:bg-[#151922] rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={() => fetchData()} className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  const stats = data?.stats || { totalOrders: 0, inTransit: 0, delivered: 0, pending: 0, deliveryRate: 0 }

  const filteredOrders = (data?.recentOrders || []).filter((order) => {
    if (search) {
      const q = search.toLowerCase()
      const matches =
        order.order_name?.toLowerCase().includes(q) ||
        order.customer_email?.toLowerCase().includes(q) ||
        order.customer_name?.toLowerCase().includes(q) ||
        order.tracking_codes?.some((c) => c.tracking_number.toLowerCase().includes(q))
      if (!matches) return false
    }
    if (statusFilter !== "all") {
      const hasStatus = order.tracking_codes?.some((c) => c.status === statusFilter)
      if (!hasStatus) return false
    }
    return true
  })

  const tabs = [
    { key: "dashboard" as TabKey, label: "Dashboard", icon: BarChart3 },
    { key: "plugin" as TabKey, label: "Plugin de Rastreamento", icon: Settings2 },
    { key: "embed" as TabKey, label: "Instalação", icon: Code2 },
  ]

  const timelineStepKeys = config.plugin_type === "basic" ? TIMELINE_STEP_KEYS_BASIC : TIMELINE_STEP_KEYS_COMPLETE
  const previewActiveStep = config.plugin_type === "basic" ? 2 : 4

  // Preview mock events (translated)
  const previewEvents = [
    { status: "in_transit", desc: pt.inTransitToDestination, location: "São Paulo, SP", date: "26 Fev 2026, 14:30", isCurrent: true },
    { status: "shipped", desc: pt.stepShipped, location: "Curitiba, PR", date: "24 Fev 2026, 09:15", isCurrent: false },
    { status: "confirmed", desc: pt.stepConfirmed, location: "", date: "23 Fev 2026, 18:00", isCurrent: false },
  ]

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie entregas, configure o plugin e instale no seu site
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-white dark:bg-[#151922] text-slate-800 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatedContainer className="space-y-6">
        {/* =================== DASHBOARD TAB =================== */}
        {activeTab === "dashboard" && (
          <>
            <AnimatedItem>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Pedidos", value: stats.totalOrders, icon: Package, bg: "bg-blue-50 dark:bg-blue-500/10", ic: "text-blue-500" },
                  { label: "Em Trânsito", value: stats.inTransit, icon: Truck, bg: "bg-amber-50 dark:bg-amber-500/10", ic: "text-amber-500" },
                  { label: "Entregues", value: stats.delivered, icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-500/10", ic: "text-emerald-500" },
                  { label: "Taxa Entrega", value: `${stats.deliveryRate}%`, icon: TrendingUp, bg: "bg-primary/10", ic: "text-primary" },
                ].map((s) => (
                  <div key={s.label} className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                        <s.icon className={`h-5 w-5 ${s.ic}`} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedItem>

            <AnimatedItem>
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm">
                <div className="p-4 border-b border-slate-200/80 dark:border-slate-700/40">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Pedidos Recentes</h2>
                    <div className="flex-1" />
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 w-56 bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40 text-sm" />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px] h-9 bg-white dark:bg-[#0d1117] border-slate-200 dark:border-slate-700/40 text-sm">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="in_transit">Em Trânsito</SelectItem>
                          <SelectItem value="out_for_delivery">Saiu p/ Entrega</SelectItem>
                          <SelectItem value="delivered">Entregue</SelectItem>
                          <SelectItem value="exception">Exceção</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700/40">
                        {["Pedido", "Cliente", "Valor", "Rastreio", "Status", "Data"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/30">
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                            {search || statusFilter !== "all" ? "Nenhum pedido encontrado" : "Nenhum pedido rastreado. Configure na aba \"Plugin de Rastreamento\"."}
                          </td>
                        </tr>
                      ) : filteredOrders.map((order) => {
                        const mc = order.tracking_codes?.[0]
                        const st = mc?.status || "pending"
                        return (
                          <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{order.order_name || "-"}</td>
                            <td className="px-4 py-3">
                              <p className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{order.customer_name || "-"}</p>
                              <p className="text-xs text-slate-400 truncate max-w-[160px]">{order.customer_email}</p>
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">{formatCurrency(order.total_price, order.currency)}</td>
                            <td className="px-4 py-3">{mc ? <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{mc.tracking_number}</span> : <span className="text-xs text-slate-400">-</span>}</td>
                            <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[st]}`}>{TRACKING_STATUS_LABELS[st as TrackingStatus] || st}</span></td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(order.order_created_at)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredOrders.length > 0 && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-700/40 flex justify-between items-center">
                    <p className="text-xs text-slate-400">Mostrando {filteredOrders.length} pedidos</p>
                    <Link href="/portal/tracking/orders" className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1">
                      Ver todos <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            </AnimatedItem>
          </>
        )}

        {/* =================== PLUGIN CONFIG TAB =================== */}
        {activeTab === "plugin" && (
          <AnimatedItem>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Config Panel - Left */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-primary" />
                      Configurações do Plugin
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">17track</span>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Plugin Type */}
                    <div className="space-y-2">
                      <Label className="text-[13px] font-medium">Tipo do Plugin</Label>
                      <Select value={config.plugin_type} onValueChange={(v) => setConfig({ ...config, plugin_type: v as "basic" | "complete" })}>
                        <SelectTrigger className="h-10 bg-white dark:bg-[#0d1117]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="complete">Completo (9 etapas)</SelectItem>
                          <SelectItem value="basic">Básico (5 etapas)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-400">{config.plugin_type === "complete" ? "Inclui alfândega e centros de distribuição." : "Etapas principais do rastreamento."}</p>
                    </div>

                    {/* Colors Section */}
                    <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700/30">
                      <div className="flex items-center gap-2">
                        <Palette className="h-4 w-4 text-slate-400" />
                        <Label className="text-[13px] font-semibold">Cores do Plugin</Label>
                      </div>

                      {/* Primary Color */}
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-slate-500">Cor Principal</Label>
                        <p className="text-[10px] text-slate-400">Botões, barra de progresso e elementos principais</p>
                        <div className="flex items-center gap-2">
                          <input type="color" value={config.primary_color} onChange={(e) => setConfig({ ...config, primary_color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <Input value={config.primary_color} onChange={(e) => setConfig({ ...config, primary_color: e.target.value })} className="h-9 flex-1 font-mono text-xs bg-white dark:bg-[#0d1117]" />
                        </div>
                      </div>

                      {/* Accent Color */}
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-slate-500">Cor de Destaque</Label>
                        <p className="text-[10px] text-slate-400">Links, badges e destaques de status</p>
                        <div className="flex items-center gap-2">
                          <input type="color" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <Input value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} className="h-9 flex-1 font-mono text-xs bg-white dark:bg-[#0d1117]" />
                        </div>
                      </div>

                      {/* Icon Color */}
                      <div className="space-y-1.5">
                        <Label className="text-[12px] text-slate-500">Cor do Ícone</Label>
                        <p className="text-[10px] text-slate-400">Ícone de rastreamento no header e timeline</p>
                        <div className="flex items-center gap-2">
                          <input type="color" value={config.icon_color} onChange={(e) => setConfig({ ...config, icon_color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          <Input value={config.icon_color} onChange={(e) => setConfig({ ...config, icon_color: e.target.value })} className="h-9 flex-1 font-mono text-xs bg-white dark:bg-[#0d1117]" />
                        </div>
                      </div>

                      {/* Color Preview Swatches */}
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-[#0d1117] rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow-sm" style={{ backgroundColor: config.primary_color }} />
                          <span className="text-[10px] text-slate-400">Principal</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow-sm" style={{ backgroundColor: config.accent_color }} />
                          <span className="text-[10px] text-slate-400">Destaque</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow-sm" style={{ backgroundColor: config.icon_color }} />
                          <span className="text-[10px] text-slate-400">Ícone</span>
                        </div>
                      </div>
                    </div>

                    {/* Language (for the plugin/widget only) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/30">
                      <Label className="text-[13px] font-medium flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-slate-400" /> Idioma do Widget</Label>
                      <p className="text-[10px] text-slate-400">Define o idioma exibido no plugin para seus clientes</p>
                      <Select value={config.language} onValueChange={(v) => setConfig({ ...config, language: v })}>
                        <SelectTrigger className="h-10 bg-white dark:bg-[#0d1117]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              <span className="flex items-center gap-2">
                                <span className="text-base">{lang.flag}</span>
                                {lang.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Toggles */}
                    <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-700/30">
                      {[
                        { label: "Esconder transportadora", desc: "Oculta nome/ícone da transportadora", key: "hide_carrier" as const },
                        { label: "Esconder redirecionamento", desc: "Oculta link para site da transportadora", key: "hide_redirect" as const },
                        { label: "Previsão de entrega", desc: "Mostra data estimada de entrega", key: "show_estimated_delivery" as const },
                        { label: "Logo da transportadora", desc: "Exibe logotipo da transportadora", key: "show_carrier_logo" as const },
                      ].map(toggle => (
                        <div key={toggle.key} className="flex items-center justify-between pt-2">
                          <div>
                            <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{toggle.label}</p>
                            <p className="text-[11px] text-slate-400">{toggle.desc}</p>
                          </div>
                          <Switch checked={config[toggle.key]} onCheckedChange={(v) => setConfig({ ...config, [toggle.key]: v })} />
                        </div>
                      ))}
                    </div>

                    {/* Blocked Words */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/30">
                      <Label className="text-[13px] font-medium">Palavras Bloqueadas</Label>
                      <Textarea value={config.blocked_words} onChange={(e) => setConfig({ ...config, blocked_words: e.target.value })} placeholder="palavra1, palavra2" rows={2} className="text-sm bg-white dark:bg-[#0d1117] resize-none" />
                      <p className="text-[11px] text-slate-400">Oculta essas palavras das atualizações</p>
                    </div>

                    {/* Not Found Message */}
                    <div className="space-y-2">
                      <Label className="text-[13px] font-medium">Mensagem &quot;Não encontrado&quot;</Label>
                      <Textarea value={config.not_found_message} onChange={(e) => setConfig({ ...config, not_found_message: e.target.value })} rows={2} className="text-sm bg-white dark:bg-[#0d1117] resize-none" />
                    </div>

                    {/* Save */}
                    <Button onClick={savePluginConfig} disabled={savingConfig || !selectedStoreId} className="w-full bg-primary hover:bg-primary/85 text-white">
                      {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : configSaved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      {configSaved ? "Salvo!" : "Salvar Configurações"}
                    </Button>
                    {!selectedStoreId && <p className="text-[11px] text-amber-600 text-center">Nenhuma loja de rastreamento vinculada.</p>}
                  </div>
                </div>
              </div>

              {/* =================== LIVE PREVIEW - iumy style =================== */}
              <div className="lg:col-span-3">
                <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden sticky top-6">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Eye className="h-4 w-4 text-primary" />
                        Preview ao Vivo
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Assim seus clientes verão o rastreamento</p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
                      <Globe className="h-3 w-3 text-slate-400" />
                      <span className="text-[10px] font-medium text-slate-500">{SUPPORTED_LANGUAGES.find(l => l.value === config.language)?.label || "PT-BR"}</span>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="bg-slate-50 dark:bg-[#0d1117] rounded-2xl border border-slate-200 dark:border-slate-700/40 overflow-hidden shadow-inner">
                      {/* === Header Banner with gradient === */}
                      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${config.primary_color}, ${config.accent_color})` }}>
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
                        <div className="relative px-6 py-8 text-center">
                          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-white/20 backdrop-blur-sm shadow-lg">
                            <Package className="h-7 w-7 text-white" style={{ filter: `drop-shadow(0 0 4px ${config.icon_color}60)` }} />
                          </div>
                          <h4 className="text-lg font-bold text-white">
                            {pt.trackYourOrder}
                          </h4>
                          <p className="text-xs text-white/70 mt-1">
                            {pt.enterTrackingNumber}
                          </p>
                          {/* Search Tabs */}
                          <div className="flex items-center justify-center gap-4 mt-4 mb-3">
                            {[
                              { icon: Hash, label: pt.tableTracking || "Rastreio" },
                              { icon: Mail, label: "Email" },
                            ].map((tab, idx) => (
                              <button key={idx} className={`flex items-center gap-1.5 text-[11px] font-medium pb-1 border-b-2 transition-all ${idx === 0 ? "text-white border-white" : "text-white/50 border-transparent"}`}>
                                <tab.icon className="h-3 w-3" />
                                {tab.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 max-w-md mx-auto">
                            <div className="relative flex-1">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <Input
                                placeholder={pt.examplePlaceholder}
                                className="h-12 pl-10 bg-white dark:bg-[#151922] border-0 shadow-lg text-sm rounded-xl"
                                disabled
                              />
                            </div>
                            <Button className="h-12 px-6 text-white shadow-lg rounded-xl font-semibold" style={{ backgroundColor: config.accent_color }} disabled>
                              <Search className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* === Order Result Card === */}
                      <div className="p-5 space-y-4">
                        {/* Order Info Card */}
                        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 shadow-sm overflow-hidden">
                          {/* Order Header */}
                          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `2px solid ${config.primary_color}15` }}>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${config.icon_color}15` }}>
                                <Package className="h-5 w-5" style={{ color: config.icon_color }} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{pt.tableOrder || "Pedido"} #1234</p>
                                {!config.hide_carrier && (
                                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                    <Truck className="h-3 w-3" /> Correios - BR123456789BR
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white shadow-sm" style={{ backgroundColor: config.accent_color }}>
                                <Truck className="h-3 w-3" />
                                {pt.statusInTransit || "Em Trânsito"}
                              </span>
                            </div>
                          </div>

                          {/* Delivery Info */}
                          {config.show_estimated_delivery && (
                            <div className="px-5 py-3 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                              <div className="flex items-center gap-2 text-slate-500">
                                <Calendar className="h-3.5 w-3.5" />
                                <span className="text-[11px]">{pt.forecast || "Previsão"}: <strong className="text-slate-700 dark:text-slate-200">28 Fev 2026</strong></span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <MapPin className="h-3.5 w-3.5" />
                                <span className="text-[11px]">São Paulo, SP</span>
                              </div>
                            </div>
                          )}

                          {/* Horizontal Progress Timeline */}
                          <div className="px-5 py-5">
                            <div className="relative">
                              {/* Background track */}
                              <div className="absolute top-[14px] left-[14px] right-[14px] h-[3px] bg-slate-200 dark:bg-slate-700 rounded-full" />
                              {/* Active track */}
                              <div
                                className="absolute top-[14px] left-[14px] h-[3px] rounded-full transition-all duration-700 ease-out"
                                style={{
                                  backgroundColor: config.primary_color,
                                  width: `calc(${(previewActiveStep / (timelineStepKeys.length - 1)) * 100}% - 28px)`,
                                }}
                              />

                              <div className="relative flex justify-between">
                                {timelineStepKeys.map((step, i) => {
                                  const isActive = i <= previewActiveStep
                                  const isCurrent = i === previewActiveStep
                                  const StepIcon = step.icon
                                  return (
                                    <div key={step.key} className="flex flex-col items-center z-10" style={{ width: `${100 / timelineStepKeys.length}%` }}>
                                      <div
                                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center transition-all duration-300"
                                        style={{
                                          backgroundColor: isActive ? config.primary_color : "#e2e8f0",
                                          color: isActive ? "white" : "#94a3b8",
                                          boxShadow: isCurrent ? `0 0 0 4px ${config.primary_color}30` : "none",
                                          transform: isCurrent ? "scale(1.1)" : "scale(1)",
                                        }}
                                      >
                                        <StepIcon className="h-3.5 w-3.5" />
                                      </div>
                                      <p className={`text-[8px] mt-1.5 text-center font-medium leading-tight max-w-[60px] ${
                                        isCurrent ? "font-bold" : isActive ? "text-slate-600 dark:text-slate-300" : "text-slate-400"
                                      }`} style={isCurrent ? { color: config.primary_color } : undefined}>
                                        {getTimelineStepLabel(step.key, config.language)}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Vertical Events Timeline */}
                        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 shadow-sm px-5 py-4">
                          <h5 className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4">{pt.recentOrders ? "Histórico" : "Histórico"}</h5>
                          <div className="space-y-0">
                            {previewEvents.map((evt, i) => (
                              <div key={i} className="flex gap-3">
                                {/* Dot + line */}
                                <div className="flex flex-col items-center">
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{
                                      backgroundColor: evt.isCurrent ? config.accent_color : "#cbd5e1",
                                      boxShadow: evt.isCurrent ? `0 0 0 4px ${config.accent_color}25` : "none",
                                    }}
                                  />
                                  {i < previewEvents.length - 1 && (
                                    <div className="w-[2px] flex-1 min-h-[32px] bg-slate-200 dark:bg-slate-700 my-1" />
                                  )}
                                </div>
                                {/* Content */}
                                <div className="pb-4 -mt-0.5 flex-1">
                                  <p className={`text-[12px] font-medium ${evt.isCurrent ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
                                    {evt.desc}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {evt.location && <span>{evt.location} &middot; </span>}
                                    {evt.date}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Carrier + Powered by */}
                        <div className="flex items-center justify-between px-1">
                          {!config.hide_redirect && (
                            <a className="text-[10px] font-medium flex items-center gap-1" style={{ color: config.accent_color }}>
                              <ExternalLink className="h-3 w-3" />
                              {pt.viewAtCarrier || "Ver no site da transportadora"}
                            </a>
                          )}
                          <p className="text-[9px] text-slate-400 flex items-center gap-1 ml-auto">
                            <Sparkles className="h-3 w-3" />
                            Powered by Convertfy + 17track
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedItem>
        )}

        {/* =================== EMBED/INSTALL TAB =================== */}
        {activeTab === "embed" && (
          <AnimatedItem>
            <div className="space-y-6">
              {/* Store ID - Always shown */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/5 dark:to-purple-500/5 border border-indigo-200/60 dark:border-indigo-500/20 rounded-xl px-5 py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Seu Store ID:</span>
                  {selectedStoreId ? (
                    <>
                      <code className="text-xs font-mono bg-white dark:bg-slate-800 px-3 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300">{selectedStoreId}</code>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-600" onClick={() => copyToClipboard(selectedStoreId, "sid")}>
                        {copiedScript === "sid" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                        {copiedScript === "sid" ? "Copiado" : "Copiar"}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-md">Nenhuma loja vinculada. Configure uma integração na página de Integrações.</span>
                  )}
                </div>
                <p className="text-[11px] text-indigo-500/80 mt-1.5">
                  {selectedStoreId
                    ? "ID único da sua loja, já preenchido automaticamente nos códigos abaixo. É só copiar e colar."
                    : "Vincule uma loja nas Integrações para gerar automaticamente o Store ID."}
                </p>
              </div>

              {/* Embed Codes */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-primary" />
                    Instalar no Seu Site
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Escolha uma opção para adicionar o rastreamento ao seu site. As configurações de cores, idioma e tipo são aplicadas automaticamente.</p>
                </div>

                <div className="p-6 space-y-8">
                  {/* Widget */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-sm font-bold text-blue-600">1</div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Widget JavaScript</h4>
                        <span className="text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">Recomendado</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 ml-11">Cole no HTML da página. Cores, tipo e idioma são aplicados automaticamente.</p>
                    <div className="relative ml-11">
                      <pre className="bg-slate-50 dark:bg-[#0d1117] rounded-lg p-4 text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto border border-slate-200 dark:border-slate-700/40 leading-relaxed">{widgetScript}</pre>
                      <Button variant="outline" size="sm" className="absolute top-2 right-2 h-7 text-[11px]" onClick={() => copyToClipboard(widgetScript, "w")}>
                        {copiedScript === "w" ? <><Check className="h-3 w-3 mr-1 text-emerald-500" /> Copiado</> : <><Copy className="h-3 w-3 mr-1" /> Copiar</>}
                      </Button>
                    </div>
                  </div>

                  {/* iFrame */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-sm font-bold text-purple-600">2</div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Embed via iFrame</h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 ml-11">Para plataformas que não permitem scripts externos (ex: Nuvemshop).</p>
                    <div className="relative ml-11">
                      <pre className="bg-slate-50 dark:bg-[#0d1117] rounded-lg p-4 text-[11px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto border border-slate-200 dark:border-slate-700/40 leading-relaxed">{iframeEmbed}</pre>
                      <Button variant="outline" size="sm" className="absolute top-2 right-2 h-7 text-[11px]" onClick={() => copyToClipboard(iframeEmbed, "i")}>
                        {copiedScript === "i" ? <><Check className="h-3 w-3 mr-1 text-emerald-500" /> Copiado</> : <><Copy className="h-3 w-3 mr-1" /> Copiar</>}
                      </Button>
                    </div>
                  </div>

                  {/* Direct Link */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-sm font-bold text-amber-600">3</div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Link da Página de Rastreamento</h4>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 ml-11">Use nos emails de confirmação ou como botão na loja.</p>
                    <div className="flex items-center gap-2 ml-11">
                      <div className="flex-1 bg-slate-50 dark:bg-[#0d1117] rounded-lg px-4 py-3 border border-slate-200 dark:border-slate-700/40">
                        <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">{directLink}</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-10 text-xs" onClick={() => copyToClipboard(directLink, "l")}>
                        {copiedScript === "l" ? <><Check className="h-3 w-3 mr-1 text-emerald-500" /> Copiado</> : <><Copy className="h-3 w-3 mr-1" /> Copiar</>}
                      </Button>
                      <Button variant="outline" size="sm" className="h-10 text-xs" asChild>
                        <a href={directLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> Abrir</a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* How to Install */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">Como Instalar</h3>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {[
                      "Configure o plugin na aba \"Plugin de Rastreamento\" (cores, tipo, idioma).",
                      "Copie o código acima (Widget JS ou iFrame).",
                      "Na sua plataforma, crie ou acesse a página de rastreio.",
                      "Incorpore o HTML (busque \"HTML personalizado\" ou \"<>\" no editor).",
                      "Salve e publique. O widget aparece com suas configurações.",
                    ].map((text, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ color: config.primary_color }}>{i + 1}</div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-0.5">{text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-4 mt-5">
                    <p className="text-xs text-amber-700 dark:text-amber-400"><strong>Nota:</strong> Plataformas como Nuvemshop podem não aceitar scripts. Use iFrame ou o Link Direto.</p>
                  </div>
                </div>
              </div>

              {/* Supported Carriers */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Transportadoras Suportadas
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Rastreamento global via 17track com detecção automática de transportadora.</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[
                      { name: "Correios", country: "Brasil" },
                      { name: "Jadlog", country: "Brasil" },
                      { name: "DHL", country: "Global" },
                      { name: "FedEx", country: "Global" },
                      { name: "UPS", country: "Global" },
                      { name: "USPS", country: "EUA" },
                      { name: "Royal Mail", country: "Reino Unido" },
                      { name: "Deutsche Post", country: "Alemanha" },
                      { name: "Poste Italiane", country: "Itália" },
                      { name: "Correos", country: "Espanha" },
                      { name: "China Post", country: "China" },
                      { name: "YunExpress", country: "China" },
                      { name: "Cainiao", country: "AliExpress" },
                      { name: "4PX", country: "Internacional" },
                      { name: "SF Express", country: "China" },
                      { name: "+900 outras", country: "17track" },
                    ].map((carrier) => (
                      <div key={carrier.name} className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-[#0d1117] rounded-lg border border-slate-100 dark:border-slate-700/30">
                        <Truck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">{carrier.name}</p>
                          <p className="text-[9px] text-slate-400">{carrier.country}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </AnimatedItem>
        )}
      </AnimatedContainer>
    </div>
  )
}
