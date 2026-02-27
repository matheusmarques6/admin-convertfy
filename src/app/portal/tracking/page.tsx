"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Search,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Palette,
  Globe,
  Eye,
  Code2,
  ArrowRight,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"

// ─── Types ──────────────────────────────────────────────

interface TrackingStoreData {
  client_store_id: string
  store_name: string
  platform: string
  shopify_connected: boolean
  tracking_store_id: string | null
  tracking_active: boolean
  has_17track_key: boolean
  last_sync_at: string | null
  stats: { orders: number; pending: number; delivered: number }
  widget_config: {
    primaryColor: string
    language: string
    position: string
  } | null
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

// ─── Constants ──────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400", icon: Clock },
  in_transit: { label: "Em Trânsito", color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400", icon: Truck },
  delivered: { label: "Entregue", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400", icon: CheckCircle2 },
  pick_up: { label: "Pronto p/ Retirada", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400", icon: Package },
  expired: { label: "Expirado", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
  alert: { label: "Alerta", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: AlertCircle },
  undelivered: { label: "Não Entregue", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
}

const WIDGET_COLORS = [
  { value: "#3b82f6", label: "Azul", tw: "bg-blue-500" },
  { value: "#10b981", label: "Verde", tw: "bg-emerald-500" },
  { value: "#8b5cf6", label: "Roxo", tw: "bg-violet-500" },
  { value: "#f59e0b", label: "Âmbar", tw: "bg-amber-500" },
  { value: "#ef4444", label: "Vermelho", tw: "bg-red-500" },
  { value: "#000000", label: "Preto", tw: "bg-black" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
]

function getTrackingStatus(codes: TrackingCode[]): { label: string; color: string; icon: React.ElementType } {
  if (!codes || codes.length === 0) return STATUS_LABELS.pending
  return STATUS_LABELS[codes[0].status] || STATUS_LABELS.pending
}

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR")
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// ─── Page ───────────────────────────────────────────────

export default function PortalTrackingPage() {
  // Store data
  const [store, setStore] = useState<TrackingStoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Orders data
  const [orders, setOrders] = useState<TrackingOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const limit = 20

  // Widget config
  const [widgetColor, setWidgetColor] = useState("#3b82f6")
  const [widgetLanguage, setWidgetLanguage] = useState("pt-BR")
  const [copied, setCopied] = useState(false)
  const [savingWidget, setSavingWidget] = useState(false)

  // Debounce ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // ─── Fetch store data ─────────────────────────────────

  const fetchStore = useCallback(async (showRefresh = false) => {
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

      // Load widget config from store
      if (activeStore?.widget_config) {
        setWidgetColor(activeStore.widget_config.primaryColor || "#3b82f6")
        setWidgetLanguage(activeStore.widget_config.language || "pt-BR")
      }
    } catch {
      setError("Não foi possível carregar os dados de rastreamento")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ─── Fetch orders ─────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)

    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (storeId) params.set("store_id", storeId)
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/portal/tracking/orders?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar pedidos")
      const data = await response.json()
      setOrders(data.orders || [])
      setOrdersTotal(data.total || 0)
    } catch {
      setOrders([])
      setOrdersTotal(0)
    } finally {
      setOrdersLoading(false)
    }
  }, [page, debouncedSearch, statusFilter])

  // ─── Effects ──────────────────────────────────────────

  useEffect(() => { fetchStore() }, [fetchStore])

  useEffect(() => {
    if (store?.tracking_active) fetchOrders()
  }, [store?.tracking_active, fetchOrders])

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  const handleRefresh = () => {
    fetchStore(true)
    if (store?.tracking_active) fetchOrders()
  }

  // ─── Widget logic ─────────────────────────────────────

  const scriptCode = useMemo(() => {
    if (!store?.client_store_id) return ""
    const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"
    return `<!-- Convertfy Tracking Widget -->
<script>
(function(){
  var s=document.createElement('script');
  s.src='${origin}/api/tracking/script/widget.js';
  s.async=true;
  s.dataset.storeId='${store.client_store_id}';
  s.dataset.color='${widgetColor}';
  s.dataset.lang='${widgetLanguage}';
  document.head.appendChild(s);
})();
</script>`
  }, [store?.client_store_id, widgetColor, widgetLanguage])

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    toast({ title: "Código copiado!" })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveWidget = async () => {
    if (!store?.client_store_id) return
    setSavingWidget(true)
    try {
      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_store_id: store.client_store_id,
          widget_config: { primaryColor: widgetColor, language: widgetLanguage, position: "bottom-right" },
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      toast({ title: "Configuração do widget salva!" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configuração" })
    } finally {
      setSavingWidget(false)
    }
  }

  // ─── Derived values ───────────────────────────────────

  const totalPages = Math.ceil(ordersTotal / limit)
  const deliveryRate = store?.stats
    ? store.stats.orders > 0
      ? ((store.stats.delivered / store.stats.orders) * 100).toFixed(1)
      : "0"
    : "0"

  const widgetLabel = useMemo(() => {
    switch (widgetLanguage) {
      case "en": return "Track Order"
      case "es": return "Rastrear Pedido"
      case "de": return "Bestellung verfolgen"
      case "it": return "Traccia Ordine"
      default: return "Rastrear Pedido"
    }
  }, [widgetLanguage])

  // ─── Loading State ────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700" />
            <Skeleton className="h-4 w-64 mt-2 bg-slate-100 dark:bg-slate-800" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl bg-white dark:bg-[#151922] border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl bg-white dark:bg-[#151922] border border-slate-100 dark:border-slate-700/30" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg bg-white dark:bg-[#151922] border border-slate-100 dark:border-slate-700/30" />
        ))}
      </div>
    )
  }

  // ─── Error State ──────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <Button onClick={() => fetchStore()} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // ─── Tracking Not Active ──────────────────────────────

  if (!store || !store.tracking_active) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-5">
            <Package className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento não ativado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
            {!store?.shopify_connected
              ? "Conecte a Shopify na página de Integrações para ativar o rastreamento."
              : "Ative o rastreamento na página de Integrações para começar a acompanhar seus pedidos."}
          </p>
          <Button asChild className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            <Link href="/portal/integrations">
              Ir para Integrações
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const { stats } = store

  // ─── Main Content ─────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-8">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="text-slate-700 dark:text-slate-200 font-medium">{store.store_name}</span>
            </p>
            {store.last_sync_at && (
              <>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Sincronizado {formatDateTime(store.last_sync_at)}
                </p>
              </>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9 gap-2 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Pedidos</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.orders}</p>
        </div>

        {/* Em Trânsito */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <Truck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Em Trânsito</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
        </div>

        {/* Entregues */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Entregues</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.delivered}</p>
        </div>

        {/* Taxa de Entrega */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Taxa de Entrega</span>
          </div>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{deliveryRate}%</p>
        </div>
      </div>

      {/* ── Orders Section ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Pedidos</h2>
          <div className="flex flex-col sm:flex-row gap-3 flex-1 sm:max-w-lg sm:justify-end">
            <div className="relative flex-1 sm:max-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Buscar pedido, cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[160px] h-9 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 shadow-lg">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="in_transit">Em Trânsito</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
                <SelectItem value="alert">Alerta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Orders count */}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {ordersTotal} pedido{ordersTotal !== 1 ? "s" : ""} encontrado{ordersTotal !== 1 ? "s" : ""}
        </p>

        {/* Table */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          {ordersLoading ? (
            <div className="divide-y divide-slate-50 dark:divide-slate-700/20">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-4 w-16 bg-slate-200 dark:bg-slate-700" />
                  <Skeleton className="h-4 w-28 bg-slate-100 dark:bg-slate-800" />
                  <Skeleton className="h-6 w-20 rounded-full bg-slate-100 dark:bg-slate-800" />
                  <Skeleton className="h-4 w-32 bg-slate-100 dark:bg-slate-800" />
                  <Skeleton className="h-4 w-16 ml-auto bg-slate-100 dark:bg-slate-800" />
                  <Skeleton className="h-4 w-20 bg-slate-100 dark:bg-slate-800" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">Nenhum pedido encontrado</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {stats.orders === 0
                  ? "Os pedidos aparecerão aqui quando a Shopify enviar dados via webhook."
                  : "Tente ajustar os filtros de busca."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/30 bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-5">Pedido</th>
                    <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Cliente</th>
                    <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Status</th>
                    <th className="text-left text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Rastreio</th>
                    <th className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-4">Valor</th>
                    <th className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium py-3 px-5">Data</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const trackingStatus = getTrackingStatus(order.tracking_codes)
                    const StatusIcon = trackingStatus.icon
                    const isExpanded = expandedOrder === order.id

                    return (
                      <tr key={order.id} className="group">
                        <td colSpan={7} className="p-0">
                          {/* Main row */}
                          <div
                            className="flex items-center cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors border-b border-slate-50 dark:border-slate-700/20"
                            onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          >
                            <div className="py-3 px-5 min-w-[100px]">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{order.order_name}</span>
                            </div>
                            <div className="py-3 px-4 min-w-[160px]">
                              <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{order.customer_name || "—"}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{order.customer_email || ""}</p>
                            </div>
                            <div className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${trackingStatus.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {trackingStatus.label}
                              </span>
                            </div>
                            <div className="py-3 px-4">
                              {order.tracking_codes.length > 0 ? (
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                                  {order.tracking_codes[0].tracking_number}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500">Sem rastreio</span>
                              )}
                            </div>
                            <div className="text-right py-3 px-4 ml-auto">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {formatCurrency(order.total_price, order.currency || "BRL")}
                              </span>
                            </div>
                            <div className="text-right py-3 px-5">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {order.order_created_at ? formatDate(order.order_created_at) : "—"}
                              </span>
                            </div>
                            <div className="py-3 pr-4 w-10">
                              {order.tracking_codes.length > 0 && (
                                isExpanded
                                  ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                  : <ChevronDown className="h-4 w-4 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && order.tracking_codes.length > 0 && (
                            <div className="bg-slate-50/70 dark:bg-slate-800/20 px-5 py-4 border-b border-slate-100 dark:border-slate-700/20">
                              <div className="space-y-3">
                                {order.tracking_codes.map((code) => {
                                  const codeStatus = STATUS_LABELS[code.status] || STATUS_LABELS.pending
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
                                        {code.carrier_name && (
                                          <span className="text-xs text-slate-500 dark:text-slate-400">{code.carrier_name}</span>
                                        )}
                                      </div>
                                      {code.last_event && (
                                        <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">{code.last_event}</p>
                                      )}
                                      <div className="flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
                                        {code.last_event_at && (
                                          <span>Última atualização: {new Date(code.last_event_at).toLocaleString("pt-BR")}</span>
                                        )}
                                        {code.estimated_delivery && (
                                          <span>Previsão: {formatDate(code.estimated_delivery)}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700/30">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Widget Section ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/40"></div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Widget de Rastreamento</h2>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700/40"></div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Customization */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                Personalização
              </h3>
            </div>
            <div className="p-5 space-y-5">
              {/* Color */}
              <div className="space-y-2">
                <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Cor do Widget</Label>
                <div className="flex flex-wrap gap-2.5">
                  {WIDGET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setWidgetColor(c.value)}
                      className={`w-9 h-9 rounded-lg ${c.tw} transition-all ${
                        widgetColor === c.value
                          ? "ring-2 ring-offset-2 ring-primary ring-offset-white dark:ring-offset-[#151922] scale-110"
                          : "hover:scale-105"
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
                {/* Custom color input */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <Input
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    className="h-8 w-24 text-xs font-mono bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200"
                    maxLength={7}
                  />
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  Idioma
                </Label>
                <Select value={widgetLanguage} onValueChange={setWidgetLanguage}>
                  <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleSaveWidget}
                disabled={savingWidget}
                size="sm"
                className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
              >
                {savingWidget ? "Salvando..." : "Salvar Configuração"}
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Preview
              </h3>
            </div>
            <div className="p-5 flex items-center justify-center min-h-[260px]">
              <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-lg p-8 w-full flex items-center justify-center border border-slate-200/50 dark:border-slate-700/30">
                <div className="text-center space-y-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-lg transition-transform hover:scale-110 cursor-pointer"
                    style={{ backgroundColor: widgetColor }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{widgetLabel}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Canto inferior direito da loja</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Installation Code */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Código
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                {copied ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Copiado!</>
                ) : (
                  <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</>
                )}
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <pre className="bg-slate-900 dark:bg-[#0D1117] rounded-lg p-3 overflow-x-auto">
                <code className="text-green-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {scriptCode}
                </code>
              </pre>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Como instalar:</p>
                <ol className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Copie o código acima</li>
                  <li>No Shopify: <strong>Themes → Edit Code</strong></li>
                  <li>Abra <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">theme.liquid</code></li>
                  <li>Cole antes de <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">&lt;/body&gt;</code></li>
                  <li>Salve o arquivo</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
