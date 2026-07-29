"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Store,
  Bell,
  Search,
  RefreshCw,
  X,
  Settings,
  FileText,
  Eye,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  Link2,
} from "lucide-react"
import { Icon, BrandIcon } from "@/components/ui/icon"
import { AlertBanner } from "@/components/ui/alert-banner"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ActionMenu } from "@/components/ui/action-menu"
import { CountBadge } from "@/components/ui/count-badge"
import { useToast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import { StoreOverviewGrid } from "./store-overview-grid"

// ─── Types ──────────────────────────────────────────────────

export interface StoreRow {
  id: string
  store_name: string
  client_name: string | null
  platform: string
  is_active: boolean
  has_klaviyo: boolean
  has_omnisend: boolean
  has_shopify: boolean
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  currency: string
  revenue_status: "loaded" | "no_integration" | "error"
}

interface AlertRow {
  id: string
  store_id: string
  store_name: string
  type: string
  severity: string
  title: string
  message: string
  status: string
  created_at: string
}

// ─── Formatters ─────────────────────────────────────────────

const fmtCurrency = (value: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMin < 1) return "agora"
  if (diffMin < 60) return `${diffMin}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_revenue: "Faturamento Baixo",
  klaviyo_account_error: "Erro Klaviyo",
  omnisend_account_error: "Erro Omnisend",
  campaign_failure: "Falha Campanha",
  low_recovery_rate: "Recuperação Baixa",
}

// ─── Platform icon helper ───────────────────────────────────

function PlatformIcon({ platform }: { platform: string }) {
  const p = platform?.toLowerCase()
  if (p === "shopify") return <BrandIcon src="/images/integrations/shopify.svg" alt="Shopify" size={20} />
  return <Icon icon={Store} size={16} className="text-muted-foreground" />
}

// ─── Main Component ─────────────────────────────────────────

export interface StoresPageTabsProps {
  /** Payload de /api/stores/control?page=1&per_page=15, pré-carregado pelo RSC. */
  initialStores?: {
    success: boolean
    stores: StoreRow[]
    summary?: { never: number; overdue: number }
    pagination?: { total: number }
  } | null
  /** Payload de /api/stores/alerts/summary, pré-carregado pelo RSC. */
  initialAlertsSummary?: {
    success: boolean
    summary: { total_active: number }
  } | null
}

export function StoresPageTabs({
  initialStores,
  initialAlertsSummary,
}: StoresPageTabsProps = {}) {
  const router = useRouter()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"overview" | "stores" | "alerts">("overview")
  const [activeAlertsCount, setActiveAlertsCount] = useState(
    initialAlertsSummary?.success ? initialAlertsSummary.summary.total_active : 0,
  )
  const [noFeedbackCount, setNoFeedbackCount] = useState(
    initialStores?.success && initialStores.summary
      ? initialStores.summary.never + initialStores.summary.overdue
      : 0,
  )

  // Stores state (inicializado do RSC quando disponível; primeiro fetch é
  // pulado nesse caso — paginação/busca subsequentes continuam fetchando)
  const [stores, setStores] = useState<StoreRow[]>(
    initialStores?.success ? initialStores.stores || [] : [],
  )
  const [storesLoading, setStoresLoading] = useState(!initialStores?.success)
  const [storesPage, setStoresPage] = useState(1)
  const [storesTotalItems, setStoresTotalItems] = useState(
    initialStores?.success
      ? initialStores.pagination?.total || initialStores.stores?.length || 0
      : 0,
  )
  const skipInitialStoresFetch = useRef(!!initialStores?.success)
  // Counts só são pulados se AMBOS os payloads trouxeram os campos que os
  // seeds usam (summary presente) — senão o fetch de recuperação roda como
  // antes. Constante derivada de props estáveis (RSC): safe como guard
  // inline do efeito (ao contrário de um ref consumido, sobrevive ao
  // double-invoke do Strict Mode).
  const countsSeeded =
    !!initialStores?.success &&
    !!initialStores.summary &&
    !!initialAlertsSummary?.success
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Alerts state
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)

  const perPage = 15

  // ─── Fetch stores ──────────────────────────────────────
  const fetchStores = useCallback(async () => {
    setStoresLoading(true)
    try {
      const params = new URLSearchParams({
        page: storesPage.toString(),
        per_page: perPage.toString(),
      })
      if (debouncedSearch) params.set("search", debouncedSearch)

      const res = await fetch(`/api/stores/control?${params}`)
      const data = await res.json()
      if (data.success) {
        setStores(data.stores || [])
        setStoresTotalItems(data.pagination?.total || data.stores?.length || 0)
      }
    } catch {
      toast({ title: "Erro ao carregar lojas", variant: "destructive" })
    } finally {
      setStoresLoading(false)
    }
  }, [storesPage, debouncedSearch, toast])

  // ─── Fetch alerts ──────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true)
    try {
      const res = await fetch("/api/stores/alerts?limit=200")
      const data = await res.json()
      if (data.success) {
        setAlerts(data.alerts?.filter((a: AlertRow) => a.status === "active") || [])
      }
    } catch {
      // silently fail
    } finally {
      setAlertsLoading(false)
    }
  }, [])

  // ─── Fetch counts ──────────────────────────────────────
  useEffect(() => {
    // Counts já vieram do RSC (mesmas fontes) — pula o fetch do mount.
    if (countsSeeded) return
    async function fetchCounts() {
      try {
        const [alertRes, feedbackRes] = await Promise.all([
          fetch("/api/stores/alerts/summary"),
          fetch("/api/stores/control?per_page=1"),
        ])
        const alertData = await alertRes.json()
        const feedbackData = await feedbackRes.json()
        if (alertData.success) setActiveAlertsCount(alertData.summary.total_active)
        if (feedbackData.success && feedbackData.summary) {
          setNoFeedbackCount(feedbackData.summary.never + feedbackData.summary.overdue)
        }
      } catch {
        // silently fail
      }
    }
    fetchCounts()
  }, [countsSeeded])

  useEffect(() => {
    // Primeira render com initialStores (page=1, sem busca): dados já na
    // tela — pula o fetch. Qualquer mudança de página/busca fetcha normal.
    if (skipInitialStoresFetch.current && storesPage === 1 && !debouncedSearch) {
      skipInitialStoresFetch.current = false
      return
    }
    skipInitialStoresFetch.current = false
    fetchStores()
  }, [fetchStores, storesPage, debouncedSearch])
  useEffect(() => { if (activeTab === "alerts") fetchAlerts() }, [activeTab, fetchAlerts])

  // ─── Debounced search ──────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setStoresPage(1)
    }, 300)
  }, [])

  useEffect(() => {
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [])

  // ─── Link do formulário da loja ────────────────────────
  // Busca sob demanda (não infla a listagem): se a loja ainda não tem
  // link, o POST cria o onboarding por trás e devolve um enviável.
  const copyFormLink = async (storeId: string) => {
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/form-link`)
      const link = await res.json()
      if (res.ok && link.status === "active" && link.url) {
        await navigator.clipboard.writeText(link.url)
        toast({ title: "Link copiado", description: link.url })
        return
      }

      const created = await fetch(`/api/admin/stores/${storeId}/form-link`, {
        method: "POST",
      })
      const payload = await created.json()
      if (!created.ok || !payload.link?.url) {
        toast({ title: "Não foi possível gerar o link", variant: "destructive" })
        return
      }
      await navigator.clipboard.writeText(payload.link.url)
      toast({ title: "Link gerado e copiado", description: payload.link.url })
    } catch {
      toast({ title: "Erro ao obter o link", variant: "destructive" })
    }
  }

  // ─── Handle alert actions ──────────────────────────────
  const handleAlertAction = async (alertId: string, action: "resolve" | "acknowledge") => {
    try {
      const res = await fetch(`/api/stores/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: action === "resolve" ? "Alerta resolvido" : "Alerta marcado como visto" })
        fetchAlerts()
        setActiveAlertsCount((prev) => Math.max(0, prev - 1))
      }
    } catch {
      toast({ title: "Erro", variant: "destructive" })
    }
  }

  // ─── Stores columns ───────────────────────────────────
  const storeColumns: ColumnDef<StoreRow>[] = [
    {
      accessorKey: "store_name",
      header: "Nome",
      mobilePriority: "title",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <PlatformIcon platform={row.platform} />
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{row.store_name}</p>
            {row.client_name && (
              <p className="text-xs text-muted-foreground truncate">{row.client_name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "platform",
      header: "Plataforma",
      mobilePriority: "badge",
      cell: (row) => (
        <Badge variant="neutral" showDot={false}>
          {row.platform || "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "klaviyo_revenue_30d",
      header: "Receita 30d",
      type: "currency",
      mobilePriority: "detail",
      cell: (row) => {
        if (row.revenue_status === "no_integration") return <span className="text-muted-foreground">—</span>
        if (row.revenue_status === "error") {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-[#92400E] dark:text-[#FCD34D]">
              <Icon icon={AlertTriangle} size={16} /> Erro
            </span>
          )
        }
        return (
          <span className="font-mono tabular-nums text-sm font-semibold">
            {fmtCurrency(row.klaviyo_revenue_30d, row.currency)}
          </span>
        )
      },
    },
    {
      accessorKey: "has_klaviyo",
      header: "Email",
      mobilePriority: "badge",
      cell: (row) => {
        // Considera ambas as plataformas — antes a coluna so olhava
        // has_klaviyo e marcava lojas Omnisend como "Desconectado"
        // mesmo tendo a integracao funcionando.
        const hasEmail = row.has_klaviyo || row.has_omnisend
        const platform = row.has_klaviyo ? "Klaviyo" : row.has_omnisend ? "Omnisend" : null
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={hasEmail ? "connected" : "disconnected"} />
            {platform && (
              <span className="text-[10px] text-muted-foreground/70 font-medium">
                {platform}
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      mobilePriority: "badge",
      cell: (row) => (
        <StatusBadge
          status={row.is_active ? "active" : "inactive"}
        />
      ),
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      cell: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            items={[
              { label: "Ver loja", icon: Eye, onClick: () => router.push(`/admin/stores/${row.id}`) },
              {
                label: "Copiar link do formulário",
                icon: Link2,
                onClick: () => void copyFormLink(row.id),
              },
              { label: "Configurar Klaviyo", icon: Settings, onClick: () => router.push(`/admin/stores/${row.id}?tab=integrations`) },
              { label: "Gerar Report", icon: FileText, onClick: () => router.push(`/admin/stores/${row.id}?tab=reports`) },
            ]}
          />
        </div>
      ),
    },
  ]

  // ─── Alerts columns ───────────────────────────────────
  const alertColumns: ColumnDef<AlertRow>[] = [
    {
      accessorKey: "store_name",
      header: "Loja",
      mobilePriority: "title",
      cell: (row) => (
        <p className="font-medium text-sm">{row.store_name || "N/A"}</p>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      mobilePriority: "badge",
      cell: (row) => (
        <Badge variant="neutral" showDot={false}>
          {ALERT_TYPE_LABELS[row.type] || row.type}
        </Badge>
      ),
    },
    {
      accessorKey: "message",
      header: "Mensagem",
      mobilePriority: "detail",
      cell: (row) => (
        <p className="text-sm text-muted-foreground truncate max-w-[300px]">{row.message}</p>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Data",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-xs text-muted-foreground font-mono tabular-nums">
          {timeAgo(row.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      cell: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => handleAlertAction(row.id, "resolve")}>
            <Icon icon={CheckCircle2} size={16} className="mr-1" />
            Resolver
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleAlertAction(row.id, "acknowledge")}>
            <Icon icon={Eye} size={16} className="mr-1" />
            Ignorar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {noFeedbackCount > 0 && (
        <AlertBanner
          variant="warning"
          title="Lojas sem feedback agendado"
          description="Agende calls de feedback para manter a saúde dos clientes"
          action={{ label: "Ver lojas", href: "/admin/stores" }}
        />
      )}

      {/* SegmentedTabs: Lojas | Alertas */}
      <div className="flex items-center justify-between gap-4">
        <SegmentedTabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "stores" | "alerts")}>
          <SegmentedTabItem value="overview">
            <Icon icon={LayoutGrid} size={16} className="mr-1.5" />
            Overview
          </SegmentedTabItem>
          <SegmentedTabItem value="stores">
            <Icon icon={Store} size={16} className="mr-1.5" />
            Lojas
          </SegmentedTabItem>
          <SegmentedTabItem value="alerts">
            <Icon icon={Bell} size={16} className="mr-1.5" />
            Alertas
            {activeAlertsCount > 0 && (
              <CountBadge count={activeAlertsCount} active className="ml-1.5" />
            )}
          </SegmentedTabItem>
        </SegmentedTabs>

        {activeTab === "stores" && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar loja..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9 w-[220px] bg-card"
              />
              {searchInput && (
                <button
                  onClick={() => { handleSearchChange(""); setSearchInput("") }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={fetchStores}
              disabled={storesLoading}
              className="h-9 w-9"
            >
              <Icon icon={RefreshCw} size={16} className={cn(storesLoading && "animate-spin")} />
            </Button>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "overview" ? (
        <StoreOverviewGrid />
      ) : activeTab === "stores" ? (
        <DataTable
          columns={storeColumns}
          data={stores}
          loading={storesLoading}
          onRowClick={(row) => router.push(`/admin/stores/${row.id}`)}
          emptyMessage="Nenhuma loja encontrada"
          emptyDescription="Cadastre lojas nos clientes para vê-las aqui"
          rowKey="id"
          pagination={{
            page: storesPage,
            pageSize: perPage,
            total: storesTotalItems,
            onPageChange: setStoresPage,
          }}
        />
      ) : (
        <DataTable
          columns={alertColumns}
          data={alerts}
          loading={alertsLoading}
          emptyMessage="Nenhum alerta ativo"
          emptyDescription="Todas as lojas estão saudáveis"
          rowKey="id"
        />
      )}
    </div>
  )
}
