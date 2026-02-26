"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  Code,
  Store,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface StoreTrackingData {
  id: string
  store_name: string
  platform: string
  store_url: string
  shopify_store_domain: string
  shopify_access_token: boolean
  hasKlaviyo: boolean
  is_active: boolean
}

export default function PortalTrackingPage() {
  const [stores, setStores] = useState<StoreTrackingData[]>([])
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const fetchStores = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/stores")
      if (!response.ok) throw new Error("Erro ao carregar dados")
      const data = await response.json()
      setStores(data.stores || [])
      setError(null)
    } catch {
      setError("Não foi possível carregar as configurações de rastreamento")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal_active_store")
      if (saved) setActiveStoreId(saved)
    } catch { /* ignore */ }
  }, [])

  const activeStore = stores.find(s => s.id === activeStoreId) || stores[0] || null
  const hasShopify = activeStore && activeStore.shopify_store_domain && activeStore.shopify_access_token
  const storeId = activeStore?.id || ""
  const shopifyDomain = activeStore?.shopify_store_domain || ""

  function copyToClipboard(value: string, field: string) {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const trackingScript = activeStore ? `<!-- Convertfy Tracking -->
<script>
  (function() {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = 'https://track.convertfy.com.br/pixel.js';
    s.setAttribute('data-store-id', '${storeId}');
    var x = document.getElementsByTagName('script')[0];
    x.parentNode.insertBefore(s, x);
  })();
</script>` : ""

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto space-y-6">
        <div>
          <Skeleton className="h-7 w-64 bg-slate-200 dark:bg-slate-700 mb-2" />
          <Skeleton className="h-4 w-96 bg-slate-100 dark:bg-slate-800" />
        </div>
        <Skeleton className="h-48 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
        <Skeleton className="h-64 bg-white dark:bg-[#151922] rounded-xl border border-slate-100 dark:border-slate-700/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-700/40 p-10 text-center max-w-md shadow-sm dark:shadow-slate-900/20">
            <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{error}</p>
            <Button onClick={() => { setLoading(true); fetchStores() }} className="bg-primary hover:bg-primary/85 text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Configurações de Rastreamento</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Configure o rastreamento de conversões e eventos da sua loja
        </p>
      </div>

      {/* Shopify Section */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-[#96BF48]" />
              Shopify
            </h3>
            {hasShopify ? (
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/40">
                Desconectado
              </Badge>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {hasShopify ? (
            <>
              {/* Store ID */}
              <div className="space-y-2">
                <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Seu Store ID</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={storeId}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0 border-slate-200 dark:border-slate-700/40"
                    onClick={() => copyToClipboard(storeId, "storeId")}
                  >
                    {copiedField === "storeId" ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  ID único da sua loja no sistema Convertfy
                </p>
              </div>

              {/* Shopify Domain */}
              <div className="space-y-2">
                <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">Domínio Shopify</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shopifyDomain}
                    className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0 border-slate-200 dark:border-slate-700/40"
                    onClick={() => copyToClipboard(shopifyDomain, "domain")}
                  >
                    {copiedField === "domain" ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Store URL */}
              {activeStore.store_url && (
                <div className="space-y-2">
                  <Label className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">URL da Loja</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={activeStore.store_url}
                      className="h-10 bg-slate-50 dark:bg-[#1A1F2E] border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 flex-shrink-0 border-slate-200 dark:border-slate-700/40"
                      asChild
                    >
                      <a href={activeStore.store_url.startsWith("http") ? activeStore.store_url : `https://${activeStore.store_url}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 text-slate-400" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              {/* Integration Status */}
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Loja vinculada com sucesso</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      A integração Shopify está configurada e o rastreamento está ativo para a loja <strong>{activeStore.store_name}</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No Shopify configured */
            <Alert className="border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-[13px]">
                <strong>Nenhuma loja vinculada.</strong>{" "}
                {stores.length === 0
                  ? "Você ainda não possui uma loja cadastrada. Entre em contato com seu gestor para configurar."
                  : "Configure a integração Shopify na sua loja para ativar o rastreamento."
                }
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Tracking Script Section */}
      {hasShopify && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Code className="h-4 w-4 text-[#05AFF2]" />
              Pixel de Rastreamento
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Instale o pixel de rastreamento no tema da sua loja Shopify
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="relative">
              <pre className="p-4 rounded-lg bg-slate-900 dark:bg-[#0B0E14] text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed whitespace-pre">
                {trackingScript}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-3 right-3 bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 hover:text-white"
                onClick={() => copyToClipboard(trackingScript, "script")}
              >
                {copiedField === "script" ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#1A1F2E] text-sm space-y-2">
              <p className="font-medium text-slate-700 dark:text-slate-200">Como instalar:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 text-[13px]">
                <li>Acesse o painel admin da sua loja Shopify</li>
                <li>{"Vá em Loja Virtual > Temas > Ações > Editar código"}</li>
                <li>{"Abra o arquivo theme.liquid"}</li>
                <li>{"Cole o código acima antes da tag </head>"}</li>
                <li>Salve o arquivo</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Klaviyo Tracking Status */}
      {activeStore && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/30">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                Klaviyo
              </h3>
              {activeStore.hasKlaviyo ? (
                <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/40">
                  Desconectado
                </Badge>
              )}
            </div>
          </div>
          <div className="p-6">
            {activeStore.hasKlaviyo ? (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Klaviyo conectado</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      O rastreamento de eventos e métricas do Klaviyo está ativo.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <Alert className="border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-700 dark:text-amber-300 text-[13px]">
                  Klaviyo não configurado. Entre em contato com seu gestor para configurar a integração.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
