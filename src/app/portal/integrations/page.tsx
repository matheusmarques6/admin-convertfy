"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  Mail,
  Package,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Settings,
  Key,
  ArrowRight,
  Truck,
  Globe,
  Save,
  Zap,
} from "lucide-react"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"

interface IntegrationData {
  shopify: { connected: boolean; domain: string; connected_at: string | null }
  klaviyo: { connected: boolean; has_public_key: boolean; connected_at: string | null }
  tracking: {
    active: boolean
    tracking_store_id: string | null
    has_17track_key: boolean
    carrier_keys: Record<string, boolean>
    widget_config: Record<string, unknown> | null
    last_sync_at: string | null
  }
}

interface CarrierConfig {
  id: string
  name: string
  description: string
  icon: string
  color: string
  keyPlaceholder: string
  helpText: string
  helpUrl?: string
  isFree?: boolean
  covers: string[]
}

const CARRIERS: CarrierConfig[] = [
  {
    id: "seventeen_track",
    name: "17track",
    description: "Agregador universal",
    icon: "17",
    color: "bg-orange-500/10 text-orange-500",
    keyPlaceholder: "Sua API Key do 17track",
    helpText: "17track.net/apiuser",
    helpUrl: "https://www.17track.net/en/apiuser",
    covers: ["Todos os 2800+ transportadoras"],
  },
  {
    id: "trackingmore",
    name: "TrackingMore",
    description: "Alternativa econômica",
    icon: "TM",
    color: "bg-blue-500/10 text-blue-500",
    keyPlaceholder: "Sua API Key do TrackingMore",
    helpText: "trackingmore.com/docs",
    helpUrl: "https://www.trackingmore.com/docs/trackingmore/d5ac362fc3cda-api-quick-start-guide",
    covers: ["Wanb Express", "Yanwen", "SDH Express", "China Post", "PostNL", "+1500"],
  },
  {
    id: "cainiao",
    name: "Cainiao",
    description: "Transportadoras chinesas (gratuito)",
    icon: "CN",
    color: "bg-red-500/10 text-red-500",
    keyPlaceholder: "",
    helpText: "Rastreamento gratuito via Cainiao Global",
    isFree: true,
    covers: ["Wanb Express", "Yanwen", "SDH Express", "China Post", "AliExpress"],
  },
  {
    id: "postnl",
    name: "PostNL",
    description: "Correios Holanda",
    icon: "NL",
    color: "bg-amber-500/10 text-amber-500",
    keyPlaceholder: "Sua API Key do PostNL",
    helpText: "developer.postnl.nl",
    helpUrl: "https://developer.postnl.nl",
    covers: ["PostNL International", "PostNL Domestic"],
  },
]

interface StoreInfo {
  id: string
  store_name: string
  platform: string
  store_url: string
  shopify_store_domain: string
}

type IntegrationType = "shopify" | "klaviyo" | "tracking"

