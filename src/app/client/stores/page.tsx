"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Store,
  ExternalLink,
  AlertCircle,
  Key,
  Loader2,
  CheckCircle2,
  Settings,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/lib/hooks/use-toast"
import { formatCompactNumber, cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────

interface StoreData {
  id: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  hasKlaviyo: boolean
  shopify_access_token: boolean
  shopify_store_domain: string
}

interface StoresResponse {
  stores: StoreData[]
}

// ─── Brand Icons ────────────────────────────────────────

function ShopifyIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 109 124"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M94.27 23.49C94.17 22.79 93.57 22.42 93.07 22.39C92.57 22.36 82.47 21.87 82.47 21.87C82.47 21.87 73.47 13 72.57 12.1C71.67 11.2 69.87 11.47 69.17 11.67C69.07 11.7 67.37 12.23 64.57 13.1C63.97 11.15 63.07 8.82 61.67 6.49C57.77 0.09 52.27 0 50.67 0C50.37 0 50.17 0.03 49.97 0.03C49.37 -0.07 48.87 0.43 48.47 0.93C48.07 1.43 40.17 11.2 38.27 16.4C36.47 21.3 35.67 21.9 35.27 22.1C32.27 23.2 23.07 26.1 23.07 26.1L23 26.13C19.7 27.13 19.57 27.23 19.17 30.33C18.87 32.63 9 105.15 9 105.15L72.3 117.55L104.1 110.35C104.1 110.35 94.37 24.19 94.27 23.49Z"
        fill="#95BF47"
      />
      <path
        d="M64.57 13.1C63.97 11.15 63.07 8.82 61.67 6.49C57.77 0.09 52.27 0 50.67 0L48.47 0.93C48.07 1.43 40.17 11.2 38.27 16.4C36.47 21.3 35.67 21.9 35.27 22.1C32.27 23.2 23.07 26.1 23.07 26.1L23 26.13C19.7 27.13 19.57 27.23 19.17 30.33C18.87 32.63 9 105.15 9 105.15L50.67 113.15V0C50.37 0 50.17 0.03 49.97 0.03C49.37 -0.07 48.87 0.43 48.47 0.93"
        fill="#5E8E3E"
      />
      <path
        d="M53.07 41.39L49.37 55.09C49.37 55.09 46.07 53.39 42.07 53.59C36.07 53.89 36.07 57.59 36.07 58.49C36.37 64.49 49.87 65.59 50.57 77.89C51.17 87.49 45.37 94.09 36.97 94.59C26.87 95.19 21.37 89.39 21.37 89.39L23.67 80.59C23.67 80.59 29.17 84.69 33.57 84.39C36.47 84.19 37.57 81.79 37.47 80.09C37.07 72.39 26.07 72.79 25.47 61.59C24.97 52.09 31.07 42.49 45.47 41.59C50.67 41.29 53.07 41.39 53.07 41.39Z"
        fill="white"
      />
    </svg>
  )
}

function KlaviyoIcon({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-black rounded-[6px]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M22 12C22 12 17.5 16 12 16C6.5 16 2 12 2 12C2 12 6.5 8 12 8C17.5 8 22 12 22 12Z"
          fill="#BEF264"
        />
        <circle cx="12" cy="12" r="3" fill="#000" />
      </svg>
    </div>
  )
}

