"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Code2,
  Copy,
  Search,
  ChevronDown,
  ChevronUp,
  XCircle,
  Palette,
  Globe,
  Eye,
  ShoppingBag,
  ArrowRight,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"

// ─── Types ───────────────────────────────────────────────

interface TrackingStoreData {
  client_store_id: string
  store_name: string
  platform: string
  shopify_connected: boolean
  shopify_store_domain: string
  tracking_store_id: string | null
  tracking_active: boolean
  has_17track_key: boolean
  last_sync_at: string | null
  widget_config: {
    primaryColor: string
    language: string
    position: string
  } | null
  stats: { orders: number; pending: number; delivered: number }
}

interface TrackingCode {
  id: string
  tracking_number: string
  carrier_code: string
  carrier_name: string
  status: string
  status_detail: string
  last_event: string
  last_event_at: string | null
  estimated_delivery: string | null
}

interface TrackingOrder {
  id: string
  shopify_order_id: string
  shopify_order_number: string
  order_name: string
  customer_name: string
  customer_email: string
  financial_status: string
  fulfillment_status: string
  total_price: number
  currency: string
  order_created_at: string
  shipped_at: string | null
  delivered_at: string | null
  tracking_codes: TrackingCode[]
}

// ─── Constants ───────────────────────────────────────────

