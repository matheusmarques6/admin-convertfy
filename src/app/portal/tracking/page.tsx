"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Code2,
  ArrowRight,
  Search,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Palette,
  Globe,
  Loader2,
  ExternalLink,
  FileCode,
  Eye,
  EyeOff,
  ListOrdered,
  Settings2,
  Download,
  Info,
  KeyRound,
} from "lucide-react"
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

// ─── Types ──────────────────────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400", icon: Clock },
  in_transit: { label: "Em Trânsito", color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400", icon: Truck },
  delivered: { label: "Entregue", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400", icon: CheckCircle2 },
  pick_up: { label: "Pronto p/ Retirada", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400", icon: Package },
  expired: { label: "Expirado", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
  alert: { label: "Alerta", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: AlertCircle },
  undelivered: { label: "Não Entregue", color: "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400", icon: XCircle },
}

const PRESET_COLORS = [
  { value: "#3b82f6", label: "Azul", ring: "ring-blue-400" },
  { value: "#0ea5e9", label: "Celeste", ring: "ring-sky-400" },
  { value: "#10b981", label: "Verde", ring: "ring-emerald-400" },
  { value: "#8b5cf6", label: "Roxo", ring: "ring-violet-400" },
  { value: "#f59e0b", label: "Amarelo", ring: "ring-amber-400" },
  { value: "#ef4444", label: "Vermelho", ring: "ring-red-400" },
  { value: "#ec4899", label: "Rosa", ring: "ring-pink-400" },
  { value: "#000000", label: "Preto", ring: "ring-gray-500" },
]

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
]

const PREVIEW_TITLES: Record<string, { title: string; subtitle: string; btn: string; byOrder: string; byTracking: string; email: string; order: string; tracking: string; or: string }> = {
  "pt-BR": { title: "Rastreie seu pedido", subtitle: "Acompanhe o status da sua entrega em tempo real", btn: "Rastrear", byOrder: "Buscar por pedido", byTracking: "Buscar por codigo", email: "E-mail", order: "Numero do pedido", tracking: "Codigo de rastreamento", or: "ou" },
  en: { title: "Track your order", subtitle: "Follow your delivery status in real time", btn: "Track", byOrder: "Search by order", byTracking: "Search by tracking code", email: "Email", order: "Order number", tracking: "Tracking code", or: "or" },
  es: { title: "Rastrea tu pedido", subtitle: "Sigue el estado de tu envio en tiempo real", btn: "Rastrear", byOrder: "Buscar por pedido", byTracking: "Buscar por codigo", email: "E-mail", order: "Numero del pedido", tracking: "Codigo de seguimiento", or: "o" },
  fr: { title: "Suivez votre commande", subtitle: "Suivez le statut de votre livraison en temps reel", btn: "Suivre", byOrder: "Rechercher par commande", byTracking: "Rechercher par code", email: "E-mail", order: "Numero de commande", tracking: "Code de suivi", or: "ou" },
  de: { title: "Verfolgen Sie Ihre Bestellung", subtitle: "Verfolgen Sie den Status Ihrer Lieferung in Echtzeit", btn: "Verfolgen", byOrder: "Nach Bestellung suchen", byTracking: "Nach Sendungsnummer suchen", email: "E-mail", order: "Bestellnummer", tracking: "Sendungsnummer", or: "oder" },
  it: { title: "Traccia il tuo ordine", subtitle: "Segui lo stato della tua consegna in tempo reale", btn: "Traccia", byOrder: "Cerca per ordine", byTracking: "Cerca per codice", email: "E-mail", order: "Numero ordine", tracking: "Codice di tracciamento", or: "o" },
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getTrackingStatus(codes: TrackingCode[]) {
  if (!codes || codes.length === 0) return STATUS_LABELS.pending
  return STATUS_LABELS[codes[0].status] || STATUS_LABELS.pending
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PortalTrackingPage() {
  // Overview state
  const [store, setStore] = useState<TrackingStoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Orders state
  const [orders, setOrders] = useState<TrackingOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const limit = 20

  // Customize state
  const [color, setColor] = useState("#3b82f6")
  const [customColor, setCustomColor] = useState("")
  const [language, setLanguage] = useState("pt-BR")
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState("overview")

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchStoreData = useCallback(async (showRefresh = false) => {
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
      const storeData = stores.length > 0 ? stores[0] : null
      setStore(storeData)

      // Load saved config
      if (storeData?.widget_config) {
        const savedColor = storeData.widget_config.primaryColor || "#3b82f6"
        setColor(savedColor)
        if (!PRESET_COLORS.some(c => c.value === savedColor)) {
          setCustomColor(savedColor)
        }
        setLanguage(storeData.widget_config.language || "pt-BR")
      }

      setError(null)
    } catch {
      setError("Não foi possível carregar os dados de rastreamento")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (storeId) params.set("store_id", storeId)
      if (search) params.set("search", search)
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await fetch(`/api/portal/tracking/orders?${params}`)
      if (!response.ok) throw new Error("Erro ao carregar pedidos")
      const data = await response.json()
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      setOrdersError(null)
    } catch {
      setOrdersError("Não foi possível carregar os pedidos")
    } finally {
      setOrdersLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { fetchStoreData() }, [fetchStoreData])

  // Fetch orders when tab changes to "orders" or filters change
  useEffect(() => {
    if (activeTab === "orders" && store?.tracking_active) {
      fetchOrders()
    }
  }, [activeTab, fetchOrders, store?.tracking_active])

  // ─── Customize Handlers ─────────────────────────────────────────────────────

  const activeColor = customColor || color

  const scriptCode = useMemo(() => {
    if (!store?.client_store_id) return ""
    const origin = typeof window !== "undefined" ? window.location.origin : "https://admin.convertfy.com.br"
    return `<!-- Convertfy - Rastreamento de Pedidos -->
<div id="convertfy-tracking"></div>
<script>
(function(){
  var s=document.createElement('script');
  s.src='${origin}/api/script/widget.js?store=${store.client_store_id}';
  s.async=true;
  s.dataset.color='${activeColor}';
  s.dataset.lang='${language}';
  s.dataset.container='convertfy-tracking';
  document.head.appendChild(s);
})();
</script>`
  }, [store?.client_store_id, activeColor, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode)
    setCopied(true)
    toast({ title: "Código copiado!" })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveConfig = async () => {
    if (!store?.client_store_id) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        client_store_id: store.client_store_id,
        widget_config: { primaryColor: activeColor, language },
      }
      // Only send API key if user entered a new one
      if (apiKey.trim()) {
        payload.seventeen_track_api_key = apiKey.trim()
      }
      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      toast({ title: "Configuração salva com sucesso!" })
      // Clear the input and refresh to update has_17track_key status
      if (apiKey.trim()) {
        setApiKey("")
        setShowApiKey(false)
        fetchStoreData()
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configuração" })
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / limit)
  const preview = PREVIEW_TITLES[language] || PREVIEW_TITLES["pt-BR"]

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-200 dark:bg-slate-700" />
        <Skeleton className="h-10 w-96 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
        <Skeleton className="h-96 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
      </div>
    )
  }

  // ─── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 p-8 text-center max-w-sm shadow-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{error}</p>
          <Button onClick={() => fetchStoreData()} size="sm" className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  // ─── Not Active State ───────────────────────────────────────────────────────

  if (!store || !store.tracking_active) {
    return (
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Package className="h-7 w-7 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Rastreamento não ativado</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
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

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rastreamento</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie o rastreamento de pedidos da loja <strong className="text-slate-700 dark:text-slate-200">{store.store_name}</strong>
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchStoreData(true)}
          disabled={refreshing}
          className="h-9 w-9 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white dark:bg-[#151922] border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 rounded-lg p-1 h-auto w-full sm:w-auto inline-flex">
          <TabsTrigger
            value="overview"
            className="gap-1.5 text-[13px] px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md"
          >
            <Eye className="h-3.5 w-3.5" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="gap-1.5 text-[13px] px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger
            value="customize"
            className="gap-1.5 text-[13px] px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Personalizar
          </TabsTrigger>
          <TabsTrigger
            value="install"
            className="gap-1.5 text-[13px] px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md"
          >
            <Download className="h-3.5 w-3.5" />
            Instalação
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: Visão Geral
           ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-5 space-y-6">
          {/* How it works */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                Como funciona
              </h3>
            </div>
            <div className="p-6">
              <div className="grid sm:grid-cols-3 gap-6">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600">1</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Personalize</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Na aba <strong>Personalizar</strong>, escolha a cor e o idioma que combinam com sua loja.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600">2</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Instale o Script</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Na aba <strong>Instalação</strong>, copie o código e cole em uma página HTML da sua loja Shopify.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-600">3</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Clientes rastreiam</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Seus clientes acessam a página e consultam o rastreio em tempo real pela 17track.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <Package className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total de Pedidos</span>
              </div>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{stats.orders}</p>
            </div>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                  <Truck className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Em Trânsito</span>
              </div>
              <p className="text-xl font-bold text-amber-600">{stats.pending}</p>
            </div>
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Entregues</span>
              </div>
              <p className="text-xl font-bold text-emerald-600">{stats.delivered}</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setActiveTab("customize")}
              className="flex items-center gap-4 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md transition-shadow text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Palette className="h-5 w-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Personalizar Script</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Cores, idioma e aparência</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
            </button>

            <button
              onClick={() => setActiveTab("install")}
              className="flex items-center gap-4 bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-5 hover:shadow-md transition-shadow text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                <Code2 className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Instalar na Loja</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Copiar código e instruções</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
            </button>
          </div>

          {/* Status info */}
          {store.last_sync_at && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Última sincronização: {new Date(store.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {stats.orders === 0 && (
            <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-8 text-center">
              <Clock className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Aguardando pedidos</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Os pedidos aparecerão aqui automaticamente quando a Shopify enviar os dados via webhook.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: Pedidos
           ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="orders" className="mt-5 space-y-5">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Buscar por pedido, cliente ou email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10 h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px] h-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 rounded-lg shadow-sm dark:shadow-slate-900/20">
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

          {/* Orders count */}
          {!ordersLoading && !ordersError && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {total} pedido{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
            </p>
          )}

          {/* Orders Table */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : ordersError ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{ordersError}</p>
                <Button onClick={fetchOrders} size="sm" className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">Nenhum pedido encontrado</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pedidos aparecerão aqui quando importados via Shopify</p>
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
                        <>
                          <tr
                            key={order.id}
                            className="border-b border-slate-50 dark:border-slate-700/20 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                            onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          >
                            <td className="py-3 px-5">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{order.order_name}</span>
                            </td>
                            <td className="py-3 px-4">
                              <div>
                                <p className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{order.customer_name || "—"}</p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{order.customer_email || ""}</p>
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
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                                  {order.tracking_codes[0].tracking_number}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-slate-500">Sem rastreio</span>
                              )}
                            </td>
                            <td className="text-right py-3 px-4">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: order.currency || "BRL" }).format(order.total_price)}
                              </span>
                            </td>
                            <td className="text-right py-3 px-5">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {order.order_created_at ? new Date(order.order_created_at).toLocaleDateString("pt-BR") : "—"}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {order.tracking_codes.length > 0 && (
                                isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                              )}
                            </td>
                          </tr>

                          {/* Expanded tracking details */}
                          {isExpanded && order.tracking_codes.length > 0 && (
                            <tr key={`${order.id}-detail`}>
                              <td colSpan={7} className="bg-slate-50/70 dark:bg-slate-800/20 px-5 py-4 border-b border-slate-100 dark:border-slate-700/20">
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
                                            <span>Previsão: {new Date(code.estimated_delivery).toLocaleDateString("pt-BR")}</span>
                                          )}
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
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: Personalizar
           ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="customize" className="mt-5 space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Settings Panel */}
            <div className="lg:col-span-2 space-y-5">
              {/* Colors */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Cor do Script
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-4 gap-2.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => { setColor(c.value); setCustomColor("") }}
                        className={`group flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg transition-all ${
                          activeColor === c.value && !customColor
                            ? "bg-slate-50 dark:bg-white/[0.06]"
                            : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                        }`}
                        title={c.label}
                      >
                        <div
                          className={`w-8 h-8 rounded-full transition-all shadow-sm ${
                            activeColor === c.value && !customColor
                              ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#151922] " + c.ring + " scale-110"
                              : "group-hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.value }}
                        />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-slate-500 dark:text-slate-400">Cor personalizada</Label>
                    <div className="flex gap-2 items-center">
                      <div
                        className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700/40 flex-shrink-0 cursor-pointer relative overflow-hidden"
                        style={{ backgroundColor: activeColor }}
                      >
                        <input
                          type="color"
                          value={activeColor}
                          onChange={(e) => { setCustomColor(e.target.value); setColor(e.target.value) }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <Input
                        placeholder="#3b82f6"
                        value={customColor}
                        onChange={(e) => {
                          const v = e.target.value
                          setCustomColor(v)
                          if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v)
                        }}
                        className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Language */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Idioma
                  </h3>
                </div>
                <div className="p-5">
                  <Label className="text-[12px] text-slate-500 dark:text-slate-400 mb-2 block">Idioma exibido no script da loja</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200">
                      <Globe className="h-4 w-4 mr-2 text-slate-400" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40">
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 17track API Key */}
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Chave API 17track
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[12px] text-slate-500 dark:text-slate-400">
                      {store.has_17track_key ? "Chave configurada — insira uma nova para substituir" : "Insira sua chave API do 17track"}
                    </Label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder={store.has_17track_key ? "••••••••••••••••" : "Cole sua API key aqui"}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="h-10 pr-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {store.has_17track_key && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Chave API configurada</span>
                    </div>
                  )}
                  {!store.has_17track_key && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                      Sem a chave API, o rastreamento em tempo real não funcionará. Obtenha sua chave em{" "}
                      <a href="https://api.17track.net" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        api.17track.net
                      </a>
                    </p>
                  )}
                </div>
              </div>

              {/* Save */}
              <Button
                onClick={handleSaveConfig}
                disabled={saving}
                className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm h-11"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configuração
              </Button>
            </div>

            {/* Right: Preview */}
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Preview
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {LANGUAGES.find(l => l.value === language)?.label || "Português"}
                  </span>
                </div>
                <div className="p-6">
                  <div className="bg-slate-50 dark:bg-[#1A1F2E] rounded-xl border border-slate-200/50 dark:border-slate-700/30 p-5">
                    {/* Title */}
                    <h4 className="text-center text-base font-bold text-slate-800 dark:text-slate-100 mb-0.5">
                      {preview.title}
                    </h4>
                    <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mb-5">
                      {preview.subtitle}
                    </p>
                    {/* Two-column cards */}
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-stretch">
                      {/* Left: Search by order */}
                      <div className="bg-white dark:bg-[#151922] rounded-lg border border-slate-200/80 dark:border-slate-700/40 p-3.5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: activeColor + "14" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                            </svg>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{preview.byOrder}</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">{preview.email}</span>
                            <div className="h-8 bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200 dark:border-slate-600/40 rounded-lg" />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">{preview.order}</span>
                            <div className="h-8 bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200 dark:border-slate-600/40 rounded-lg" />
                          </div>
                          <div className="h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: activeColor }}>
                            <span className="text-white text-[11px] font-semibold">{preview.btn}</span>
                          </div>
                        </div>
                      </div>
                      {/* OR separator */}
                      <div className="flex items-center justify-center px-3">
                        <div className="w-7 h-7 rounded-full bg-white dark:bg-[#151922] border border-slate-200 dark:border-slate-600/40 flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-slate-400">{preview.or}</span>
                        </div>
                      </div>
                      {/* Right: Search by tracking */}
                      <div className="bg-white dark:bg-[#151922] rounded-lg border border-slate-200/80 dark:border-slate-700/40 p-3.5 flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: activeColor + "14" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{preview.byTracking}</span>
                        </div>
                        <div className="space-y-2 flex-1 flex flex-col">
                          <div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">{preview.tracking}</span>
                            <div className="h-8 bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200 dark:border-slate-600/40 rounded-lg" />
                          </div>
                          <div className="mt-auto h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: activeColor }}>
                            <span className="text-white text-[11px] font-semibold">{preview.btn}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Powered by */}
                    <p className="text-center text-[9px] text-slate-300 dark:text-slate-600 mt-4">Powered by Convertfy</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB: Instalação
           ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="install" className="mt-5 space-y-6">
          {/* Script Code */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileCode className="h-4 w-4 text-cyan-600" />
                Código de Instalação
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copiar código
                  </>
                )}
              </Button>
            </div>
            <div className="p-5">
              <pre className="bg-slate-900 dark:bg-[#0D1117] rounded-lg p-4 overflow-x-auto text-sm">
                <code className="text-green-400 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                  {scriptCode}
                </code>
              </pre>
            </div>
          </div>

          {/* Step by step */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
                Como instalar na sua loja
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-4">
                {[
                  { step: 1, title: "Copie o código", text: "Clique no botão \"Copiar código\" acima para copiar o script para a área de transferência." },
                  { step: 2, title: "Crie uma página no Shopify", text: "No painel da Shopify, vá em Online Store > Pages > Add page. Dê o nome de \"Rastreamento\" ou \"Rastrear Pedido\"." },
                  { step: 3, title: "Cole o código HTML", text: "No editor da página, clique no botão \"Show HTML\" (ícone <>) e cole o código copiado." },
                  { step: 4, title: "Salve e publique", text: "Salve a página e adicione-a ao menu de navegação da sua loja para os clientes encontrarem facilmente." },
                ].map(({ step, title, text }) => (
                  <div key={step} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-primary">{step}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-0.5">{title}</h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-500/5 rounded-lg border border-blue-100 dark:border-blue-500/10 p-4 mt-4">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <strong>Dica:</strong> O script renderiza automaticamente o formulário de rastreamento dentro da página.
                  Seus clientes poderão digitar o código de rastreio e acompanhar a entrega em tempo real.
                </p>
              </div>

              <div className="bg-amber-50/50 dark:bg-amber-500/5 rounded-lg border border-amber-100 dark:border-amber-500/10 p-4">
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  <strong>Importante:</strong> Se você alterar a cor ou o idioma na aba <strong>Personalizar</strong>, será necessário copiar o código novamente e atualizar na sua loja.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