function PlatformIcon({ platform, size = 32 }: { platform: string; size?: number }) {
  if (platform === "shopify") {
    return (
      <div
        className="flex items-center justify-center rounded-[6px] bg-[#95BF47]/10"
        style={{ width: size, height: size }}
      >
        <ShopifyIcon size={size * 0.6} />
      </div>
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-[6px] bg-slate-100 dark:bg-slate-800"
      style={{ width: size, height: size }}
    >
      <Store className="text-slate-500 dark:text-slate-400" style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

// ─── Store Card ─────────────────────────────────────────

function StoreCard({
  store,
  onConfigure,
}: {
  store: StoreData
  onConfigure: (store: StoreData) => void
}) {
  const needsSetup = !store.hasKlaviyo || !store.shopify_access_token

  return (
    <Link
      href={`/client/stores/${store.id}`}
      className="block group"
    >
      <div className="p-5 rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] cursor-pointer hover:border-[rgba(0,0,0,0.15)] dark:hover:border-[rgba(255,255,255,0.14)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-150">
        {/* Header: platform icon + name + status */}
        <div className="flex items-center gap-3 mb-3">
          <PlatformIcon platform={store.platform} size={36} />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
              {store.store_name}
            </h3>
            <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
              {store.store_url || store.shopify_store_domain || store.platform}
            </p>
          </div>
          <StatusBadge status={store.is_active ? "active" : "inactive"} />
        </div>

        {/* Integration status + action */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <div>
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Shopify</p>
            <StatusBadge
              status={store.shopify_access_token ? "connected" : "disconnected"}
              showDot={false}
            />
          </div>
          <div>
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Klaviyo</p>
            <StatusBadge
              status={store.hasKlaviyo ? "connected" : "disconnected"}
              showDot={false}
            />
          </div>
          <div className="flex items-end justify-end">
            {needsSetup ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2.5 text-xs rounded-[6px] border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onConfigure(store)
                }}
              >
                <Settings className="h-3 w-3 mr-1" />
                Configurar
              </Button>
            ) : store.store_url ? (
              <a
                href={store.store_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-[#5C6378] hover:text-gray-600 dark:hover:text-[#EAEDF3] transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Visitar
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Main Component ─────────────────────────────────────

export default function PortalStoresPage() {
  const [stores, setStores] = useState<StoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Credentials dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [credForm, setCredForm] = useState({
    klaviyo_private_key: "",
    shopify_store_domain: "",
    shopify_access_token: "",
  })
  const [testing, setTesting] = useState<"klaviyo" | "shopify" | null>(null)
  const [testResult, setTestResult] = useState<{
    type: string
    success: boolean
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/portal/stores")
      if (!response.ok) throw new Error("Erro ao carregar lojas")
      const data: StoresResponse = await response.json()
      setStores(data.stores)
      setError(null)
    } catch (err) {
      console.error("Stores fetch error:", err)
      setError("Não foi possível carregar as lojas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStores()
  }, [])

  function openCredentialsDialog(store: StoreData) {
    setSelectedStore(store)
    setCredForm({
      klaviyo_private_key: "",
      shopify_store_domain: store.shopify_store_domain || "",
      shopify_access_token: "",
    })
    setTestResult(null)
    setDialogOpen(true)
  }

  async function testKlaviyo() {
    if (!credForm.klaviyo_private_key) {
      toast({ variant: "destructive", title: "Informe a Private API Key do Klaviyo" })
      return
    }
    setTesting("klaviyo")
    setTestResult(null)
    try {
      const res = await fetch("/api/integrations/klaviyo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: credForm.klaviyo_private_key }),
      })
      const data = await res.json()
      setTestResult({
        type: "klaviyo",
        success: data.success,
        message: data.success
          ? data.account
            ? `Conectado: ${data.account}`
            : "Conexão OK!"
          : data.error || "Falha na autenticação",
      })
    } catch {
      setTestResult({ type: "klaviyo", success: false, message: "Erro ao testar conexão" })
    } finally {
      setTesting(null)
    }
  }

  async function testShopify() {
    if (!credForm.shopify_store_domain || !credForm.shopify_access_token) {
      toast({ variant: "destructive", title: "Informe o domínio e o Access Token da Shopify" })
      return
    }
    setTesting("shopify")
    setTestResult(null)
    try {
      const res = await fetch("/api/integrations/shopify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_domain: credForm.shopify_store_domain,
          access_token: credForm.shopify_access_token,
        }),
      })
      const data = await res.json()
      setTestResult({
        type: "shopify",
        success: data.success,
        message: data.success
          ? data.shop?.name
            ? `Conectado: ${data.shop.name}`
            : "Conexão OK!"
          : data.error || "Falha na conexão",
      })
    } catch {
      setTestResult({ type: "shopify", success: false, message: "Erro ao testar conexão" })
    } finally {
      setTesting(null)
    }
  }

  async function handleSaveCredentials() {
    if (!selectedStore) return

    const hasKlaviyo = !!credForm.klaviyo_private_key
    const hasShopify = !!credForm.shopify_access_token

    if (!hasKlaviyo && !hasShopify) {
      toast({ variant: "destructive", title: "Preencha ao menos uma credencial" })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, string> = { store_id: selectedStore.id }
      if (hasKlaviyo) payload.klaviyo_private_key = credForm.klaviyo_private_key
      if (credForm.shopify_store_domain) payload.shopify_store_domain = credForm.shopify_store_domain
      if (hasShopify) payload.shopify_access_token = credForm.shopify_access_token

      const res = await fetch("/api/portal/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao salvar")

      toast({ title: "Credenciais salvas com sucesso!" })
      setDialogOpen(false)
      fetchStores()
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

  // ─── Loading ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-40 mb-1.5 rounded-[6px]" />
            <Skeleton className="h-4 w-56 rounded-[6px]" />
          </div>
          <Skeleton className="h-9 w-28 rounded-[6px]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded-[10px]" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ──────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-14 h-14 rounded-full bg-[#fef2f2] dark:bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-[#EF4444]" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mb-1">
          Erro ao carregar
        </h2>
        <p className="text-sm text-gray-400 dark:text-[#5C6378] mb-5">{error}</p>
        <Button
          onClick={fetchStores}
          className="rounded-[6px] h-9 px-4 text-sm"
        >
          Tentar novamente
        </Button>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Minhas Lojas
            {stores.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-[#5C6378]">
                ({stores.length})
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 dark:text-[#5C6378] mt-0.5">
            Acompanhe status e integrações de cada loja
          </p>
        </div>
        <Button
          asChild
          className="rounded-[6px] h-9 px-4 text-sm gap-1.5"
        >
          <Link href="/client/stores/new">
            <Plus className="h-3.5 w-3.5" />
            Adicionar Loja
          </Link>
        </Button>
      </div>

      {/* Grid de StoreCards ou Empty State */}
      {stores.length === 0 ? (
        <div className="text-center py-12 px-6 border-2 border-dashed border-[#e5e7eb] dark:border-[rgba(255,255,255,0.08)] rounded-[12px] bg-[#fafbfc] dark:bg-[#1F2937]/50">
          <div className="w-16 h-16 rounded-full bg-[#f3f4f6] dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Store className="h-7 w-7 text-gray-400 dark:text-[#5C6378]" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mb-2">
            Nenhuma loja configurada
          </h3>
          <p className="text-sm text-gray-400 dark:text-[#5C6378] max-w-sm mx-auto mb-5">
            Suas lojas serão exibidas aqui assim que forem configuradas pela equipe Convertfy.
          </p>
          <Button asChild className="rounded-[6px] h-9 px-4 text-sm gap-1.5">
            <Link href="/client/stores/new">
              <Plus className="h-3.5 w-3.5" />
              Adicionar Loja
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onConfigure={openCredentialsDialog}
            />
          ))}
        </div>
      )}

      {/* Credentials Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-[#1F2937] border-[#e5e7eb] dark:border-[#374151]">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-[#EAEDF3]">
              Configurar Integrações
            </DialogTitle>
            <DialogDescription className="text-gray-400 dark:text-[#5C6378]">
              {selectedStore?.store_name} &mdash; Insira suas credenciais para conectar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Klaviyo Section */}
            {selectedStore && !selectedStore.hasKlaviyo && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] flex items-center gap-2">
                  <KlaviyoIcon size={20} />
                  Klaviyo
                </h4>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]">
                    Private API Key
                  </Label>
                  <Input
                    type="password"
                    placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={credForm.klaviyo_private_key}
                    onChange={(e) => setCredForm({ ...credForm, klaviyo_private_key: e.target.value })}
                    className="h-10 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F9FAFB]"
                  />
                  <p className="text-xs text-gray-400 dark:text-[#5C6378]">
                    Klaviyo &rarr; Settings &rarr; API Keys &rarr; Create Private API Key
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={testKlaviyo}
                  disabled={testing === "klaviyo" || !credForm.klaviyo_private_key}
                  className="rounded-[6px] h-8 text-xs"
                >
                  {testing === "klaviyo" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Key className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Testar Conexão
                </Button>
                {testResult?.type === "klaviyo" && (
                  <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Shopify Section */}
            {selectedStore && !selectedStore.shopify_access_token && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] flex items-center gap-2">
                  <PlatformIcon platform="shopify" size={20} />
                  Shopify
                </h4>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]">
                    Domínio da Loja
                  </Label>
                  <Input
                    placeholder="minhaloja.myshopify.com"
                    value={credForm.shopify_store_domain}
                    onChange={(e) => setCredForm({ ...credForm, shopify_store_domain: e.target.value })}
                    className="h-10 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F9FAFB]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium text-[#374151] dark:text-[#9CA3AF]">
                    Admin API Access Token
                  </Label>
                  <Input
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxxxxxx"
                    value={credForm.shopify_access_token}
                    onChange={(e) => setCredForm({ ...credForm, shopify_access_token: e.target.value })}
                    className="h-10 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F9FAFB]"
                  />
                  <p className="text-xs text-gray-400 dark:text-[#5C6378]">
                    Settings &rarr; Apps &rarr; Develop apps &rarr; Admin API access token
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={testShopify}
                  disabled={testing === "shopify" || !credForm.shopify_store_domain || !credForm.shopify_access_token}
                  className="rounded-[6px] h-8 text-xs"
                >
                  {testing === "shopify" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Store className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Testar Conexão
                </Button>
                {testResult?.type === "shopify" && (
                  <div className={`flex items-center gap-1.5 text-sm ${testResult.success ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* All connected */}
            {selectedStore?.hasKlaviyo && selectedStore?.shopify_access_token && (
              <div className="flex items-center gap-2.5 py-4 text-[#10B981]">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-medium">Todas as integrações estão conectadas!</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialogOpen(false)}
              className="rounded-[6px] h-9"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={saving || (!credForm.klaviyo_private_key && !credForm.shopify_access_token)}
              className="rounded-[6px] h-9"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar Credenciais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
