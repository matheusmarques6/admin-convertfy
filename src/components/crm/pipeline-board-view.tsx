"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { useRealtimePipeline } from "@/hooks/use-realtime-pipeline"
import {
  Plus,
  ChevronDown,
  Search,
  X,
  Settings,
  LayoutGrid,
  List,
  Download,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { CrmEmptyState } from "./crm-empty-state"
import { KanbanBoard, type KanbanStage } from "./kanban-board"
import { StateBoard } from "./state-board"
import { DealDrawer } from "./deal-drawer"
import { OnboardingCard, type OnboardingCardData } from "./onboarding-card"
import { PipelineFiltersPanel } from "./pipeline-filters-panel"
import { NewDealDialog } from "./new-deal-dialog"
import { LostReasonDialog } from "./lost-reason-dialog"
import { MoveDealPipelineDialog } from "./move-deal-pipeline-dialog"
import { PipelineSettingsDialog } from "./pipeline-settings-dialog"
import {
  PipelineFiltersBar,
  ActiveFiltersChips,
  type PipelineFilters,
  type SortOrder,
  EMPTY_FILTERS,
  applyFiltersAndSort,
} from "./pipeline-filters-bar"
import { DealsTable } from "./deals-table"
import { DealsBulkBar } from "./deals-bulk-bar"
import { SavedViewsMenu, type SavedView } from "./saved-views-menu"
import {
  pruneSelection,
  resolveSelection,
  toggleSelectAll,
  type TableSort,
} from "./deals-table-utils"
import { csvDate, csvNumber, downloadCsv, toCsv } from "@/lib/services/crm-csv"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Extrai a mensagem do shape de erro da API ({ error: string | { message } }). */
async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  const raw = body?.error
  return (
    (typeof raw === "string" ? raw : (raw as { message?: string } | null)?.message) ??
    res.statusText
  )
}

interface PipelineDetailResponse {
  pipeline: {
    id: string
    name: string
    description: string | null
    scope: string
    color: string | null
    layout: string | null
    is_default?: boolean
    is_favorite?: boolean
    category?: string | null
    stages: Array<KanbanStage & {
      order?: number
      description?: string | null
    }>
  }
  deals: Array<{
    id: string
    pipeline_id: string
    stage_id: string
    title: string
    value: number | null
    currency: string | null
    probability: number | null
    status: string
    source: string | null
    tags: string[] | null
    position: number
    last_stage_changed_at: string | null
    created_at?: string | null
    owner?: { id: string; name: string; avatar_url: string | null } | null
    client?: { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null } | null
    store?: { id: string; name: string } | null
  }>
}

interface PipelineBoardViewProps {
  pipelineId: string
  scope: "sales" | "cs"
  /**
   * Acoes customizadas renderizadas no header da pipeline, ANTES do
   * botao "+ Novo deal". Util pra adicionar acoes especificas por
   * pipeline (ex: "Sincronizar carteira" so na Gestao de Carteira).
   */
  headerExtras?: React.ReactNode
}