const COLORS = [
  { value: "#3b82f6", label: "Azul" },
  { value: "#10b981", label: "Verde" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#f59e0b", label: "Amarelo" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#000000", label: "Preto" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400", icon: Clock },
  in_transit: { label: "Em Trânsito", color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400", icon: Truck },
  delivered: { label: "Entregue", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400", icon: CheckCircle2 },
  pick_up: { label: "Pronto p/ Retirada", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400", icon: Package },
  expired: { label: "Expirado", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
  alert: { label: "Alerta", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: AlertCircle },
  undelivered: { label: "Não Entregue", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
}

function getTrackingStatus(codes: TrackingCode[]) {
  if (!codes || codes.length === 0) return STATUS_CONFIG.pending
  return STATUS_CONFIG[codes[0].status] || STATUS_CONFIG.pending
}

// ─── Main Component ──────────────────────────────────────

export default function PortalTrackingPage() {
  const [store, setStore] = useState<TrackingStoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("dashboard")

  // Orders state
  const [orders, setOrders] = useState<TrackingOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersPage, setOrdersPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const ordersLimit = 15

  // Plugin state
  const [color, setColor] = useState("#3b82f6")
  const [language, setLanguage] = useState("pt-BR")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // ─── Fetch tracking store data ─────────────────────────

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams()
      if (storeId) params.set("store_id", storeId)

      const response = await fetch(`/api/portal/tracking?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const data = await response.json()

      const stores: TrackingStoreData[] = data.stores || []
      const activeStore = stores.length > 0 ? stores[0] : null
      setStore(activeStore)
      setError(null)

      // Load widget config
      if (activeStore?.widget_config) {
        setColor(activeStore.widget_config.primaryColor || "#3b82f6")
        setLanguage(activeStore.widget_config.language || "pt-BR")
      }
    } catch {
      setError("Não foi possível carregar os dados de rastreamento")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ─── Fetch orders ──────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams({ page: String(ordersPage), limit: String(ordersLimit) })
      if (storeId) params.set("store_id", storeId)
      if (search) params.set("search", search)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/portal/tracking/orders?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar pedidos")
      const data = await response.json()
      setOrders(data.orders || [])
      setOrdersTotal(data.total || 0)
    } catch {
      // silent - orders are secondary
    } finally {
      setOrdersLoading(false)
    }
  }, [ordersPage, search, statusFilter])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (store?.tracking_active) fetchOrders()
  }, [store?.tracking_active, fetchOrders])

  // ─── Script code for installation tab ──────────────────

  const scriptCode = useMemo(() => {
    if (!store?.client_store_id) return ""
    const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"
    return `<!-- Convertfy Tracking Widget -->\n<script>\n(function(){\n  var s=document.createElement('script');\n  s.src='${origin}/api/tracking/script/widget.js';\n  s.async=true;\n  s.dataset.storeId='${store.client_store_id}';\n  s.dataset.color='${color}';\n  s.dataset.lang='${language}';\n  document.head.appendChild(s);\n})();\n</script>`
  }, [store?.client_store_id, color, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    toast({ title: "Codigo copiado!" })
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── Save widget config ────────────────────────────────

  const handleSaveConfig = async () => {
    if (!store?.client_store_id) return
    setSaving(true)
    try {
      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_store_id: store.client_store_id,
          widget_config: { primaryColor: color, language, position: "bottom-right" },
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      toast({ title: "Configuracao salva!" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configuracao" })
    } finally {
      setSaving(false)
    }
  }

  // ─── Loading ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  // ─── Error ─────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 p-8 text-center max-w-sm shadow-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{error}</p>
          <Button onClick={() => fetchData()} size="sm" className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  // ─── Not active CTA ────────────────────────────────────

  if (!store || !store.tracking_active) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Package className="h-7 w-7 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento nao ativado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            {!store?.shopify_connected
              ? "Conecte a Shopify na pagina de Integracoes para ativar o rastreamento."
              : "Ative o rastreamento na pagina de Integracoes para comecar a acompanhar seus pedidos."}
          </p>
          <Button asChild className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            <Link href="/portal/integrations">
              Ir para Integracoes
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // ─── Active tracking view with tabs ────────────────────

  const { stats } = store
  const deliveryRate = stats.orders > 0 ? Math.round((stats.delivered / stats.orders) * 100) : 0
  const ordersTotalPages = Math.ceil(ordersTotal / ordersLimit)
  const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe os envios da loja <strong className="text-slate-700 dark:text-slate-200">{store.store_name}</strong>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-9 w-9 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-[#151922] border border-slate-200/80 dark:border-slate-700/40 p-1 rounded-lg shadow-sm">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-4 py-2 text-sm font-medium">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="plugin" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-4 py-2 text-sm font-medium">
            Plugin de Rastreamento
          </TabsTrigger>
          <TabsTrigger value="installation" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-4 py-2 text-sm font-medium">
            Instalacao
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Dashboard ═══ */}
        <TabsContent value="dashboard" className="space-y-6 mt-0">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Pedidos</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.orders}</p>
            </div>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-amber-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Em Transito</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            </div>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Entregues</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
            </div>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-violet-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Taxa Entrega</span>
              </div>
              <p className="text-2xl font-bold text-violet-600">{deliveryRate}%</p>
            </div>
          </div>

          {/* Orders section */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
            {/* Orders header + filters */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                  Pedidos Recentes
                </h3>
                <div className="flex gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Buscar..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setOrdersPage(1) }}
                      className="pl-9 h-9 text-sm bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOrdersPage(1) }}>
                    <SelectTrigger className="w-[140px] h-9 text-sm bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="in_transit">Em Transito</SelectItem>
                      <SelectItem value="delivered">Entregue</SelectItem>
                      <SelectItem value="alert">Alerta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Orders table */}
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Clock className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  {stats.orders === 0 ? "Aguardando pedidos" : "Nenhum resultado"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm text-center">
                  {stats.orders === 0
                    ? "Os pedidos aparecerao aqui automaticamente quando a Shopify enviar os dados via webhook."
                    : "Tente ajustar os filtros de busca."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700/30 bg-slate-50/50 dark:bg-slate-800/30">
                      <th className="text-left text-xs text-slate-500 font-medium py-3 px-5">Pedido</th>
                      <th className="text-left text-xs text-slate-500 font-medium py-3 px-4">Cliente</th>
                      <th className="text-left text-xs text-slate-500 font-medium py-3 px-4">Status</th>
                      <th className="text-left text-xs text-slate-500 font-medium py-3 px-4">Rastreio</th>
                      <th className="text-right text-xs text-slate-500 font-medium py-3 px-4">Valor</th>
                      <th className="text-right text-xs text-slate-500 font-medium py-3 px-5">Data</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const trackingStatus = getTrackingStatus(order.tracking_codes)
                      const StatusIcon = trackingStatus.icon
                      const isExpanded = expandedOrder === order.id

                      return (
                        <OrderRow
                          key={order.id}
                          order={order}
                          trackingStatus={trackingStatus}
                          StatusIcon={StatusIcon}
                          isExpanded={isExpanded}
                          onToggle={() => setExpandedOrder(isExpanded ? null : order.id)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {ordersTotalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700/30">
                <span className="text-xs text-slate-500">Pagina {ordersPage} de {ordersTotalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={ordersPage <= 1} onClick={() => setOrdersPage(ordersPage - 1)}
                    className="border-slate-200/80 dark:border-slate-700/40 text-sm">
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={ordersPage >= ordersTotalPages} onClick={() => setOrdersPage(ordersPage + 1)}
                    className="border-slate-200/80 dark:border-slate-700/40 text-sm">
                    Proxima
                  </Button>
                </div>
              </div>
            )}
          </div>

          {store.last_sync_at && (
            <p className="text-xs text-slate-400 text-center">
              Ultima sincronizacao: {new Date(store.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </TabsContent>

        {/* ═══ TAB: Plugin de Rastreamento ═══ */}
        <TabsContent value="plugin" className="space-y-6 mt-0">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Config panel */}
            <div className="space-y-6">
              {/* Color picker */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Personalizacao do Widget
                  </h3>
                </div>
                <div className="p-6 space-y-5">
                  {/* Color */}
                  <div className="space-y-3">
                    <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Cor Principal</Label>
                    <div className="flex gap-3 flex-wrap">
                      {COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setColor(c.value)}
                          className={`w-10 h-10 rounded-lg transition-all ${
                            color === c.value
                              ? "ring-2 ring-offset-2 ring-primary ring-offset-white dark:ring-offset-[#151922] scale-110"
                              : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.label}
                        />
                      ))}
                      {/* Custom color */}
                      <div className="relative">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-10 h-10 rounded-lg cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600"
                          title="Cor personalizada"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Language */}
                  <div className="space-y-2">
                    <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      Idioma do Widget
                    </Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="w-full h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleSaveConfig} disabled={saving} className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm">
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar Configuracao
                  </Button>
                </div>
              </div>

              {/* Store info */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                    <ShoppingBag className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{store.store_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{store.shopify_store_domain || store.platform}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats.orders}</p>
                    <p className="text-slate-500">Pedidos</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-emerald-600">{deliveryRate}%</p>
                    <p className="text-slate-500">Entrega</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Preview ao Vivo
                </h3>
              </div>
              <div className="p-4">
                <div className="bg-slate-50 dark:bg-[#0D1117] rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-700/30">
                  {/* Browser mockup bar */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200/50 dark:border-slate-700/30">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 bg-white dark:bg-slate-700 rounded px-3 py-1 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                      {store.shopify_store_domain || "minhaloja.com.br"}/rastreio
                    </div>
                  </div>
                  {/* Widget iframe */}
                  <iframe
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin:0; padding:24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafa; min-height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .widget-container { width: 100%; max-width: 400px; }
  .widget-card { background: white; border-radius: 16px; padding: 32px 24px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; }
  .widget-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
  .widget-icon svg { width: 24px; height: 24px; }
  .widget-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
  .widget-subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
  .widget-input { width: 100%; padding: 12px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box; margin-bottom: 12px; transition: border-color 0.2s; }
  .widget-input:focus { border-color: ${color}; }
  .widget-input::placeholder { color: #cbd5e1; }
  .widget-btn { width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; color: white; cursor: pointer; transition: opacity 0.2s; }
  .widget-btn:hover { opacity: 0.9; }
  .widget-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; font-size: 12px; color: #94a3b8; }
  .widget-divider::before, .widget-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
</style>
</head>
<body>
  <div class="widget-container">
    <div class="widget-card">
      <div class="widget-icon" style="background: ${color}15;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="widget-title">${language === "pt-BR" ? "Rastrear Pedido" : language === "en" ? "Track Order" : language === "es" ? "Rastrear Pedido" : language === "de" ? "Bestellung verfolgen" : "Traccia Ordine"}</div>
      <div class="widget-subtitle">${language === "pt-BR" ? "Acompanhe seu pedido em tempo real" : language === "en" ? "Track your order in real time" : language === "es" ? "Sigue tu pedido en tiempo real" : language === "de" ? "Verfolgen Sie Ihre Bestellung" : "Monitora il tuo ordine"}</div>
      <input class="widget-input" placeholder="${language === "pt-BR" ? "Codigo de rastreio" : language === "en" ? "Tracking code" : language === "es" ? "Codigo de rastreo" : language === "de" ? "Sendungsnummer" : "Codice di tracciamento"}" />
      <button class="widget-btn" style="background: ${color};">${language === "pt-BR" ? "Rastrear" : language === "en" ? "Track" : language === "es" ? "Rastrear" : language === "de" ? "Verfolgen" : "Traccia"}</button>
      <div class="widget-divider">${language === "pt-BR" ? "ou" : language === "en" ? "or" : language === "es" ? "o" : language === "de" ? "oder" : "o"}</div>
      <input class="widget-input" placeholder="${language === "pt-BR" ? "Seu email" : language === "en" ? "Your email" : language === "es" ? "Tu email" : language === "de" ? "Ihre E-Mail" : "La tua email"}" />
      <button class="widget-btn" style="background: ${color}; opacity: 0.85;">${language === "pt-BR" ? "Buscar por Email" : language === "en" ? "Search by Email" : language === "es" ? "Buscar por Email" : language === "de" ? "Per E-Mail suchen" : "Cerca per Email"}</button>
    </div>
  </div>
</body>
</html>`}
                    className="w-full border-0"
                    style={{ height: 480 }}
                    title="Widget Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: Instalacao ═══ */}
        <TabsContent value="installation" className="space-y-6 mt-0">
          <div className="max-w-[800px] mx-auto space-y-6">
            {/* Script code */}
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-cyan-600" />
                  Codigo de Instalacao
                </h3>
                <Button variant="outline" size="sm" onClick={handleCopy}
                  className="border-slate-200/80 dark:border-slate-700/40 text-sm">
                  {copied ? (
                    <><CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-500" /> Copiado!</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-1.5" /> Copiar</>
                  )}
                </Button>
              </div>
              <div className="p-6">
                <pre className="bg-slate-900 dark:bg-[#0D1117] rounded-lg p-4 overflow-x-auto">
                  <code className="text-green-400 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                    {scriptCode}
                  </code>
                </pre>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                  Como Instalar
                </h3>
              </div>
              <div className="p-6">
                <ol className="space-y-4">
                  {[
                    { step: "1", title: "Copie o codigo acima", desc: "Clique no botao \"Copiar\" para copiar o snippet." },
                    { step: "2", title: "Acesse o painel Shopify", desc: "Va em Online Store → Themes → Edit Code." },
                    { step: "3", title: "Edite o theme.liquid", desc: "Abra o arquivo theme.liquid no editor de codigo." },
                    { step: "4", title: "Cole o codigo", desc: "Cole o snippet antes da tag </body>." },
                    { step: "5", title: "Salve e teste", desc: "Salve o arquivo e acesse sua loja para verificar o widget." },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: color }}>
                        {item.step}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Alternative: Create dedicated page */}
            <div className="bg-blue-50 dark:bg-blue-500/5 rounded-xl border border-blue-200/50 dark:border-blue-500/20 p-6">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Alternativa: Pagina dedicada</h4>
              <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed">
                Voce tambem pode criar uma pagina dedicada no Shopify (Pages → Add page) com o titulo
                &ldquo;Rastrear Pedido&rdquo; e inserir o codigo acima no campo de HTML da pagina. Assim seus
                clientes podem acessar diretamente em <strong>{store.shopify_store_domain || "sualojacom.br"}/pages/rastrear-pedido</strong>.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── OrderRow Component ──────────────────────────────────

function OrderRow({
  order,
  trackingStatus,
  StatusIcon,
  isExpanded,
  onToggle,
}: {
  order: TrackingOrder
  trackingStatus: { label: string; color: string }
  StatusIcon: React.ElementType
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="border-b border-slate-50 dark:border-slate-700/20 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-3 px-5">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{order.order_name}</span>
        </td>
        <td className="py-3 px-4">
          <div>
            <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{order.customer_name || "—"}</p>
            <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{order.customer_email || ""}</p>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${trackingStatus.color}`}>
            <StatusIcon className="h-3 w-3" />
            {trackingStatus.label}
          </span>
        </td>
        <td className="py-3 px-4">
          {order.tracking_codes.length > 0 ? (
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{order.tracking_codes[0].tracking_number}</span>
          ) : (
            <span className="text-xs text-slate-400">Sem rastreio</span>
          )}
        </td>
        <td className="text-right py-3 px-4">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: order.currency || "BRL" }).format(order.total_price)}
          </span>
        </td>
        <td className="text-right py-3 px-5">
          <span className="text-xs text-slate-500">
            {order.order_created_at ? new Date(order.order_created_at).toLocaleDateString("pt-BR") : "—"}
          </span>
        </td>
        <td className="py-3 pr-4">
          {order.tracking_codes.length > 0 && (
            isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </td>
      </tr>

      {isExpanded && order.tracking_codes.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-slate-50/70 dark:bg-slate-800/20 px-5 py-4 border-b border-slate-100 dark:border-slate-700/20">
            <div className="space-y-3">
              {order.tracking_codes.map((code) => {
                const codeStatus = STATUS_CONFIG[code.status] || STATUS_CONFIG.pending
                const CodeIcon = codeStatus.icon
                return (
                  <div key={code.id} className="bg-white dark:bg-[#151922] rounded-lg border border-slate-200/80 dark:border-slate-700/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-medium text-slate-800 dark:text-slate-100">{code.tracking_number}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${codeStatus.color}`}>
                          <CodeIcon className="h-3 w-3" />
                          {codeStatus.label}
                        </span>
                      </div>
                      {code.carrier_name && <span className="text-xs text-slate-500">{code.carrier_name}</span>}
                    </div>
                    {code.last_event && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">{code.last_event}</p>}
                    <div className="flex items-center gap-4 text-[11px] text-slate-400">
                      {code.last_event_at && <span>Ultima atualizacao: {new Date(code.last_event_at).toLocaleString("pt-BR")}</span>}
                      {code.estimated_delivery && <span>Previsao: {new Date(code.estimated_delivery).toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
