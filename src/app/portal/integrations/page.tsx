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
  tracking: { active: boolean; tracking_store_id: string | null; has_17track_key: boolean; widget_config: Record<string, unknown> | null; last_sync_at: string | null }
}

interface StoreInfo {
  id: string
  store_name: string
  platform: string
  store_url: string
  shopify_store_domain: string
}

type IntegrationType = "shopify" | "klaviyo"

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
    setTestResult(null)
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

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { store_id: store.id, integration_type: dialogType }

      if (dialogType === "shopify") {
        if (shopifyDomain) payload.shopify_store_domain = shopifyDomain
        payload.shopify_access_token = shopifyToken
      } else if (dialogType === "klaviyo") {
        payload.klaviyo_private_key = klaviyoKey
        if (klaviyoPublicKey) payload.klaviyo_public_key = klaviyoPublicKey
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
                <span className="text-xs text-slate-500 dark:text-slate-400">Gerenciada pela Convertfy</span>
              </div>
            </div>
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
          </CardContent>
        </div>
      </div>

      {/* Info */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        As credenciais são criptografadas e sincronizadas com o painel admin.
      </p>

      {/* Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {dialogType === "shopify" ? "Configurar Shopify" : "Configurar Klaviyo"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {store?.store_name} &mdash; {dialogType === "shopify"
                ? "Credenciais da API Admin da Shopify"
                : "Chaves de acesso da API do Klaviyo"}
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
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
              Testar Conexão
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || testing}
              className="bg-primary hover:bg-primary/85 text-white shadow-sm"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Credenciais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