export function PipelineBoardView({
  pipelineId,
  scope: _scope,
  headerExtras,
}: PipelineBoardViewProps) {
  const { data, isLoading, mutate } = useSWR<PipelineDetailResponse>(
    `/api/crm/pipelines/${pipelineId}`,
    fetcher,
  )

  const searchParams = useSearchParams()
  const [activeDealId, setActiveDealId] = useState<string | null>(null)
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null)
  const [transferDealId, setTransferDealId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<string>("")
  const [advancedFilters, setAdvancedFilters] = useState<PipelineFilters>(EMPTY_FILTERS)
  const [sortOrder, setSortOrder] = useState<SortOrder>("moved_desc")
  const [editingStage, setEditingStage] = useState<{
    id: string
    name: string
    color: string | null
  } | null>(null)
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null)

  // Auto-dismiss toast em 3s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const [search, setSearch] = useState("")
  // Filtro temporal estilo DataCrazy: pills inline acima do board.
  // "all" = sem filtro · "today" = criados hoje · "7d/30d/90d" =
  // criados nos ultimos N dias.
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "7d" | "30d" | "90d">("all")
  const [pendingLostMove, setPendingLostMove] = useState<{
    dealId: string
    stageId: string
    position: number
  } | null>(null)

  // ── Visão de tabela, seleção múltipla e visões salvas ───────────
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban")
  const [tableSort, setTableSort] = useState<TableSort>({
    column: "next_step",
    direction: "asc",
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [viewsBusy, setViewsBusy] = useState(false)

  // A escolha kanban/tabela é preferência de quem usa, por pipeline —
  // gestor vive na tabela, vendedor no kanban.
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(`crm:view-mode:${pipelineId}`)
    setViewMode(saved === "table" ? "table" : "kanban")
    setSelected(new Set())
    setActiveViewId(null)
  }, [pipelineId])

  const changeViewMode = useCallback(
    (next: "kanban" | "table") => {
      setViewMode(next)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`crm:view-mode:${pipelineId}`, next)
      }
    },
    [pipelineId],
  )

  const { data: viewsData, mutate: mutateViews } = useSWR<{
    views: SavedView[]
  }>(`/api/crm/saved-views?pipeline_id=${pipelineId}&scope=sales`, fetcher, {
    revalidateOnFocus: false,
  })
  const savedViews = useMemo(() => viewsData?.views ?? [], [viewsData])

  useEffect(() => {
    const dealParam = searchParams.get("deal")
    if (dealParam) setActiveDealId(dealParam)
  }, [searchParams])

  // Realtime: reflete leads novos e movimentações feitas por outros
  // usuários/automações/webhooks sem exigir refresh manual.
  const handleRealtimeUpdate = useCallback(() => {
    mutate()
  }, [mutate])
  const handleNewDeal = useCallback((deal: Record<string, unknown>) => {
    const title = typeof deal.title === "string" ? deal.title : "Novo lead"
    setToast({ kind: "success", msg: `Novo deal: ${title}` })
  }, [])
  const { realtimeConnected } = useRealtimePipeline({
    pipelineId,
    onDataUpdate: handleRealtimeUpdate,
    onNewDeal: handleNewDeal,
  })

  const pipeline = data?.pipeline
  const allDeals = useMemo(() => data?.deals || [], [data])

  const owners = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const d of allDeals) {
      if (d.owner) seen.set(d.owner.id, { id: d.owner.id, name: d.owner.name })
    }
    return Array.from(seen.values())
  }, [allDeals])

  const filteredDeals = useMemo(() => {
    let list = allDeals
    if (ownerFilter) list = list.filter((d) => d.owner?.id === ownerFilter)

    // Filtro temporal por created_at (quando disponivel). Usa cutoff
    // em dias relativo a agora.
    if (periodFilter !== "all") {
      const days =
        periodFilter === "today"
          ? 1
          : periodFilter === "7d"
            ? 7
            : periodFilter === "30d"
              ? 30
              : 90
      const cutoff = Date.now() - days * 86400000
      list = list.filter((d) => {
        const ts = d.created_at ? new Date(d.created_at).getTime() : NaN
        return Number.isFinite(ts) ? ts >= cutoff : true
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.client?.name?.toLowerCase().includes(q) ||
        d.tags?.some((t) => t.toLowerCase().includes(q)) ||
        d.source?.toLowerCase().includes(q),
      )
    }
    // Aplica filtros avancados + ordenacao
    return applyFiltersAndSort(list, advancedFilters, sortOrder)
  }, [allDeals, ownerFilter, periodFilter, search, advancedFilters, sortOrder])

  // ── Seleção múltipla ────────────────────────────────────────────
  const visibleIds = useMemo(() => filteredDeals.map((d) => d.id), [filteredDeals])

  // Filtrar depois de selecionar não pode deixar deal fora da tela na
  // seleção — a ação em massa acertaria quem o usuário não vê.
  useEffect(() => {
    setSelected((cur) => pruneSelection(cur, visibleIds))
  }, [visibleIds])

  const handleToggleRow = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((cur) => {
        const r = resolveSelection({
          selected: cur,
          visibleIds,
          clickedId: id,
          shiftKey,
          anchorId: selectionAnchor,
        })
        setSelectionAnchor(r.anchorId)
        return r.selected
      })
    },
    [visibleIds, selectionAnchor],
  )

  const handleToggleAll = useCallback(() => {
    setSelected((cur) => toggleSelectAll(cur, visibleIds))
  }, [visibleIds])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setSelectionAnchor(null)
  }, [])

  const runBulk = useCallback(
    async (body: Record<string, unknown>, successMsg: (n: number) => string) => {
      if (selected.size === 0) return
      setBulkBusy(true)
      try {
        const res = await fetch("/api/crm/deals/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, ids: Array.from(selected) }),
        })
        const json = (await res.json().catch(() => null)) as
          | { updated?: number; error?: unknown }
          | null
        if (!res.ok) {
          const raw = json?.error
          setToast({
            kind: "error",
            msg:
              (typeof raw === "string"
                ? raw
                : (raw as { message?: string } | undefined)?.message) ??
              "Não foi possível aplicar a ação.",
          })
          return
        }
        setToast({ kind: "success", msg: successMsg(json?.updated ?? selected.size) })
        clearSelection()
        mutate()
      } finally {
        setBulkBusy(false)
      }
    },
    [selected, clearSelection, mutate],
  )

  // ── Visões salvas ───────────────────────────────────────────────
  const currentSort = viewMode === "table" ? `table:${tableSort.column}:${tableSort.direction}` : sortOrder

  const hasActiveFilter = useMemo(
    () =>
      JSON.stringify(advancedFilters) !== JSON.stringify(EMPTY_FILTERS) ||
      sortOrder !== "moved_desc" ||
      !!ownerFilter ||
      periodFilter !== "all",
    [advancedFilters, sortOrder, ownerFilter, periodFilter],
  )

  const activeView = useMemo(
    () => savedViews.find((v) => v.id === activeViewId) ?? null,
    [savedViews, activeViewId],
  )

  const viewIsDirty = useMemo(() => {
    if (!activeView) return false
    return (
      JSON.stringify(activeView.filters ?? {}) !== JSON.stringify(advancedFilters) ||
      activeView.sort !== currentSort ||
      activeView.view_mode !== viewMode
    )
  }, [activeView, advancedFilters, currentSort, viewMode])

  const applyView = useCallback(
    (view: SavedView) => {
      const f = view.filters as Partial<PipelineFilters> | null
      setAdvancedFilters({ ...EMPTY_FILTERS, ...(f ?? {}) })
      if (view.sort?.startsWith("table:")) {
        const [, column, direction] = view.sort.split(":")
        setTableSort({
          column: (column || "next_step") as TableSort["column"],
          direction: direction === "desc" ? "desc" : "asc",
        })
      } else if (view.sort) {
        setSortOrder(view.sort as SortOrder)
      }
      changeViewMode(view.view_mode)
      setActiveViewId(view.id)
      clearSelection()
    },
    [changeViewMode, clearSelection],
  )

  const saveView = useCallback(
    async (name: string, isShared: boolean) => {
      setViewsBusy(true)
      try {
        const res = await fetch("/api/crm/saved-views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            pipeline_id: pipelineId,
            scope: "sales",
            filters: advancedFilters,
            sort: currentSort,
            view_mode: viewMode,
            is_shared: isShared,
          }),
        })
        const json = (await res.json().catch(() => null)) as
          | { view?: SavedView; error?: unknown }
          | null
        if (!res.ok) {
          const raw = json?.error
          setToast({
            kind: "error",
            msg:
              (typeof raw === "string"
                ? raw
                : (raw as { message?: string } | undefined)?.message) ??
              "Não foi possível salvar a visão.",
          })
          return
        }
        if (json?.view) setActiveViewId(json.view.id)
        setToast({ kind: "success", msg: `Visão "${name}" salva` })
        mutateViews()
      } finally {
        setViewsBusy(false)
      }
    },
    [advancedFilters, currentSort, viewMode, pipelineId, mutateViews],
  )

  const updateView = useCallback(
    async (view: SavedView) => {
      setViewsBusy(true)
      try {
        const res = await fetch(`/api/crm/saved-views/${view.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: advancedFilters,
            sort: currentSort,
            view_mode: viewMode,
          }),
        })
        if (!res.ok) {
          setToast({ kind: "error", msg: "Não foi possível atualizar a visão." })
          return
        }
        setToast({ kind: "success", msg: `Visão "${view.name}" atualizada` })
        mutateViews()
      } finally {
        setViewsBusy(false)
      }
    },
    [advancedFilters, currentSort, viewMode, mutateViews],
  )

  const deleteView = useCallback(
    async (view: SavedView) => {
      setViewsBusy(true)
      try {
        const res = await fetch(`/api/crm/saved-views/${view.id}`, { method: "DELETE" })
        if (!res.ok) {
          setToast({ kind: "error", msg: "Não foi possível excluir a visão." })
          return
        }
        if (activeViewId === view.id) setActiveViewId(null)
        mutateViews()
      } finally {
        setViewsBusy(false)
      }
    },
    [activeViewId, mutateViews],
  )

  // Opcoes disponiveis pros filtros (computadas do conjunto de deals)
  const filterOptions = useMemo(() => {
    const tagsSet = new Set<string>()
    const sourcesSet = new Set<string>()
    const ownersMap = new Map<string, string>()
    const reasonsSet = new Set<string>()
    const countsByTag: Record<string, number> = {}
    const countsBySource: Record<string, number> = {}
    const countsByOwner: Record<string, number> = {}
    const countsByStatus: Record<string, number> = {}
    for (const d of allDeals) {
      d.tags?.forEach((t) => {
        if (!t) return
        tagsSet.add(t)
        countsByTag[t] = (countsByTag[t] ?? 0) + 1
      })
      if (d.source) {
        sourcesSet.add(d.source)
        countsBySource[d.source] = (countsBySource[d.source] ?? 0) + 1
      }
      if (d.owner?.id) {
        ownersMap.set(d.owner.id, d.owner.name)
        countsByOwner[d.owner.id] = (countsByOwner[d.owner.id] ?? 0) + 1
      }
      if (d.status) {
        countsByStatus[d.status] = (countsByStatus[d.status] ?? 0) + 1
      }
      const dl = (d as unknown as { lost_reason?: string }).lost_reason
      if (dl) reasonsSet.add(dl)
    }
    return {
      tags: Array.from(tagsSet).sort(),
      sources: Array.from(sourcesSet).sort(),
      owners: Array.from(ownersMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      lostReasons: Array.from(reasonsSet).sort(),
      countsByTag,
      countsBySource,
      countsByOwner,
      countsByStatus,
    }
  }, [allDeals])

  // Identifica won/lost stage default — usado pelos quick actions do card
  const wonStage = pipeline?.stages.find((s) => s.stage_type === "won")
  const lostStages = pipeline?.stages.filter((s) => s.stage_type === "lost") || []
  const defaultLostStage = lostStages[0]

  // KPIs do header sticky

  const handleMove = async (
    dealId: string,
    toStageId: string,
    toPosition: number,
  ) => {
    const targetStage = pipeline?.stages.find((s) => s.id === toStageId)
    if (targetStage?.stage_type === "lost") {
      setPendingLostMove({ dealId, stageId: toStageId, position: toPosition })
      throw new Error("Aguardando razao da perda")
    }

    const res = await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: toStageId, position: toPosition }),
    })
    if (!res.ok) {
      // O board reverte o card no throw — sem o toast a reversão é
      // silenciosa e parece bug de drag em vez de erro do servidor.
      const msg = await readApiError(res)
      setToast({ kind: "error", msg: `Falha ao mover: ${msg}` })
      throw new Error(`Falha ao mover deal: ${msg}`)
    }
    await mutate()
  }

  const confirmLostMove = async (reason: string, comment: string) => {
    if (!pendingLostMove) return
    const { dealId, stageId, position } = pendingLostMove
    setPendingLostMove(null)
    const res = await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage_id: stageId,
        position,
        lost_reason: comment ? `${reason} — ${comment}` : reason,
      }),
    })
    if (!res.ok) {
      setToast({
        kind: "error",
        msg: `Falha ao marcar como perdido: ${await readApiError(res)}`,
      })
      return
    }
    await mutate()
  }

  // Quick actions do card
  const handleQuickWin = async (dealId: string) => {
    if (!wonStage) return
    const res = await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: wonStage.id, position: 10 }),
    })
    if (!res.ok) {
      setToast({
        kind: "error",
        msg: `Falha ao marcar como ganho: ${await readApiError(res)}`,
      })
      return
    }
    setToast({ kind: "success", msg: "Negócio marcado como ganho." })
    await mutate()
  }

  const handleQuickLose = (dealId: string) => {
    if (!defaultLostStage) return
    // Abre o dialog de razao em vez de mover direto
    setPendingLostMove({
      dealId,
      stageId: defaultLostStage.id,
      position: 10,
    })
  }

  // Exporta os negócios FILTRADOS (o que está na tela) — client-side,
  // os dados já estão aqui. Separador ; + BOM = abre certo no Excel BR.
  const exportDealsCsv = () => {
    const stageName = new Map((pipeline?.stages ?? []).map((s) => [s.id, s.name]))
    const rows = filteredDeals.map((d) => [
      d.title,
      stageName.get(d.stage_id) ?? "",
      csvNumber(d.value),
      d.status,
      d.owner?.name ?? "",
      d.client?.name ?? "",
      (d.tags ?? []).join(", "),
      d.source ?? "",
      csvDate(d.created_at ?? null),
      csvDate(d.last_stage_changed_at),
    ])
    const csv = toCsv(
      ["Negócio", "Etapa", "Valor", "Status", "Responsável", "Cliente", "Tags", "Origem", "Criado em", "Última mudança de etapa"],
      rows,
    )
    downloadCsv(
      `negocios-${(pipeline?.name ?? "pipeline").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    )
    setToast({ kind: "success", msg: `${rows.length} negócios exportados.` })
  }

  const handleDuplicate = async (dealId: string) => {
    const res = await fetch(`/api/crm/deals/${dealId}/duplicate`, { method: "POST" })
    if (!res.ok) {
      setToast({ kind: "error", msg: `Falha ao duplicar: ${await readApiError(res)}` })
      return
    }
    setToast({ kind: "success", msg: "Negócio duplicado na mesma etapa." })
    await mutate()
  }

  const handleDelete = async (dealId: string) => {
    const ok = window.confirm(
      "Excluir este deal? Esta acao nao pode ser desfeita.",
    )
    if (!ok) return
    const res = await fetch(`/api/crm/deals/${dealId}`, { method: "DELETE" })
    if (res.ok) {
      // Se o drawer estava aberto pra esse deal, fecha
      if (activeDealId === dealId) setActiveDealId(null)
      await mutate()
    } else {
      window.alert("Falha ao excluir o deal.")
    }
  }

  const handleEditStage = (stage: { id: string; name: string; color?: string | null }) => {
    // Abre dialog modal (sem prompt feio do browser)
    setEditingStage({
      id: stage.id,
      name: stage.name,
      color: stage.color ?? null,
    })
  }

  const submitEditStage = async (name: string, color: string | null) => {
    if (!pipeline || !editingStage) return
    const res = await fetch(
      `/api/crm/pipelines/${pipeline.id}/stages/${editingStage.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      },
    )
    if (res.ok) {
      setEditingStage(null)
      setToast({ kind: "success", msg: `Etapa "${name}" atualizada.` })
      await mutate()
    } else {
      const body = await res.json().catch(() => ({}))
      setToast({
        kind: "error",
        msg: `Falha ao editar: ${body.error?.message ?? body.error ?? res.statusText}`,
      })
    }
  }

  const handleDeleteStage = async (stage: { id: string; name: string }) => {
    if (!pipeline) return
    // Conta deals nessa stage pra avisar usuario
    const dealsInStage = filteredDeals.filter((d) => d.stage_id === stage.id)
    const aviso =
      dealsInStage.length > 0
        ? `A etapa "${stage.name}" tem ${dealsInStage.length} deal(s). Mova-os antes de excluir.\n\nDeseja continuar mesmo assim? Os deals serao movidos pra primeira etapa.`
        : `Excluir a etapa "${stage.name}"? Esta acao nao pode ser desfeita.`
    if (!window.confirm(aviso)) return
    const res = await fetch(
      `/api/crm/pipelines/${pipeline.id}/stages/${stage.id}`,
      { method: "DELETE" },
    )
    if (res.ok) {
      setToast({ kind: "success", msg: `Etapa "${stage.name}" excluída.` })
      await mutate()
    } else {
      const body = await res.json().catch(() => ({}))
      setToast({
        kind: "error",
        msg: `Falha ao excluir: ${body.error?.message ?? body.error ?? res.statusText}`,
      })
    }
  }

  // KPIs do header (Convertfy DS V2)
  const totalDeals = filteredDeals.length
  const wonCount = filteredDeals.filter((d) => d.status === "won").length
  const openCount = totalDeals - wonCount
  const totalValue = filteredDeals
    .filter((d) => d.status === "open")
    .reduce((s, d) => s + (d.value || 0), 0)
  const atRiskCount = filteredDeals.filter((d) => {
    const stage = pipeline?.stages.find((s) => s.id === d.stage_id)
    const slaDays = stage?.sla_hours ? Math.ceil(stage.sla_hours / 24) : null
    if (slaDays == null) return false
    const days = d.last_stage_changed_at
      ? Math.floor((Date.now() - new Date(d.last_stage_changed_at).getTime()) / 86400000)
      : 0
    return days > slaDays
  }).length
  const fmtBRLCompact = (v: number): string => {
    if (v >= 1_000_000) return "R$ " + (v / 1_000_000).toFixed(1).replace(".", ",") + "M"
    if (v >= 1_000) return "R$ " + Math.round(v / 1_000) + "k"
    return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {isLoading ? (
        <PipelineSkeleton />
      ) : !pipeline ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <CrmEmptyState
            title="Pipeline nao encontrado"
            description="O pipeline pode ter sido arquivado ou voce nao tem acesso."
          />
        </div>
      ) : pipeline.stages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <CrmEmptyState
            title="Pipeline sem estagios"
            description="Configure os estagios deste pipeline antes de criar deals."
          />
        </div>
      ) : (
        <>
          {/* ═══════════ HEADER V2 ═══════════
              Title + dot + fav star + descricao inline.
              Subtitle com 3 KPI stats inline.
              Actions: Novo deal + dots menu. */}
          <div
            className="shrink-0 px-4 md:px-8 pt-4 md:pt-5 pb-3 md:pb-4"
            style={{
              background: "var(--crm-gray-0)",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {/* Titulo */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: pipeline.color ?? "var(--crm-gray-700)" }}
                  />
                  <h1
                    className="m-0 truncate"
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: "var(--crm-gray-900)",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {pipeline.name}
                  </h1>
                  {pipeline.is_favorite && (
                    <span style={{ color: "var(--crm-amber)", fontSize: 14 }}>
                      ★
                    </span>
                  )}
                  <span
                    title={
                      realtimeConnected
                        ? "Atualização em tempo real ativa"
                        : "Tempo real reconectando — atualizando periodicamente"
                    }
                    aria-label={
                      realtimeConnected ? "Tempo real ativo" : "Tempo real reconectando"
                    }
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      flexShrink: 0,
                      backgroundColor: realtimeConnected
                        ? "var(--crm-success, #16a34a)"
                        : "var(--crm-gray-300)",
                      boxShadow: realtimeConnected
                        ? "0 0 0 3px rgba(22,163,74,0.15)"
                        : "none",
                    }}
                  />
                  {pipeline.description && (
                    <>
                      <span style={{ fontSize: 13, color: "var(--crm-gray-300)" }}>
                        ·
                      </span>
                      <span
                        className="truncate"
                        style={{
                          fontSize: 13,
                          color: "var(--crm-gray-500)",
                        }}
                      >
                        {pipeline.description}
                      </span>
                    </>
                  )}
                </div>

                {/* Subtitle stats KPI */}
                <div
                  className="flex items-center gap-2 flex-wrap"
                  style={{ marginTop: 6, fontSize: 13 }}
                >
                  <span style={{ color: "var(--crm-gray-500)" }}>
                    <span
                      className="crm-tnum"
                      style={{
                        color: "var(--crm-gray-900)",
                        fontWeight: 600,
                      }}
                    >
                      {openCount}
                    </span>{" "}
                    deals abertos
                  </span>
                  <span style={{ color: "var(--crm-gray-300)" }}>·</span>
                  <span style={{ color: "var(--crm-gray-500)" }}>
                    <span
                      className="crm-tnum"
                      style={{
                        color: "var(--crm-gray-900)",
                        fontWeight: 600,
                      }}
                    >
                      {fmtBRLCompact(totalValue)}
                    </span>{" "}
                    em pipe
                  </span>
                  {atRiskCount > 0 && (
                    <>
                      <span style={{ color: "var(--crm-gray-300)" }}>·</span>
                      <span style={{ color: "var(--crm-warn)" }}>
                        <span
                          className="crm-tnum"
                          style={{ fontWeight: 600 }}
                        >
                          {atRiskCount}
                        </span>{" "}
                        precisam atenção
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {headerExtras}
                <button
                  onClick={() => setNewDealStageId(pipeline?.stages?.[0]?.id || null)}
                  disabled={!pipeline}
                  className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px] transition-colors"
                  style={{
                    height: 34,
                    padding: "0 14px",
                    background: "var(--crm-brand)",
                    color: "var(--crm-brand-fg)",
                    fontSize: 13,
                    fontWeight: 500,
                    border: 0,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-brand-hover)"))}
                  onMouseLeave={(e) => ((e.currentTarget.style.background = "var(--crm-brand)"))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Novo deal
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  disabled={!pipeline}
                  className="cf-focusable flex items-center justify-center rounded-[6px]"
                  style={{
                    width: 34,
                    height: 34,
                    background: "var(--crm-gray-0)",
                    border: "1px solid var(--crm-border)",
                    color: "var(--crm-gray-600)",
                  }}
                  title="Configurar pipeline"
                  aria-label="Configurar pipeline"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ═══════════ FILTER ROW V2 ═══════════ */}
          <div
            className="shrink-0 flex items-center justify-between gap-3 flex-wrap px-4 md:px-8 py-3 md:py-3.5"
            style={{
              background: "var(--crm-gray-0)",
              borderBottom: "1px solid var(--crm-border)",
            }}
          >
            {/* Pills temporais */}
            {pipeline.layout !== "state" && (
              <div
                className="flex gap-1"
                role="tablist"
                aria-label="Filtrar por periodo"
              >
                {(
                  [
                    { id: "all", label: "Tudo" },
                    { id: "today", label: "Hoje" },
                    { id: "7d", label: "7d" },
                    { id: "30d", label: "30d" },
                    { id: "90d", label: "90d" },
                  ] as const
                ).map((p) => {
                  const active = periodFilter === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPeriodFilter(p.id)}
                      className="cf-focusable transition-colors"
                      style={{
                        height: 30,
                        padding: "0 12px",
                        borderRadius: 6,
                        background: active ? "var(--crm-blue-50)" : "transparent",
                        color: active ? "var(--crm-brand)" : "var(--crm-gray-600)",
                        border: active
                          ? "1px solid var(--crm-blue-100)"
                          : "1px solid transparent",
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        fontFamily: "var(--crm-font-sans)",
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Search + Filtros + Ordenar */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {pipeline.layout !== "state" && (
                <div className="relative" style={{ width: 260 }}>
                  <Search
                    className="absolute h-3.5 w-3.5 pointer-events-none"
                    style={{
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--crm-gray-400)",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Buscar lead, empresa, tag..."
                    aria-label="Buscar deals"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full outline-none"
                    style={{
                      height: 32,
                      padding: "0 32px 0 30px",
                      fontSize: 13,
                      border: "1px solid var(--crm-border)",
                      borderRadius: 6,
                      background: "var(--crm-gray-0)",
                      color: "var(--crm-gray-700)",
                      fontFamily: "var(--crm-font-sans)",
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Limpar busca"
                      className="absolute"
                      style={{
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--crm-gray-400)",
                        background: "transparent",
                        border: 0,
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Owner filter */}
              {owners.length > 1 && (
                <div className="relative">
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    className="appearance-none cursor-pointer"
                    style={{
                      height: 32,
                      paddingLeft: 12,
                      paddingRight: 28,
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 6,
                      background: "var(--crm-gray-0)",
                      color: "var(--crm-gray-700)",
                      border: "1px solid var(--crm-border)",
                      fontFamily: "var(--crm-font-sans)",
                    }}
                  >
                    <option value="">Todos owners</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute h-3 w-3 pointer-events-none"
                    style={{
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--crm-gray-400)",
                    }}
                  />
                </div>
              )}

              {pipeline.layout !== "state" && (
                <>
                  <PipelineFiltersBar
                    filters={advancedFilters}
                    onFiltersChange={setAdvancedFilters}
                    sort={sortOrder}
                    onSortChange={setSortOrder}
                    availableTags={filterOptions.tags}
                    availableSources={filterOptions.sources}
                    availableOwners={filterOptions.owners}
                    availableLostReasons={filterOptions.lostReasons}
                    onOpenFiltersPanel={() => setFiltersPanelOpen(true)}
                  />

                  <SavedViewsMenu
                    views={savedViews}
                    activeViewId={activeViewId}
                    isDirty={viewIsDirty}
                    canSave={hasActiveFilter || viewMode === "table"}
                    busy={viewsBusy}
                    onApply={applyView}
                    onCreate={saveView}
                    onUpdate={updateView}
                    onDelete={deleteView}
                    onClearActive={() => setActiveViewId(null)}
                  />

                  <button
                    type="button"
                    onClick={exportDealsCsv}
                    title="Exportar os negócios filtrados para planilha (CSV)"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-black/10 bg-white px-2.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-[#1A1D27] dark:text-[#C9CEDA] dark:hover:bg-white/[0.06]"
                  >
                    <Icon icon={Download} customSize={13} />
                    Exportar
                  </button>

                  {/* Kanban responde "como está o funil"; tabela responde
                      "quais negócios, ordenados por quê". */}
                  <div
                    className="inline-flex shrink-0 items-center rounded-[6px] border border-black/10 bg-white p-0.5 dark:border-white/10 dark:bg-[#1A1D27]"
                    role="group"
                    aria-label="Modo de visualização"
                  >
                    {(
                      [
                        { mode: "kanban" as const, icon: LayoutGrid, label: "Kanban" },
                        { mode: "table" as const, icon: List, label: "Tabela" },
                      ]
                    ).map(({ mode, icon, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => changeViewMode(mode)}
                        aria-pressed={viewMode === mode}
                        title={label}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[12px] font-medium transition-colors",
                          viewMode === mode
                            ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
                            : "text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/80",
                        )}
                      >
                        <Icon icon={icon} size={16} />
                        <span className="hidden lg:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Chips de filtros avancados ativos (clica X pra remover) */}
          {pipeline.layout !== "state" && (
            <ActiveFiltersChips
              filters={advancedFilters}
              onFiltersChange={setAdvancedFilters}
              ownersLookup={
                new Map(filterOptions.owners.map((o) => [o.id, o.name]))
              }
            />
          )}

          {/* Linha 2: barra de filtros ativos — so aparece quando ha filtro */}
          {pipeline.layout !== "state" && (search || ownerFilter || periodFilter !== "all") && (
            <div className="flex items-center justify-between gap-3 px-5 py-1.5 bg-slate-50/60 dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04]">
              <span
                className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums"
                aria-live="polite"
              >
                {filteredDeals.length}{" "}
                {filteredDeals.length === 1 ? "negocio" : "negocios"} ·{" "}
                {[
                  search && `busca: "${search}"`,
                  ownerFilter && "owner",
                  periodFilter !== "all" && `periodo: ${periodFilter}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                onClick={() => {
                  setSearch("")
                  setOwnerFilter("")
                  setPeriodFilter("all")
                }}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {/* ═══════════ BOARD ═══════════ */}
          <div className="flex-1 min-h-0">
            {pipeline.layout === "state" ? (
              <StateBoard
                stages={pipeline.stages}
                deals={filteredDeals}
                onMove={async (dealId, toStageId) => {
                  await handleMove(dealId, toStageId, 10)
                }}
                onCardClick={(id) => setActiveDealId(id)}
              />
            ) : viewMode === "table" ? (
              <DealsTable
                deals={filteredDeals}
                stages={pipeline.stages}
                sort={tableSort}
                onSortChange={setTableSort}
                selected={selected}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
                onRowClick={(id) => setActiveDealId(id)}
              />
            ) : (
              <KanbanBoard
                stages={pipeline.stages}
                deals={filteredDeals}
                onMove={handleMove}
                onCardClick={(id) => setActiveDealId(id)}
                onAddDeal={(stageId) => setNewDealStageId(stageId)}
                onWinDeal={wonStage ? handleQuickWin : undefined}
                onLoseDeal={defaultLostStage ? handleQuickLose : undefined}
                onMoveDeal={(id) => setActiveDealId(id)}
                onTransferDeal={(id) => setTransferDealId(id)}
                onAddActivity={(id) => setActiveDealId(id)}
                onDuplicateDeal={handleDuplicate}
                onDeleteDeal={handleDelete}
                onEditStage={handleEditStage}
                onDeleteStage={handleDeleteStage}
                renderCard={
                  pipeline.scope === "cs"
                    ? (deal, ctx) => {
                        // Adapta o deal para o formato OnboardingCardData;
                        // dados extras (status_sentence, tasks_done, tasks_total)
                        // viriam de custom_fields ou estado derivado.
                        const stages = pipeline.stages
                        const currentIdx = stages.findIndex(
                          (s) => s.id === deal.stage_id,
                        )
                        const store: OnboardingCardData = {
                          id: deal.id,
                          title: deal.title,
                          status: deal.status,
                          tags: deal.tags,
                          last_stage_changed_at: deal.last_stage_changed_at,
                          created_at: deal.created_at,
                          owner: deal.owner,
                          store: deal.store
                            ? { id: deal.store.id, name: deal.store.name }
                            : null,
                          is_blocked:
                            deal.tags?.some((t) =>
                              /bloqueado|blocked/i.test(t),
                            ) ?? false,
                          current_stage_idx: currentIdx,
                          total_stages: stages.length,
                        }
                        return (
                          <OnboardingCard
                            store={store}
                            slaHours={ctx.stage.sla_hours}
                            stageColor={ctx.stageColor}
                            onClick={ctx.onClick}
                            onWin={ctx.onWin}
                            onLose={ctx.onLose}
                            onMove={ctx.onMove}
                            onAddActivity={ctx.onAddActivity}
                            onDelete={ctx.onDelete}
                            isDragging={ctx.isDragging}
                          />
                        )
                      }
                    : undefined
                }
              />
            )}
          </div>
        </>
      )}

      <PipelineFiltersPanel
        open={filtersPanelOpen}
        onOpenChange={setFiltersPanelOpen}
        filters={advancedFilters}
        onFiltersChange={setAdvancedFilters}
        matchingCount={filteredDeals.length}
        availableTags={filterOptions.tags}
        availableSources={filterOptions.sources}
        availableOwners={filterOptions.owners}
        countsByTag={filterOptions.countsByTag}
        countsBySource={filterOptions.countsBySource}
        countsByOwner={filterOptions.countsByOwner}
        countsByStatus={filterOptions.countsByStatus}
      />

      <DealDrawer
        dealId={activeDealId}
        onClose={() => setActiveDealId(null)}
        onUpdated={() => mutate()}
        pipelineStages={pipeline?.stages.map((s) => ({
          id: s.id,
          name: s.name,
          stage_type: s.stage_type,
          color: s.color ?? null,
          order: s.position,
        }))}
        fallbackDeal={(() => {
          if (!activeDealId) return null
          const d = allDeals.find((x) => x.id === activeDealId)
          if (!d) return null
          return {
            id: d.id,
            title: d.title,
            value: d.value,
            status: d.status,
            pipeline_id: d.pipeline_id,
            stage_id: d.stage_id,
            tags: d.tags,
            source: d.source,
            created_at: d.created_at ?? null,
            owner: d.owner,
            client: d.client,
            store: d.store,
          }
        })()}
        onMissing={() => {
          // 404 confirmado — refaz fetch do pipeline pra remover card
          // fantasma do kanban se ele realmente nao existe mais.
          mutate()
        }}
      />

      {transferDealId && (
        <MoveDealPipelineDialog
          open
          onClose={() => setTransferDealId(null)}
          dealId={transferDealId}
          dealTitle={allDeals.find((d) => d.id === transferDealId)?.title}
          currentPipelineId={pipelineId}
          onMoved={() => {
            // O card saiu deste board — revalida pra ele sumir.
            mutate()
            setTransferDealId(null)
          }}
        />
      )}

      {pipeline && (
        <NewDealDialog
          open={newDealStageId !== null}
          onClose={() => setNewDealStageId(null)}
          pipelineId={pipeline.id}
          defaultStageId={newDealStageId || undefined}
          stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name }))}
          onCreated={async (dealId) => {
            // Aguarda revalidate do pipeline antes de abrir o drawer.
            // Sem isso, o drawer pode tentar buscar o deal direto antes
            // do servidor terminar de comitar (race), retornando 404.
            await mutate()
            setActiveDealId(dealId)
          }}
        />
      )}

      <LostReasonDialog
        open={pendingLostMove !== null}
        onConfirm={confirmLostMove}
        onCancel={() => {
          setPendingLostMove(null)
          mutate()
        }}
      />

      {pipeline && (
        <PipelineSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          pipeline={{
            id: pipeline.id,
            name: pipeline.name,
            description: pipeline.description,
            scope: pipeline.scope,
            color: pipeline.color,
            is_default: pipeline.is_default,
            category: pipeline.category ?? null,
            is_favorite: pipeline.is_favorite ?? false,
            stages: pipeline.stages.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color ?? null,
              order: s.order ?? s.position ?? 0,
              stage_type:
                s.stage_type === "open" ||
                s.stage_type === "won" ||
                s.stage_type === "lost" ||
                s.stage_type === "archived"
                  ? s.stage_type
                  : null,
              sla_hours: s.sla_hours ?? null,
              description: s.description ?? null,
            })),
          }}
          onChanged={() => mutate()}
          onDeleted={() => mutate()}
        />
      )}

      {/* Dialog de editar etapa */}
      {editingStage && (
        <EditStageDialog
          stage={editingStage}
          onCancel={() => setEditingStage(null)}
          onSubmit={(name, color) => submitEditStage(name, color)}
        />
      )}

      {/* Ações em massa — flutua sobre o board enquanto há seleção */}
      <DealsBulkBar
        count={selected.size}
        owners={owners}
        stages={(pipeline?.stages ?? [])
          // Etapa "archived" fora do menu: mover pra ela arquivaria em
          // silêncio — arquivar já é uma ação própria, com confirmação.
          .filter((s) => s.stage_type !== "archived")
          .map((s) => ({
            id: s.id,
            name: s.name,
            stage_type: s.stage_type ?? undefined,
          }))}
        availableTags={filterOptions.tags}
        busy={bulkBusy}
        onClear={clearSelection}
        onAssignOwner={(ownerId) =>
          runBulk(
            { action: "assign_owner", owner_id: ownerId },
            (n) => `${n} ${n === 1 ? "negócio atribuído" : "negócios atribuídos"}`,
          )
        }
        onMoveStage={(stageId) =>
          runBulk(
            { action: "move_stage", stage_id: stageId },
            (n) => `${n} ${n === 1 ? "negócio movido" : "negócios movidos"}`,
          )
        }
        onAddTags={(tags) =>
          runBulk(
            { action: "add_tags", tags },
            (n) => `Tag aplicada a ${n} ${n === 1 ? "negócio" : "negócios"}`,
          )
        }
        onArchive={() =>
          runBulk(
            { action: "archive" },
            (n) => `${n} ${n === 1 ? "negócio arquivado" : "negócios arquivados"}`,
          )
        }
      />

      {/* Atalho global: Esc limpa a seleção */}
      <SelectionEscapeHandler active={selected.size > 0} onEscape={clearSelection} />

      {/* Toast feedback de acoes */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 rounded-[10px] text-[13px] font-medium flex items-center gap-2.5 shadow-xl"
          style={{
            background: toast.kind === "success" ? "#10B981" : "#DC2626",
            color: "white",
            animation: "fadeIn 200ms ease",
          }}
        >
          <span className="text-[16px]">
            {toast.kind === "success" ? "✓" : "⚠"}
          </span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── EditStageDialog ──────────────────────────────────────────────────────────

const STAGE_COLORS = [
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EF4444", // red
  "#6366F1", // indigo
  "#6B7280", // gray
]

function EditStageDialog({
  stage,
  onCancel,
  onSubmit,
}: {
  stage: { id: string; name: string; color: string | null }
  onCancel: () => void
  onSubmit: (name: string, color: string | null) => void
}) {
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color ?? STAGE_COLORS[0])
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40"
      style={{ animation: "fadeIn 150ms ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[10px] shadow-2xl w-[420px] max-w-[92vw] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-black/[0.06]">
          <h2 className="text-[16px] font-bold text-slate-900 m-0">
            Editar etapa
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Renomeie a etapa ou troque a cor de identificação.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-slate-800 mb-1.5">
              Nome
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onSubmit(name.trim(), color)
                }
                if (e.key === "Escape") onCancel()
              }}
              className="w-full h-9 px-3 rounded-[6px] border text-[13px] outline-none focus:border-brand-500"
              style={{ borderColor: "rgba(0,0,0,0.10)" }}
              placeholder="Ex: Qualificado, Em negociacao..."
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-800 mb-2">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={
                    "h-8 w-8 rounded-full border-2 transition-transform " +
                    (color === c ? "scale-110 border-slate-900" : "border-transparent hover:scale-105")
                  }
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-black/[0.06] flex items-center justify-end gap-2 bg-slate-50/40">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-[6px] text-[12.5px] font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(name.trim(), color)}
            disabled={!name.trim()}
            className="h-9 px-4 rounded-[6px] text-[12.5px] font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}


