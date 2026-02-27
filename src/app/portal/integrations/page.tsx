"use client"

import { useState, useEffect, useCallback } from "react"
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
  shopify: { connected: boolean; domain: string; connected_at: string | null }
  klaviyo: { connected: boolean; has_public_key: boolean; connected_at: string | null }
  tracking: { active: boolean; tracking_store_id: string | null; has_17track_key: boolean; widget_config: Record<string, unknown> | null; last_sync_at: string | null }
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

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<IntegrationType | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Fields
  const [shopifyDomain, setShopifyDomain] = useState("")
  const [shopifyToken, setShopifyToken] = useState("")
  const [klaviyoKey, setKlaviyoKey] = useState("")
  const [klaviyoPublicKey, setKlaviyoPublicKey] = useState("")
  const [showPassword, setShowPassword] = useState(false)

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
        toast(data.success
          ? { title: "Conexão OK!", description: data.shop?.name ? `Loja: ${data.shop.name}` : "Conectado" }
          : { variant: "destructive", title: "Falha", description: data.error || "Verifique suas credenciais" })
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
        toast(data.success
          ? { title: "Conexão OK!", description: data.account ? `Conta: ${data.account}` : "Conectado" }
          : { variant: "destructive", title: "Falha", description: data.error || "Verifique suas credenciais" })
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
      const payload: Record<string, unknown> = { store_id: store.id, integration_type: dialogType }

      if (dialogType === "shopify") {
        if (!shopifyToken) { toast({ variant: "destructive", title: "Preencha o Access Token" }); return }
        if (shopifyDomain) payload.shopify_store_domain = shopifyDomain
        payload.shopify_access_token = shopifyToken
      } else if (dialogType === "klaviyo") {
        if (!klaviyoKey) { toast({ variant: "destructive", title: "Preencha a Private API Key" }); return }
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

      toast({ title: "Salvo com sucesso!" })
      setDialogOpen(false)
      fetchData()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err instanceof Error ? err.message : "Tente novamente" })
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
        body: JSON.stringify({ store_id: store.id, integration_type: "tracking", activate_tracking: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao ativar")
      toast({ title: "Rastreamento ativado!" })
      fetchData()
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao ativar", description: err instanceof Error ? err.message : "Tente novamente" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto space-y-4">
        <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200 dark:border-slate-700/40 p-8 text-center max-w-sm shadow-sm">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{error}</p>
          <Button onClick={fetchData} size="sm" className="bg-primary hover:bg-primary/85 text-white">Tentar novamente</Button>
        </div>
      </div>
    )
  }

  const rows = [
    {
      type: "shopify" as IntegrationType,
      icon: ShoppingBag,
      iconBg: "bg-[#96BF48]/10",
      iconColor: "text-[#96BF48]",
      name: "Shopify",
      subtitle: integrations?.shopify.connected ? (integrations.shopify.domain || "Conectado") : "Loja e-commerce",
      connected: integrations?.shopify.connected || false,
    },
    {
      type: "klaviyo" as IntegrationType,
      icon: Mail,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-500",
      name: "Klaviyo",
      subtitle: integrations?.klaviyo.connected ? "API Key configurada" : "Email marketing",
      connected: integrations?.klaviyo.connected || false,
    },
    {
      type: "tracking" as IntegrationType,
      icon: Package,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
      name: "Rastreamento (17track)",
      subtitle: integrations?.tracking.active ? "Ativo" : "Rastreamento de pedidos",
      connected: integrations?.tracking.active || false,
    },
  ]

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Integrações</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Gerencie as conexões da loja <strong className="text-slate-700 dark:text-slate-200">{store?.store_name}</strong>
        </p>
      </div>

      {/* Integration List */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 divide-y divide-slate-100 dark:divide-slate-700/30">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <div key={row.type} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${row.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${row.iconColor}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.name}</h3>
                    {row.connected ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        Desconectado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.subtitle}</p>
                </div>
              </div>

              <div>
                {row.type === "tracking" ? (
                  row.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog("tracking")}
                      className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                    >
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Configurar
                    </Button>
                  ) : integrations?.shopify.connected ? (
                    <Button
                      size="sm"
                      onClick={handleActivateTracking}
                      disabled={saving}
                      className="bg-primary hover:bg-primary/85 text-white shadow-sm"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Ativar
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">Conecte a Shopify</span>
                  )
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDialog(row.type)}
                    className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    {row.connected ? "Editar" : "Conectar"}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        As credenciais são criptografadas e sincronizadas com o painel admin da Convertfy.
      </p>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {dialogType === "shopify" && "Shopify"}
              {dialogType === "klaviyo" && "Klaviyo"}
              {dialogType === "tracking" && "Rastreamento"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {dialogType === "shopify" && "Credenciais da API Admin da Shopify"}
              {dialogType === "klaviyo" && "Chave de acesso da API do Klaviyo"}
              {dialogType === "tracking" && "Configuração do rastreamento de pedidos"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {dialogType === "shopify" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Domínio da Loja</Label>
                  <Input
                    placeholder="minhaloja.myshopify.com"
                    value={shopifyDomain}
                    onChange={(e) => setShopifyDomain(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Access Token <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="shpat_xxxxxxxxxxxxxxxx"
                      value={shopifyToken}
                      onChange={(e) => setShopifyToken(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {dialogType === "klaviyo" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Private API Key <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={klaviyoKey}
                      onChange={(e) => setKlaviyoKey(e.target.value)}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    Public Key <span className="text-slate-400 text-xs">(opcional)</span>
                  </Label>
                  <Input
                    placeholder="RkXkAb"
                    value={klaviyoPublicKey}
                    onChange={(e) => setKlaviyoPublicKey(e.target.value)}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40"
                  />
                </div>
              </>
            )}

            {dialogType === "tracking" && (
              <div className="flex items-start gap-3 py-2 px-4 rounded-lg bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10">
                <Package className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  A chave 17track é gerenciada pela Convertfy. Ao salvar, o rastreamento será ativado para esta loja.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              Cancelar
            </Button>
            {dialogType !== "tracking" && (
              <Button variant="outline" onClick={handleTestConnection} disabled={testing || saving} className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
                {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Testar
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || testing} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
