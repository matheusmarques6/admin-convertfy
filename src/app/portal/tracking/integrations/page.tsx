"use client"

import { useState, useEffect } from "react"
import {
  ShoppingBag,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Save,
  Plug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/lib/hooks/use-toast"

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
}

export default function PortalTrackingIntegrationsPage() {
  const [stores, setStores] = useState<TrackingStoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/portal/tracking")
      if (!response.ok) throw new Error("Erro ao carregar")
      const data = await response.json()
      setStores(data.stores || [])
    } catch {
      setError("Não foi possível carregar as integrações")
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async (store: TrackingStoreData) => {
    setSaving(store.client_store_id)

    try {
      const payload: Record<string, unknown> = {
        client_store_id: store.client_store_id,
      }

      // Include 17track key if provided
      const key = apiKeys[store.client_store_id]
      if (key) {
        payload.seventeen_track_api_key = key
      }

      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao ativar")
      }

      toast({ title: "Rastreamento ativado com sucesso!" })
      fetchStores()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao ativar rastreamento",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setSaving(null)
    }
  }

  const handleUpdate17TrackKey = async (store: TrackingStoreData) => {
    const key = apiKeys[store.client_store_id]
    if (!key) {
      toast({ variant: "destructive", title: "Informe a API Key do 17track" })
      return
    }

    setSaving(store.client_store_id)

    try {
      const res = await fetch("/api/portal/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_store_id: store.client_store_id,
          seventeen_track_api_key: key,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }

      toast({ title: "Chave 17track salva com sucesso!" })
      setApiKeys((prev) => ({ ...prev, [store.client_store_id]: "" }))
      fetchStores()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
      })
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-64 bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
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
          <Button onClick={fetchStores} className="bg-primary hover:bg-primary/85 text-white shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Integrações de Rastreamento</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure as integrações para rastreamento de pedidos
        </p>
      </div>

      {/* Info Alert */}
      <Alert className="border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10">
        <Plug className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-blue-700 dark:text-blue-400 text-[13px]">
          O rastreamento usa os dados da Shopify para importar pedidos e fulfillments automaticamente. A API 17track é opcional e permite rastrear transportadoras globais.
        </AlertDescription>
      </Alert>

      {/* Stores */}
      <div className="space-y-4">
        {stores.map((store) => (
          <div key={store.client_store_id} className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
            {/* Store Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{store.store_name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{store.platform}</p>
                  </div>
                </div>
                {store.tracking_active ? (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" />
                    Rastreamento Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/40">
                    <Clock className="h-3 w-3" />
                    Inativo
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Shopify Connection Status */}
              <div>
                <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-3 uppercase tracking-wide">Shopify</h4>
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200/50 dark:border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                      <ShoppingBag className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Shopify Store</p>
                      {store.shopify_store_domain && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{store.shopify_store_domain}</p>
                      )}
                    </div>
                  </div>
                  {store.shopify_connected ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <Clock className="h-4 w-4" />
                      Não conectado
                    </span>
                  )}
                </div>
                {!store.shopify_connected && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Configure a Shopify nas suas Lojas para ativar o rastreamento.
                  </p>
                )}
              </div>

              {/* 17track Configuration */}
              <div>
                <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-3 uppercase tracking-wide">17track API (Opcional)</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`key-${store.client_store_id}`} className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">
                      API Key
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id={`key-${store.client_store_id}`}
                        type="password"
                        placeholder={store.has_17track_key ? "••••••••••••••" : "Sua chave da API 17track"}
                        value={apiKeys[store.client_store_id] || ""}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, [store.client_store_id]: e.target.value }))}
                        className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleUpdate17TrackKey(store)}
                        disabled={saving === store.client_store_id || !apiKeys[store.client_store_id]}
                        className="border-slate-200/80 dark:border-slate-700/40 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                      >
                        {saving === store.client_store_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Obtenha sua chave em{" "}
                      <a href="https://api.17track.net" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        api.17track.net
                      </a>
                      . Se não informada, o rastreamento usará dados do Shopify.
                    </p>
                  </div>

                  {store.has_17track_key && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Chave 17track configurada
                    </div>
                  )}
                </div>
              </div>

              {/* Activate Button */}
              {!store.tracking_active && store.shopify_connected && (
                <Button
                  onClick={() => handleActivate(store)}
                  disabled={saving === store.client_store_id}
                  className="w-full bg-primary hover:bg-primary/85 text-white shadow-sm"
                >
                  {saving === store.client_store_id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4 mr-2" />
                  )}
                  Ativar Rastreamento para esta Loja
                </Button>
              )}

              {/* Last sync info */}
              {store.last_sync_at && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Última sincronização: {new Date(store.last_sync_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {stores.length === 0 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Nenhuma loja encontrada</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure suas lojas primeiro para ativar o rastreamento.
          </p>
        </div>
      )}
    </div>
  )
}
