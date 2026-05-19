"use client"

import { useState, useEffect } from "react"
import { useSearchParams, usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store,
  Plus,
  Trash2,
  ExternalLink,
  ArrowRight,
  Loader2,
  Info,
  Settings,
  AlertTriangle,
  RefreshCw,
  Filter,
  Clock,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/lib/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

interface ClientStore {
  id: string
  store_name: string
  store_url?: string
  platform?: string
  currency?: string
  mrr_cents?: number | null
  is_active: boolean
  created_at: string
  client_id?: string
  shopify_store_domain?: string
  klaviyo_public_key?: string
  klaviyo_list_id?: string
  ga4_property_id?: string
  has_shopify_credentials?: boolean
  has_klaviyo_credentials?: boolean
  has_ga4_credentials?: boolean
  has_omnisend_credentials?: boolean
  email_platform?: string | null
  country?: string | null
  health_score?: number | null
}

interface StoreMetrics {
  revenue30d: number
  orders30d: number
  attributedRevenue30d: number
  totalLeads?: number
  campaigns?: number
  flows?: number
}

interface StoreActivity {
  type: string
  description?: string
  created_at: string
}

interface ClientStoresProps {
  clientId: string
  clientName: string
}

// ─── Helpers ──────────────────────────────────────────────

function storeActivityLabel(activity: StoreActivity): string {
  switch (activity.type) {
    case "note_added":
      return "Feedback semanal"
    case "meeting_scheduled":
      return "Reunião agendada"
    case "meeting_completed":
      return "Reunião realizada"
    case "report_uploaded":
      return "Relatório enviado"
    case "payment_received":
      return "Pagamento recebido"
    case "client_updated":
      return "Configuração atualizada"
    case "email_sent":
      return "Email enviado"
    default:
      return activity.description?.slice(0, 24) ?? "Atividade"
  }
}

function storeActivityRelative(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "agora mesmo"
  if (diffMin < 60) return `há ${diffMin}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 30) return `há ${diffDays} dia${diffDays !== 1 ? "s" : ""}`
  const diffMonths = Math.floor(diffDays / 30)
  return `há ${diffMonths} ${diffMonths !== 1 ? "meses" : "mês"}`
}

// ─── Integration pill ─────────────────────────────────────

function IntegrationPill({
  name,
  connected,
}: {
  name: string
  connected: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] border",
        connected
          ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-[#0B2C24] dark:text-[#6EE7B7] dark:border-[rgba(110,231,183,0.3)]"
          : "bg-[#F3F4F6] text-gray-500 border-[#E5E7EB] dark:bg-[rgba(255,255,255,0.04)] dark:text-[#5C6378] dark:border-[rgba(255,255,255,0.08)]",
      )}
    >
      <span
        className={cn(
          "w-1 h-1 rounded-full",
          connected ? "bg-[#10B981]" : "bg-gray-400 dark:bg-[#5C6378]",
        )}
      />
      {name}
    </span>
  )
}

// ─── Store Card ───────────────────────────────────────────

function StoreCard({
  store,
  metrics,
  lastActivity,
  onEdit,
  onDelete,
  loading,
}: {
  store: ClientStore
  metrics?: StoreMetrics
  lastActivity?: StoreActivity
  onEdit: () => void
  onDelete: () => void
  loading?: boolean
}) {
  const router = useRouter()
  const initials = store.store_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  // Onboarding progress: count credentials configured
  const integrations = [
    { connected: store.has_shopify_credentials, name: "Shopify" },
    { connected: store.has_klaviyo_credentials, name: "Klaviyo" },
    { connected: store.has_omnisend_credentials, name: "Omnisend" },
    { connected: store.has_ga4_credentials, name: "GA4" },
  ]
  const connectedCount = integrations.filter((i) => i.connected).length
  const isOnboarding = !store.is_active || connectedCount < 2
  const totalSteps = 6
  const completedSteps = Math.min(totalSteps, Math.max(1, connectedCount + 2))

  const healthScore = store.health_score ?? (connectedCount >= 3 ? 82 : connectedCount >= 2 ? 64 : 40)
  const recoveryRate =
    metrics?.revenue30d && metrics.revenue30d > 0
      ? (metrics.attributedRevenue30d / metrics.revenue30d) * 100
      : null

  return (
    <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-[6px] bg-[#1F1F1F] dark:bg-[#0B0B0B] flex items-center justify-center text-white text-[12px] font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                {store.store_name}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-semibold rounded-[4px]",
                  isOnboarding
                    ? "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] dark:bg-[#3D2A0D] dark:text-[#FCD34D] dark:border-[rgba(252,211,77,0.3)]"
                    : "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] dark:bg-[#0B2C24] dark:text-[#6EE7B7] dark:border-[rgba(110,231,183,0.3)]",
                )}
              >
                <span
                  className={cn(
                    "w-1 h-1 rounded-full",
                    isOnboarding ? "bg-[#F59E0B]" : "bg-[#10B981]",
                  )}
                />
                {isOnboarding ? "Onboarding" : "Ativa"}
              </span>
            </div>
            {store.store_url ? (
              <a
                href={store.store_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-gray-500 dark:text-[#8B92A5] hover:text-[#4E62D8] dark:hover:text-[#7B8CEA] transition-colors mt-0.5"
              >
                {store.store_url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                URL não configurada
              </p>
            )}
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-0.5">
              {[store.platform, store.currency, store.country].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
              Saúde
            </p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums",
                healthScore >= 70
                  ? "text-[#065F46] dark:text-[#6EE7B7]"
                  : healthScore >= 50
                    ? "text-[#92400E] dark:text-[#FCD34D]"
                    : "text-[#991B1B] dark:text-[#FCA5A5]",
              )}
            >
              {healthScore}<span className="text-[10px] text-gray-400 font-normal">/100</span>
            </p>
          </div>
        </div>

        {/* Metrics row */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-2 rounded-[6px] bg-[#FAFBFC] dark:bg-[#161922] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] p-3">
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
                Receita 30D
              </p>
              {loading ? (
                <p className="text-[12px] text-gray-300 dark:text-[#5C6378] mt-1">—</p>
              ) : metrics?.revenue30d && metrics.revenue30d > 0 ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums mt-0.5">
                    {formatCurrency(metrics.revenue30d)}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">via loja</p>
                </>
              ) : (
                <p className="text-sm text-gray-300 dark:text-[#5C6378] mt-0.5">—</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
                Pedidos 30D
              </p>
              {metrics?.orders30d && metrics.orders30d > 0 ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums mt-0.5">
                    {metrics.orders30d.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">no período</p>
                </>
              ) : (
                <p className="text-sm text-gray-300 dark:text-[#5C6378] mt-0.5">—</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
                Atribuição
              </p>
              {recoveryRate != null ? (
                <>
                  <p className="text-sm font-semibold text-[#2137B6] dark:text-[#7B8CEA] tabular-nums mt-0.5">
                    {recoveryRate.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">via Convertfy</p>
                </>
              ) : (
                <p className="text-sm text-gray-300 dark:text-[#5C6378] mt-0.5">—</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
                MRR
              </p>
              {store.mrr_cents && store.mrr_cents > 0 ? (
                <>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums mt-0.5">
                    {formatCurrency(store.mrr_cents / 100)}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">plano mensal</p>
                </>
              ) : isOnboarding ? (
                <>
                  <p className="text-sm font-semibold text-[#92400E] dark:text-[#FCD34D] mt-0.5 truncate">
                    Em onboarding
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">sem cobrança</p>
                </>
              ) : (
                <p className="text-sm text-gray-300 dark:text-[#5C6378] mt-0.5">—</p>
              )}
            </div>
          </div>

          {/* Onboarding progress */}
          {isOnboarding && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-[#92400E] dark:text-[#FCD34D]">
                  Onboarding em andamento
                </span>
                <span className="text-[11px] font-semibold text-[#92400E] dark:text-[#FCD34D] tabular-nums">
                  {completedSteps}/{totalSteps} etapas
                </span>
              </div>
              <div className="h-1 rounded-full bg-[#FFFBEB] dark:bg-[#3D2A0D] overflow-hidden">
                <div
                  className="h-full bg-[#F59E0B] rounded-full transition-all duration-700"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Integrations */}
          <div className="mt-3">
            <p className="text-[9px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378] mb-1.5">
              Integrações
            </p>
            <div className="flex flex-wrap gap-1.5">
              {integrations.map((i) => (
                <IntegrationPill key={i.name} name={i.name} connected={!!i.connected} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-[#FAFBFC] dark:bg-[#161922] flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            {lastActivity ? (
              <>
                {storeActivityLabel(lastActivity)} · {storeActivityRelative(lastActivity.created_at)}
              </>
            ) : isOnboarding ? (
              <>
                Aguardando briefing · {storeActivityRelative(store.created_at)}
              </>
            ) : connectedCount >= 2 ? (
              <>
                Sincronização ativa · {storeActivityRelative(store.created_at)}
              </>
            ) : (
              <>
                Aguardando configuração
              </>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 text-[12px]">
              <Settings className="h-3 w-3 mr-1" />
              Configurar
            </Button>
            {store.store_url && (
              <Button variant="secondary" size="sm" className="h-7 px-2 text-[12px]" asChild>
                <a href={store.store_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ir para loja
                </a>
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => router.push(`/admin/stores/${store.id}`)}
            >
              Abrir detalhe
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#991B1B] hover:bg-[#FEF2F2]"
              onClick={onDelete}
              title="Remover loja"
              aria-label="Remover loja"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ────────────────────────────────────────

export function ClientStores({ clientId, clientName }: ClientStoresProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const storesFilterParam = searchParams.get("stores_filter") as "all" | "active" | "onboarding" | null
  const initialFilter =
    storesFilterParam && ["all", "active", "onboarding"].includes(storesFilterParam)
      ? storesFilterParam
      : "all"

  const [stores, setStores] = useState<ClientStore[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, StoreMetrics>>({})
  const [activityMap, setActivityMap] = useState<Record<string, StoreActivity>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isMetricsLoading, setIsMetricsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteStore, setDeleteStore] = useState<ClientStore | null>(null)
  const [editStore, setEditStore] = useState<ClientStore | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "onboarding">(initialFilter)

  // Persiste filtro de lojas na URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (statusFilter === "all") params.delete("stores_filter")
    else params.set("stores_filter", statusFilter)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, pathname])

  const [form, setForm] = useState({
    name: "",
    url: "",
    platform: "Shopify",
    currency: "BRL",
  })

  useEffect(() => {
    loadStores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadStores() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/stores?client_id=${clientId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ao carregar lojas (${res.status})`)
      }
      const { stores: data } = await res.json()
      const storesList = data || []
      setStores(storesList)

      // Load store metrics from cache table
      if (storesList.length > 0) {
        loadMetrics(storesList.map((s: ClientStore) => s.id))
      }
    } catch (error) {
      console.error("Error loading stores:", error)
      const msg = error instanceof Error ? error.message : "Erro desconhecido"
      setLoadError(msg)
      toast({
        variant: "destructive",
        title: "Erro ao carregar lojas",
        description: msg,
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function loadMetrics(storeIds: string[]) {
    setIsMetricsLoading(true)
    try {
      const supabase = createBrowserClient()
      const [revenueRes, activitiesRes] = await Promise.all([
        supabase
          .from("store_revenue_summary")
          .select(
            "store_id, store_total_revenue, store_orders, klaviyo_total_revenue, total_leads, total_campaigns, total_flows, period_label",
          )
          .in("store_id", storeIds)
          .eq("period_label", "30d"),
        supabase
          .from("activities")
          .select("type, description, created_at, metadata")
          .in(
            "type",
            [
              "note_added",
              "meeting_scheduled",
              "meeting_completed",
              "report_uploaded",
              "payment_received",
              "client_updated",
              "email_sent",
            ],
          )
          .order("created_at", { ascending: false })
          .limit(200),
      ])

      const map: Record<string, StoreMetrics> = {}
      for (const row of revenueRes.data ?? []) {
        map[row.store_id] = {
          revenue30d: Number(row.store_total_revenue ?? 0),
          orders30d: Number(row.store_orders ?? 0),
          attributedRevenue30d: Number(row.klaviyo_total_revenue ?? 0),
          totalLeads: Number(row.total_leads ?? 0),
          campaigns: Number(row.total_campaigns ?? 0),
          flows: Number(row.total_flows ?? 0),
        }
      }
      setMetricsMap(map)

      // Map activities by store_id from metadata
      const actMap: Record<string, StoreActivity> = {}
      for (const a of activitiesRes.data ?? []) {
        const meta = a.metadata as Record<string, unknown> | undefined
        const storeId = meta?.store_id as string | undefined
        if (storeId && storeIds.includes(storeId) && !actMap[storeId]) {
          actMap[storeId] = {
            type: a.type,
            description: a.description,
            created_at: a.created_at,
          }
        }
      }
      setActivityMap(actMap)
    } catch (err) {
      console.error("Error loading store metrics:", err)
    } finally {
      setIsMetricsLoading(false)
    }
  }

  function openDialog(store?: ClientStore) {
    if (store) {
      setEditStore(store)
      const platformCapitalized = store.platform
        ? store.platform.charAt(0).toUpperCase() + store.platform.slice(1)
        : "Shopify"
      setForm({
        name: store.store_name,
        url: store.store_url || "",
        platform: platformCapitalized,
        currency: store.currency || "BRL",
      })
    } else {
      setEditStore(null)
      setForm({
        name: "",
        url: "",
        platform: "Shopify",
        currency: "BRL",
      })
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name) {
      toast({ variant: "destructive", title: "Nome obrigatório" })
      return
    }
    setIsSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storeData: Record<string, any> = {
        store_name: form.name,
        is_active: true,
      }
      if (form.url) storeData.store_url = form.url
      if (form.platform) storeData.platform = form.platform.toLowerCase()
      if (form.currency) storeData.currency = form.currency

      if (editStore) {
        const response = await fetch("/api/client-stores/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: editStore.id, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao atualizar")
        toast({ title: "Loja atualizada" })
        setDialogOpen(false)
        loadStores()
      } else {
        const response = await fetch("/api/client-stores/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, ...storeData }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Erro ao criar")

        fetch(`/api/admin/stores/${result.store.id}/trigger-ads-analyzer`, {
          method: "POST",
        }).catch((err) => {
          console.error("Falha ao disparar Analisador de ADS:", err)
        })

        toast({
          title: "Loja criada",
          description: "Analisador de ADS rodando em background. Configure as integrações.",
        })
        setDialogOpen(false)
        router.push(`/admin/stores/${result.store.id}?tab=settings`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      toast({ variant: "destructive", title: "Erro ao salvar", description: errorMsg })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteStore) return
    try {
      const res = await fetch(`/api/client-stores/${deleteStore.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Erro ao remover loja")
      }
      toast({ title: "Loja removida" })
      setDeleteStore(null)
      loadStores()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Não foi possível remover a loja",
      })
    }
  }

  const filteredStores = stores.filter((s) => {
    if (statusFilter === "all") return true
    if (statusFilter === "active") return s.is_active
    if (statusFilter === "onboarding") return !s.is_active
    return true
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Lojas vinculadas{" "}
            {stores.length > 0 && (
              <span className="text-gray-400 dark:text-[#5C6378] font-normal text-[14px]">
                ({stores.length})
              </span>
            )}
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            Configure lojas e integrações Klaviyo/Omnisend.
            {stores.length > 0 && (
              <>
                {" "}
                {stores.filter((s) => s.is_active).length} ativa{stores.filter((s) => s.is_active).length !== 1 ? "s" : ""} ·{" "}
                {stores.filter((s) => !s.is_active).length} em onboarding.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-0.5">
            {([
              { v: "all", l: "Todas" },
              { v: "active", l: "Ativas" },
              { v: "onboarding", l: "Onboarding" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setStatusFilter(opt.v)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-[4px] transition-colors",
                  statusFilter === opt.v
                    ? "bg-[#EEF0FB] text-[#2137B6] dark:bg-[#141C3D] dark:text-[#7B8CEA]"
                    : "text-gray-500 dark:text-[#8B92A5] hover:text-gray-900 dark:hover:text-[#EAEDF3]",
                )}
              >
                {opt.l}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadStores()} className="h-8">
            <RefreshCw className={cn("h-3.5 w-3.5", isMetricsLoading && "animate-spin")} />
          </Button>
          <Button onClick={() => openDialog()} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova Loja
          </Button>
        </div>
      </div>

      {/* Error */}
      {loadError && stores.length === 0 && (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium">Erro ao carregar lojas</h3>
            <p className="text-muted-foreground text-center mt-1">{loadError}</p>
            <Button variant="secondary" onClick={loadStores} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!loadError && filteredStores.length === 0 && stores.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma loja vinculada</h3>
            <p className="text-muted-foreground text-center mt-1">
              Adicione uma loja para {clientName} configurar integrações e acompanhar resultados
            </p>
            <Button onClick={() => openDialog()} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Loja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtered empty */}
      {!loadError && filteredStores.length === 0 && stores.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Filter className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Nenhuma loja com este filtro</p>
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="mt-2">
              Limpar filtros
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cards grid */}
      {filteredStores.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredStores.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              metrics={metricsMap[store.id]}
              lastActivity={activityMap[store.id]}
              loading={isMetricsLoading}
              onEdit={() => openDialog(store)}
              onDelete={() => setDeleteStore(store)}
            />
          ))}

          {/* Add new placeholder card */}
          <button
            onClick={() => openDialog()}
            className={cn(
              "rounded-[8px] border-2 border-dashed flex flex-col items-center justify-center py-10 px-6",
              "border-[rgba(0,0,0,0.12)] dark:border-[rgba(255,255,255,0.12)]",
              "hover:border-[#4E62D8] dark:hover:border-[#7B8CEA] transition-colors",
              "text-center group",
            )}
          >
            <div className="w-10 h-10 rounded-full bg-[#EEF0FB] dark:bg-[#141C3D] flex items-center justify-center mb-2 group-hover:bg-[#4E62D8] dark:group-hover:bg-[#7B8CEA] transition-colors">
              <Plus className="h-5 w-5 text-[#2137B6] dark:text-[#7B8CEA] group-hover:text-white" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              Vincular nova loja
            </p>
            <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-1 max-w-[280px]">
              Adicione uma nova loja Shopify, WooCommerce ou VTEX a este cliente.
            </p>
          </button>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {editStore ? "Editar Loja" : "Nova Loja"}
            </DialogTitle>
            <DialogDescription>
              Altere as informações básicas da loja
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Loja *</Label>
              <Input
                placeholder="Ex: Loja Principal"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                placeholder="https://minhaloja.com.br"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Plataforma</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                <option value="Shopify">Shopify</option>
                <option value="VTEX">VTEX</option>
                <option value="Nuvemshop">Nuvemshop</option>
                <option value="WooCommerce">WooCommerce</option>
                <option value="Magento">Magento</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Moeda</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="BRL">BRL - Real Brasileiro</option>
                <option value="USD">USD - Dólar Americano</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - Libra Esterlina</option>
                <option value="JPY">JPY - Iene Japonês</option>
                <option value="CNY">CNY - Yuan Chinês</option>
                <option value="ARS">ARS - Peso Argentino</option>
                <option value="CLP">CLP - Peso Chileno</option>
                <option value="COP">COP - Peso Colombiano</option>
                <option value="MXN">MXN - Peso Mexicano</option>
                <option value="PEN">PEN - Sol Peruano</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Moeda usada para exibir valores nos relatórios
              </p>
            </div>

            <div className="rounded-lg border bg-muted/50 p-3 flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                Para configurar credenciais (Shopify, Klaviyo, GA4), acesse a{" "}
                {editStore ? (
                  <Link
                    href={`/admin/stores/${editStore.id}?tab=settings`}
                    className="text-primary hover:underline font-medium"
                  >
                    página da loja → Configurações
                  </Link>
                ) : (
                  <span className="font-medium">página da loja → Configurações</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editStore ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteStore} onOpenChange={() => setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover loja</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a loja &quot;{deleteStore?.store_name}&quot;? As configurações de integração serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