export default function PortalIntegrationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationData | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<IntegrationType | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Form fields
  const [shopifyDomain, setShopifyDomain] = useState("")
  const [shopifyToken, setShopifyToken] = useState("")
  const [klaviyoKey, setKlaviyoKey] = useState("")
  const [klaviyoPublicKey, setKlaviyoPublicKey] = useState("")
  const [seventeenTrackKey, setSeventeenTrackKey] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Carrier dialog state
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false)
  const [activeCarrier, setActiveCarrier] = useState<CarrierConfig | null>(null)
  const [carrierKeyInput, setCarrierKeyInput] = useState("")
  const [savingCarrier, setSavingCarrier] = useState(false)

  // Carrier test state
  const [testingCarrier, setTestingCarrier] = useState<string | null>(null)
  const [carrierTestResult, setCarrierTestResult] = useState<{
    success: boolean
    message: string
    details?: {
      tracking_number?: string
      carrier_detected?: string
      status?: string
      events_count?: number
      last_event?: string
      response_time_ms?: number
    }
  } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      if (!storeId) {
        setError("Nenhuma loja selecionada. Selecione uma loja no menu lateral.")
        return
      }

      const response = await fetch(`/api/portal/integrations?store_id=${storeId}`)
      if (!response.ok) throw new Error("Erro ao carregar integrações")

      const data = await response.json()
      setStore(data.store)
      setIntegrations(data.integrations)
      setError(null)
    } catch {
      setError("Não foi possível carregar as integrações")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openDialog(type: IntegrationType) {
    setDialogType(type)
    setShowPassword(false)
    setTestResult(null)
    if (type === "shopify") {
      setShopifyDomain(store?.shopify_store_domain || "")
      setShopifyToken("")
    } else if (type === "klaviyo") {
      setKlaviyoKey("")
      setKlaviyoPublicKey("")
    } else if (type === "tracking") {
      setSeventeenTrackKey("")
    }
    setDialogOpen(true)
  }

  async function handleTestConnection() {
    if (!dialogType) return
    setTesting(true)
    setTestResult(null)
    try {
      if (dialogType === "shopify") {
        if (!shopifyDomain || !shopifyToken) {
          toast({ variant: "destructive", title: "Preencha o domínio e o Access Token" })
          return
        }
        const res = await fetch("/api/integrations/shopify/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_domain: shopifyDomain, access_token: shopifyToken }),
        })
        const data = await res.json()
        setTestResult(data.success
          ? { success: true, message: data.shop?.name ? `Conectado: ${data.shop.name}` : "Conexão OK!" }
          : { success: false, message: data.error || "Falha na conexão" })
      } else if (dialogType === "klaviyo") {
        if (!klaviyoKey) {
          toast({ variant: "destructive", title: "Preencha a Private API Key" })
          return
        }
        const res = await fetch("/api/integrations/klaviyo/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: klaviyoKey }),
        })
        const data = await res.json()
        setTestResult(data.success
          ? { success: true, message: data.account ? `Conectado: ${data.account}` : "Conexão OK!" }
          : { success: false, message: data.error || "Falha na autenticação" })
      } else if (dialogType === "tracking") {
        // Use typed key if available, otherwise let backend fetch from DB
        let storeId: string | null = null
        try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

        const res = await fetch("/api/integrations/tracking/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrier_id: "seventeen_track",
            api_key: seventeenTrackKey || undefined,
            store_id: storeId,
          }),
        })
        const data = await res.json()
        setTestResult(data.success
          ? { success: true, message: data.message || "Conexão OK!" }
          : { success: false, message: data.message || data.error || "Falha na autenticação" })
      }
    } catch {
      setTestResult({ success: false, message: "Erro ao testar conexão" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!dialogType || !store) return

    // Validate before setting saving state
    if (dialogType === "shopify" && !shopifyToken) {
      toast({ variant: "destructive", title: "Preencha o Access Token" })
      return
    }
    if (dialogType === "klaviyo" && !klaviyoKey) {
      toast({ variant: "destructive", title: "Preencha a Private API Key" })
      return
    }
    if (dialogType === "tracking" && !seventeenTrackKey) {
      toast({ variant: "destructive", title: "Preencha a API Key do 17track" })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { store_id: store.id, integration_type: dialogType }

      if (dialogType === "shopify") {
        if (shopifyDomain) payload.shopify_store_domain = shopifyDomain
        payload.shopify_access_token = shopifyToken
      } else if (dialogType === "klaviyo") {
        payload.klaviyo_private_key = klaviyoKey
        if (klaviyoPublicKey) payload.klaviyo_public_key = klaviyoPublicKey
      } else if (dialogType === "tracking") {
        payload.seventeen_track_api_key = seventeenTrackKey
        payload.activate_tracking = true
      }

      const res = await fetch("/api/portal/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")

      toast({ title: "Credenciais salvas com sucesso!" })
      setDialogOpen(false)
      fetchData()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err instanceof Error ? err.message : "Tente novamente" })
    } finally {
      setSaving(false)
    }
  }

  function openCarrierDialog(carrier: CarrierConfig) {
    // For 17track, use the existing tracking dialog
    if (carrier.id === "seventeen_track") {
      openDialog("tracking")
      return
    }
    setActiveCarrier(carrier)
    setCarrierKeyInput("")
    setShowPassword(false)
    setCarrierTestResult(null)
    setCarrierDialogOpen(true)
  }

  async function handleTestCarrier(carrierId?: string, apiKey?: string) {
    const testId = carrierId || activeCarrier?.id
    if (!testId) return

    setTestingCarrier(testId)
    setCarrierTestResult(null)

    try {
      // Send store_id so the backend can fetch saved keys from DB
      let storeId: string | null = null
      try { storeId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }

      const res = await fetch("/api/integrations/tracking/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier_id: testId,
          store_id: storeId,
          // Only send api_key if user typed one in the dialog (new key to test)
          api_key: apiKey || (testId !== "cainiao" && carrierKeyInput ? carrierKeyInput : undefined),
        }),
      })
      const data = await res.json()
      setCarrierTestResult({
        success: data.success,
        message: data.message || data.error || "Resultado desconhecido",
        details: data.details,
      })
    } catch {
      setCarrierTestResult({
        success: false,
        message: "Erro de rede ao testar conexão",
      })
    } finally {
      setTestingCarrier(null)
    }
  }

  async function handleSaveCarrierKey() {
    if (!activeCarrier || !store) return

    // For Cainiao (free), toggle it
    if (activeCarrier.isFree) {
      setSavingCarrier(true)
      try {
        const res = await fetch("/api/portal/integrations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: store.id,
            integration_type: "tracking",
            activate_tracking: true,
            carrier_api_keys: { [activeCarrier.id]: true },
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Erro ao salvar")
        toast({ title: `${activeCarrier.name} ativado com sucesso!` })
        setCarrierDialogOpen(false)
        fetchData()
      } catch (err) {
        toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Tente novamente" })
      } finally {
        setSavingCarrier(false)
      }
      return
    }

    if (!carrierKeyInput.trim()) {
      toast({ variant: "destructive", title: `Preencha a API Key do ${activeCarrier.name}` })
      return
    }

    setSavingCarrier(true)
    try {
      const res = await fetch("/api/portal/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: store.id,
          integration_type: "tracking",
          activate_tracking: true,
          carrier_api_keys: { [activeCarrier.id]: carrierKeyInput },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")
      toast({ title: `API Key do ${activeCarrier.name} salva com sucesso!` })
      setCarrierDialogOpen(false)
      fetchData()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err instanceof Error ? err.message : "Tente novamente" })
    } finally {
      setSavingCarrier(false)
    }
  }

  async function handleActivateTracking() {
    if (!store) return
    setSaving(true)
    try {
      const res = await fetch("/api/portal/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: store.id, integration_type: "tracking", activate_tracking: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao ativar")
      toast({ title: "Rastreamento ativado!" })
      fetchData()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao ativar rastreamento", description: err instanceof Error ? err.message : "Tente novamente" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-4">{error}</p>
        <Button onClick={fetchData} className="bg-primary hover:bg-primary/85 text-white shadow-sm">Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Integrações</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Gerencie as conexões da loja <strong className="text-slate-700 dark:text-slate-200">{store?.store_name}</strong>
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Shopify Card */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#96BF48]/10 flex items-center justify-center">
                  <ShoppingBag className="h-6 w-6 text-[#96BF48]" />
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Shopify</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Loja e-commerce</CardDescription>
                </div>
              </div>
              {integrations?.shopify.connected ? (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30">
                  Não conectado
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Domínio</span>
                <span className="text-slate-700 dark:text-slate-200 text-xs font-mono truncate max-w-[180px]">
                  {integrations?.shopify.domain || "—"}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => openDialog("shopify")}
              className="w-full border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              <Settings className="h-4 w-4 mr-2" />
              {integrations?.shopify.connected ? "Editar" : "Conectar"}
            </Button>
          </CardContent>
        </div>

        {/* Klaviyo Card */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Klaviyo</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">Email marketing</CardDescription>
                </div>
              </div>
              {integrations?.klaviyo.connected ? (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30">
                  Não conectado
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Private Key</span>
                {integrations?.klaviyo.connected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Configurada
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Public Key</span>
                {integrations?.klaviyo.has_public_key ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Configurada
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => openDialog("klaviyo")}
              className="w-full border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              <Settings className="h-4 w-4 mr-2" />
              {integrations?.klaviyo.connected ? "Editar" : "Conectar"}
            </Button>
          </CardContent>
        </div>

        {/* Rastreamento Card */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-800 dark:text-slate-100">Rastreamento</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">17track</CardDescription>
                </div>
              </div>
              {integrations?.tracking.active ? (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                  Ativo
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30">
                  Inativo
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Chave API</span>
                {integrations?.tracking.has_17track_key ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Configurada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" /> Não configurada
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => openDialog("tracking")}
                className="w-full border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                <Settings className="h-4 w-4 mr-2" />
                {integrations?.tracking.has_17track_key ? "Editar Chave API" : "Configurar API Key"}
              </Button>
              {integrations?.tracking.active ? (
                <Button asChild className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm">
                  <Link href="/portal/tracking">
                    Ver Rastreamento
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              ) : integrations?.shopify.connected ? (
                <Button
                  onClick={handleActivateTracking}
                  disabled={saving}
                  className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Ativar Rastreamento
                </Button>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
                  Conecte a Shopify para ativar o rastreamento
                </p>
              )}
            </div>
          </CardContent>
        </div>
      </div>

      {/* Transportadoras Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Truck className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Transportadoras</h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Configure as APIs de rastreamento. O sistema tenta primeiro as transportadoras diretas (gratuitas), depois os agregadores (17track / TrackingMore).
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {CARRIERS.map((carrier) => {
            const isConfigured = carrier.id === "seventeen_track"
              ? integrations?.tracking.has_17track_key
              : carrier.isFree
              ? true
              : integrations?.tracking.carrier_keys?.[carrier.id]

            return (
              <div
                key={carrier.id}
                className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${carrier.color} flex items-center justify-center text-sm font-bold`}>
                      {carrier.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{carrier.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{carrier.description}</p>
                    </div>
                  </div>
                  {isConfigured ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-1" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-slate-300 dark:text-slate-600 flex-shrink-0 mt-1" />
                  )}
                </div>

                <div className="mb-3">
                  <div className="flex flex-wrap gap-1">
                    {carrier.covers.slice(0, 3).map((name) => (
                      <span key={name} className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {name}
                      </span>
                    ))}
                    {carrier.covers.length > 3 && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        +{carrier.covers.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openCarrierDialog(carrier)}
                    className="flex-1 text-xs border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                  >
                    {carrier.isFree ? (
                      <>
                        <Globe className="h-3 w-3 mr-1.5" />
                        {isConfigured ? "Ativo" : "Ativar"}
                      </>
                    ) : (
                      <>
                        <Key className="h-3 w-3 mr-1.5" />
                        {isConfigured ? "Editar" : "Config."}
                      </>
                    )}
                  </Button>
                  {(carrier.isFree || isConfigured) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestCarrier(carrier.id)}
                      disabled={testingCarrier === carrier.id}
                      className="text-xs border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                    >
                      {testingCarrier === carrier.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
                {testingCarrier === carrier.id && (
                  <p className="text-[10px] text-slate-400 mt-1 text-center">Testando...</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        As credenciais são criptografadas e sincronizadas com o painel admin.
      </p>

      {/* Carrier Key Dialog */}
      <Dialog open={carrierDialogOpen} onOpenChange={setCarrierDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              Configurar {activeCarrier?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {activeCarrier?.isFree
                ? `${activeCarrier.name} oferece rastreamento gratuito para transportadoras chinesas.`
                : `Configure a API Key do ${activeCarrier?.name} para rastreamento direto.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {activeCarrier?.isFree ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Nenhuma chave necessária - rastreamento gratuito
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  O {activeCarrier.name} será usado automaticamente para rastrear pacotes de transportadoras chinesas antes de consultar o 17track ou TrackingMore, economizando chamadas de API.
                </p>
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Transportadoras cobertas:</p>
                  <div className="flex flex-wrap gap-1">
                    {activeCarrier.covers.map((name) => (
                      <span key={name} className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  {activeCarrier?.name} API Key
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={activeCarrier?.keyPlaceholder}
                    value={carrierKeyInput}
                    onChange={(e) => setCarrierKeyInput(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {activeCarrier?.helpUrl ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acesse{" "}
                    <a href={activeCarrier.helpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      {activeCarrier.helpText}
                    </a>
                    {" "}para obter sua API Key
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{activeCarrier?.helpText}</p>
                )}
                {integrations?.tracking.carrier_keys?.[activeCarrier?.id || ""] && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    API Key já configurada. Preencha acima para substituir.
                  </div>
                )}
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Transportadoras cobertas:</p>
                  <div className="flex flex-wrap gap-1">
                    {activeCarrier?.covers.map((name) => (
                      <span key={name} className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Result in Dialog */}
          {carrierTestResult && (
            <div className={`rounded-lg border p-3 ${carrierTestResult.success
              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
              : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
            }`}>
              <div className={`flex items-center gap-2 text-sm font-medium ${carrierTestResult.success ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {carrierTestResult.success ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                {carrierTestResult.message}
              </div>
              {carrierTestResult.details && (
                <div className="mt-2 space-y-1">
                  {carrierTestResult.details.carrier_detected && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Transportadora: <span className="font-medium text-slate-700 dark:text-slate-300">{carrierTestResult.details.carrier_detected}</span></p>
                  )}
                  {carrierTestResult.details.status && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Status: <span className="font-medium text-slate-700 dark:text-slate-300">{carrierTestResult.details.status}</span></p>
                  )}
                  {carrierTestResult.details.events_count !== undefined && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Eventos: <span className="font-medium text-slate-700 dark:text-slate-300">{carrierTestResult.details.events_count}</span></p>
                  )}
                  {carrierTestResult.details.last_event && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Último evento: <span className="font-medium text-slate-700 dark:text-slate-300">{carrierTestResult.details.last_event}</span></p>
                  )}
                  {carrierTestResult.details.response_time_ms !== undefined && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tempo de resposta: <span className="font-medium text-slate-700 dark:text-slate-300">{carrierTestResult.details.response_time_ms}ms</span></p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCarrierDialogOpen(false)} className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => handleTestCarrier()}
              disabled={testingCarrier !== null || savingCarrier}
              className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              {testingCarrier ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Testar Conexão
            </Button>
            <Button
              onClick={handleSaveCarrierKey}
              disabled={savingCarrier}
              className="bg-primary hover:bg-primary/85 text-white shadow-sm"
            >
              {savingCarrier && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              {activeCarrier?.isFree ? "Ativar" : "Salvar API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {dialogType === "shopify" ? "Configurar Shopify" : dialogType === "klaviyo" ? "Configurar Klaviyo" : "Configurar 17track"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {store?.store_name} &mdash; {dialogType === "shopify"
                ? "Credenciais da API Admin da Shopify"
                : dialogType === "klaviyo"
                ? "Chaves de acesso da API do Klaviyo"
                : "Chave de acesso da API do 17track para rastreamento"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {dialogType === "shopify" && (
              <>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Domínio da Loja</Label>
                  <Input
                    placeholder="minhaloja.myshopify.com"
                    value={shopifyDomain}
                    onChange={(e) => setShopifyDomain(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Domínio .myshopify.com da sua loja
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Admin API Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="shpat_xxxxxxxxxxxxxxxx"
                      value={shopifyToken}
                      onChange={(e) => setShopifyToken(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Settings &rarr; Apps &rarr; Develop apps &rarr; Create app &rarr; Admin API access token
                  </p>
                </div>
              </>
            )}

            {dialogType === "klaviyo" && (
              <>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Private API Key</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={klaviyoKey}
                      onChange={(e) => setKlaviyoKey(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Klaviyo &rarr; Settings &rarr; API Keys &rarr; Create Private API Key
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Public Key <span className="text-slate-400 text-xs">(opcional)</span>
                  </Label>
                  <Input
                    placeholder="RkXkAb"
                    value={klaviyoPublicKey}
                    onChange={(e) => setKlaviyoPublicKey(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </>
            )}

            {dialogType === "tracking" && (
              <>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">17track API Key</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua chave de API do 17track"
                      value={seventeenTrackKey}
                      onChange={(e) => setSeventeenTrackKey(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acesse{" "}
                    <a href="https://www.17track.net/en/apiuser" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      17track.net/apiuser
                    </a>
                    {" "}&rarr; Copie sua API Key
                  </p>
                </div>
                {integrations?.tracking.has_17track_key && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Chave API já configurada. Preencha acima para substituir.
                  </div>
                )}
              </>
            )}

            {/* Test Result */}
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? "text-emerald-600" : "text-red-600"}`}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {testResult.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || saving}
              className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Testar Conexão
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || testing}
              className="bg-primary hover:bg-primary/85 text-white shadow-sm"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {dialogType === "tracking" ? "Salvar API Key" : "Salvar Credenciais"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