/**
 * Stat inline — versao compacta do KpiCard pra header. Sem cards
 * grandes, sem icones. Apenas label + value + hint em coluna,
 * separados por Divider. Estilo Linear/Vercel.
 */

function PipelineSkeleton() {
  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      {/* KPI bar skeleton */}
      <div
        className="grid gap-2 px-5 pt-4"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.06]"
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              borderLeft: "3px solid #CBD5E1",
              height: 76,
            }}
          >
            <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-white/[0.06]" />
            <div className="mt-2 h-5 w-24 rounded bg-slate-200 dark:bg-white/[0.10]" />
            <div className="mt-2 h-2 w-32 rounded bg-slate-100 dark:bg-white/[0.06]" />
          </div>
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 px-5 py-3">
        <div className="h-8 w-64 rounded bg-white dark:bg-[#1A1D27] border border-slate-200 dark:border-white/[0.08] animate-pulse" />
        <div className="h-8 w-24 rounded bg-white dark:bg-[#1A1D27] border border-slate-200 dark:border-white/[0.08] animate-pulse" />
        <div className="h-8 w-24 rounded bg-white dark:bg-[#1A1D27] border border-slate-200 dark:border-white/[0.08] animate-pulse" />
      </div>

      {/* Columns skeleton */}
      <div className="flex-1 flex gap-3 overflow-x-auto px-5 pb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col"
            style={{ width: 304, minWidth: 304 }}
          >
            <div
              className="animate-pulse bg-slate-300 dark:bg-white/[0.08]"
              style={{
                borderRadius: "6px 6px 0 0",
                padding: "8px 12px",
                height: 32,
              }}
            />
            <div
              className="animate-pulse bg-white dark:bg-[#161922] border-l border-r border-black/5 dark:border-white/[0.06]"
              style={{
                padding: "8px 12px",
                height: 36,
              }}
            />
            <div
              className="flex-1 flex flex-col gap-2 bg-white dark:bg-[#161922] border-l border-r border-b border-black/5 dark:border-white/[0.06]"
              style={{
                borderRadius: "0 0 6px 6px",
                padding: 8,
              }}
            >
              {Array.from({ length: 3 }).map((__, j) => (
                <div
                  key={j}
                  className="animate-pulse bg-slate-100 dark:bg-white/[0.04]"
                  style={{
                    borderRadius: 6,
                    height: 110,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Esc limpa a seleção — saída óbvia sem precisar mirar no "x" da barra.
 * Componente separado para não adicionar listener quando não há seleção.
 */
function SelectionEscapeHandler({
  active,
  onEscape,
}: {
  active: boolean
  onEscape: () => void
}) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [active, onEscape])
  return null
}
