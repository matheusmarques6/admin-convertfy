"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ShoppingBag,
  Mail,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Plug,
  RefreshCw,
} from "lucide-react"
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
  shopify: {
    connected: boolean
    domain: string
    connected_at: string | null
  }
  klaviyo: {
    connected: boolean
    has_public_key: boolean
    connected_at: string | null
  }
  tracking: {
    active: boolean
    tracking_store_id: string | null
    has_17track_key: boolean
    widget_config: Record<string, unknown> | null
    last_sync_at: string | null
  }
}

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
  const [refreshing, setRefreshing] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<IntegrationType | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form fields
  const [shopifyDomain, setShopifyDomain] = useState("")
  const [shopifyToken, setShopifyToken] = useState("")
  const [klaviyoKey, setKlaviyoKey] = useState("")
  const [klaviyoPublicKey, setKlaviyoPublicKey] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

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
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function openDialog(type: IntegrationType) {
    setDialogType(type)
    setShowPassword(false)

    // Reset form fields
    if (type === "shopify") {
      setShopifyDomain(store?.shopify_store_domain || "")
      setShopifyToken("")
    } else if (type === "klaviyo") {
      setKlaviyoKey("")
      setKlaviyoPublicKey("")
    }

    setDialogOpen(true)
  }

  async function handleTestConnection() {
    if (!dialogType) return
    setTesting(true)

    try {
      let testPayload: Record<string, string> = {}

      if (dialogType === "shopify") {
        if (!shopifyDomain || !shopifyToken) {
          toast({ variant: "destructive", title: "Preencha o domínio e o Access Token" })
          setTesting(false)
          return
        }
        testPayload = { store_domain: shopifyDomain, access_token: shopifyToken }
        const res = await fetch("/api/integrations/shopify/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        })
        const data = await res.json()
        if (data.success) {
          toast({ title: "Conexão Shopify bem sucedida!", description: data.shop?.name ? `Loja: ${data.shop.name}` : "Conectado" })
        } else {
          toast({ variant: "destructive", title: "Falha na conexão", description: data.error || "Verifique suas credenciais" })
        }
      } else if (dialogType === "klaviyo") {
        if (!klaviyoKey) {
          toast({ variant: "destructive", title: "Preencha a Private API Key" })
          setTesting(false)
          return
        }
        const res = await fetch("/api/integrations/klaviyo/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: klaviyoKey }),
        })
        const data = await res.json()
        if (data.success) {
          toast({ title: "Conexão Klaviyo bem sucedida!", description: data.account ? `Conta: ${data.account}` : "Conectado" })
        } else {
          toast({ variant: "destructive", title: "Falha na conexão", description: data.error || "Verifique suas credenciais" })
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao testar conexão" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!dialogType || !store) return
    setSaving(true)

    try {
      const payload: Record<string, unknown> = {
        store_id: store.id,
        integration_type: dialogType,
      }

      if (dialogType === "shopify") {
        if (!shopifyToken) {
          toast({ variant: "destructive", title: "Preencha o Access Token" })
          setSaving(false)
          return
        }
        if (shopifyDomain) payload.shopify_store_domain = shopifyDomain
        payload.shopify_access_token = shopifyToken
      } else if (dialogType === "klaviyo") {
        if (!klaviyoKey) {
          toast({ variant: "destructive", title: "Preencha a Private API Key" })
          setSaving(false)
          return
        }
        payload.klaviyo_private_key = klaviyoKey
        if (klaviyoPublicKey) payload.klaviyo_public_key = klaviyoPublicKey
      } else if (dialogType === "tracking") {
        payload.activate_tracking = true
      }

      const res = await fetch("/api/portal/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")

      toast({ title: "Salvo com sucesso!", description: data.message || "Integração atualizada" })
      setDialogOpen(false)
      fetchData()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleActivateTracking() {
    if (!store) return
    setSaving(true)

    try {
      const res = await fetch("/api/portal/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: store.id,
          integration_type: "tracking",
          activate_tracking: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao ativar")

      toast({ title: "Rastreamento ativado!" })
      fetchData()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao ativar rastreamento",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-72 bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
          <Button onClick={() => fetchData()} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  const integrationCards = [
    {
      type: "shopify" as IntegrationType,
      name: "Shopify",
      description: "Integração com a loja Shopify para dados de vendas, clientes e pedidos",
      icon: ShoppingBag,
      iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
      iconColor: "text-emerald-600",
      color: "#96BF48",
      connected: integrations?.shopify.connected || false,
      detail: integrations?.shopify.domain || "",
      connectedAt: integrations?.shopify.connected_at,
      features: ["Sincronizar pedidos e clientes", "Webhooks de eventos", "Dados de vendas"],
    },
    {
      type: "klaviyo" as IntegrationType,
      name: "Klaviyo",
      description: "Plataforma de email marketing, automação e segmentação de clientes",
      icon: Mail,
      iconBg: "bg-violet-50 dark:bg-violet-500/10",
      iconColor: "text-violet-600",
      color: "#000000",
      connected: integrations?.klaviyo.connected || false,
      detail: integrations?.klaviyo.has_public_key ? "Private + Public Key" : "Private Key",
      connectedAt: integrations?.klaviyo.connected_at,
      features: ["Métricas de email", "Fluxos e automações", "Receita atribuída"],
    },
    {
      type: "tracking" as IntegrationType,
      name: "Rastreamento",
      description: "Rastreamento de pedidos via 17track para seus clientes finais",
      icon: Package,
      iconBg: "bg-blue-50 dark:bg-blue-500/10",
      iconColor: "text-blue-600",
      color: "#3B82F6",
      connected: integrations?.tracking.active || false,
      detail: integrations?.tracking.has_17track_key ? "17track configurado" : "Chave global",
      connectedAt: integrations?.tracking.last_sync_at,
      features: ["Rastreamento automático", "Widget para loja", "Notificações"],
    },
  ]

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Integrações</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {store?.store_name ? `Configurações de integração para ${store.store_name}` : "Gerencie as integrações da sua loja"}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-10 w-10 bg-white dark:bg-[#151922] border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] rounded-lg shadow-sm dark:shadow-slate-900/20"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {integrationCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.type} className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
              {/* Card Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{card.name}</h3>
                      {card.connected && card.detail && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{card.detail}</p>
                      )}
                    </div>
                  </div>
                  {card.connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" />
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                      <Clock className="h-3 w-3" />
                      Não conectado
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{card.description}</p>

                {/* Features */}
                <ul className="space-y-1.5">
                  {card.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Connected at */}
                {card.connected && card.connectedAt && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Conectado em {new Date(card.connectedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                )}

                {/* Action buttons */}
                <div className="pt-2">
                  {card.type === "tracking" ? (
                    card.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                        onClick={() => openDialog("tracking")}
                      >
                        <Package className="h-4 w-4 mr-2" />
                        Configurar Widget
                      </Button>
                    ) : integrations?.shopify.connected ? (
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
                        onClick={handleActivateTracking}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Package className="h-4 w-4 mr-2" />}
                        Ativar Rastreamento
                      </Button>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                        Conecte a Shopify primeiro
                      </p>
                    )
                  ) : (
                    <Button
                      variant={card.connected ? "outline" : "default"}
                      size="sm"
                      className={
                        card.connected
                          ? "w-full border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                          : "w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
                      }
                      onClick={() => openDialog(card.type)}
                    >
                      {card.connected ? (
                        <>
                          <Plug className="h-4 w-4 mr-2" />
                          Editar Credenciais
                        </>
                      ) : (
                        <>
                          <Plug className="h-4 w-4 mr-2" />
                          Conectar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {dialogType === "shopify" && "Configurar Shopify"}
              {dialogType === "klaviyo" && "Configurar Klaviyo"}
              {dialogType === "tracking" && "Configurar Rastreamento"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {dialogType === "shopify" && "Insira suas credenciais de acesso à API Admin da Shopify"}
              {dialogType === "klaviyo" && "Insira sua Private API Key do Klaviyo"}
              {dialogType === "tracking" && "Configure o widget de rastreamento"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {dialogType === "shopify" && (
              <>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Domínio da Loja
                  </Label>
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
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Admin API Access Token <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="shpat_xxxxxxxxxxxxxxxx"
                      value={shopifyToken}
                      onChange={(e) => setShopifyToken(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Settings &rarr; Apps &rarr; Develop apps &rarr; Admin API access token
                  </p>
                </div>
              </>
            )}

            {dialogType === "klaviyo" && (
              <>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Private API Key <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={klaviyoKey}
                      onChange={(e) => setKlaviyoKey(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Klaviyo &rarr; Settings &rarr; API Keys &rarr; Create Private API Key
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Public API Key <span className="text-slate-400 text-xs">(opcional)</span>
                  </Label>
                  <Input
                    placeholder="RkXkAb"
                    value={klaviyoPublicKey}
                    onChange={(e) => setKlaviyoPublicKey(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Usado para tracking no frontend (encontre em Account &rarr; Settings)
                  </p>
                </div>
              </>
            )}

            {dialogType === "tracking" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                  <Package className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Rastreamento via 17track</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      A chave de API do 17track é gerenciada globalmente pela Convertfy. O rastreamento será ativado automaticamente para seus pedidos.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Ao ativar, os pedidos da Shopify serão importados automaticamente e os códigos de rastreio serão monitorados em tempo real.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </Button>
            {dialogType !== "tracking" && (
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || saving}
                className="border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Testar
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || testing}
              className="bg-primary hover:bg-primary/85 text-white shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
