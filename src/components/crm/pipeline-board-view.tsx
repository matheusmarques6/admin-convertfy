"use client"

import { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import {
  Plus,
  ChevronDown,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
} from "lucide-react"
import { CrmEmptyState } from "./crm-empty-state"
import { KanbanBoard, type KanbanStage } from "./kanban-board"
import { StateBoard } from "./state-board"
import { DealDrawer } from "./deal-drawer"
import { NewDealDialog } from "./new-deal-dialog"
import { LostReasonDialog } from "./lost-reason-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineDetailResponse {
  pipeline: {
    id: string
    name: string
    description: string | null
    scope: string
    color: string | null
    layout: string | null
    stages: KanbanStage[]
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
    client?: { id: string; name: string } | null
    store?: { id: string; name: string } | null
  }>
}

interface PipelineBoardViewProps {
  pipelineId: string
  scope: "sales" | "cs"
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

export function PipelineBoardView({ pipelineId, scope: _scope }: PipelineBoardViewProps) {
  const { data, isLoading, mutate } = useSWR<PipelineDetailResponse>(
    `/api/crm/pipelines/${pipelineId}`,
    fetcher,
  )

  const searchParams = useSearchParams()
  const [activeDealId, setActiveDealId] = useState<string | null>(null)
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>("")
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

  useEffect(() => {
    const dealParam = searchParams.get("deal")
    if (dealParam) setActiveDealId(dealParam)
  }, [searchParams])

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
    return list
  }, [allDeals, ownerFilter, periodFilter, search])

  // Identifica won/lost stage default — usado pelos quick actions do card
  const wonStage = pipeline?.stages.find((s) => s.stage_type === "won")
  const lostStages = pipeline?.stages.filter((s) => s.stage_type === "lost") || []
  const defaultLostStage = lostStages[0]

  // KPIs do header sticky
  const kpis = useMemo(() => {
    const openDeals = filteredDeals.filter((d) => d.status === "open")
    const wonDeals = filteredDeals.filter((d) => d.status === "won")
    const lostDeals = filteredDeals.filter((d) => d.status === "lost")
    const totalOpenValue = openDeals.reduce((s, d) => s + (d.value || 0), 0)
    const totalWonValue = wonDeals.reduce((s, d) => s + (d.value || 0), 0)
    const winRate =
      wonDeals.length + lostDeals.length > 0
        ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
        : null

    // SLA breaches em todos os estagios
    let breachCount = 0
    if (pipeline) {
      const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]))
      for (const d of openDeals) {
        const s = stageMap.get(d.stage_id)
        if (s?.sla_hours) {
          const slaDays = Math.ceil(s.sla_hours / 24)
          if (daysSince(d.last_stage_changed_at) > slaDays) breachCount += 1
        }
      }
    }

    const avgDeal =
      openDeals.length > 0 ? totalOpenValue / openDeals.length : 0

    return {
      openCount: openDeals.length,
      totalOpenValue,
      totalWonValue,
      wonCount: wonDeals.length,
      winRate,
      avgDeal,
      breachCount,
    }
  }, [filteredDeals, pipeline])

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
    if (!res.ok) throw new Error("Falha ao mover deal")
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
    if (res.ok) await mutate()
  }

  // Quick actions do card
  const handleQuickWin = async (dealId: string) => {
    if (!wonStage) return
    await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: wonStage.id, position: 10 }),
    })
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

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15] overflow-hidden">
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
          {/* ═══════════ HEADER PROPRIO (substitui CrmPageShell) ═══════════
              Hierarquia clara estilo Linear/Vercel:
                · Linha 1: nome + descricao (esq) + actions (dir)
                · Linha 2: stats inline + mini-funnel
                · Linha 3: filtros (search + pills + owner)
              Tudo em uma area coesa com bg branco, sem cards grandes
              poluindo o topo. */}

          {/* Linha 1: titulo + actions */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 bg-white dark:bg-[#0F1117] border-b border-black/[0.04] dark:border-white/[0.06]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{
                    background: pipeline.color ?? "#2563EB",
                  }}
                  aria-hidden
                />
                <h1 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                  {pipeline.name}
                </h1>
              </div>
              {pipeline.description && (
                <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55 truncate ml-4">
                  {pipeline.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setNewDealStageId(pipeline?.stages?.[0]?.id || null)}
                disabled={!pipeline}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold shadow-[0_1px_2px_rgba(37,99,235,0.25)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo deal
              </button>
            </div>
          </div>

          {/* Linha 2: stats inline + mini funnel */}
          {pipeline.layout !== "state" && (
            <div className="flex items-center gap-5 px-6 py-3 bg-white dark:bg-[#0F1117] border-b border-black/[0.04] dark:border-white/[0.06]">
              <StatInline
                label="Pipeline aberto"
                value={fmtBRL(kpis.totalOpenValue)}
                hint={`${kpis.openCount} ${kpis.openCount === 1 ? "deal" : "deals"}`}
                accent="#2563EB"
              />
              <Divider />
              <StatInline
                label="Ticket medio"
                value={kpis.avgDeal > 0 ? fmtBRL(Math.round(kpis.avgDeal)) : "—"}
                accent="#475569"
              />
              <Divider />
              <StatInline
                label="Win rate"
                value={kpis.winRate != null ? `${kpis.winRate.toFixed(0)}%` : "—"}
                hint={`${kpis.wonCount} ${kpis.wonCount === 1 ? "ganho" : "ganhos"}`}
                accent={
                  kpis.winRate == null
                    ? "#475569"
                    : kpis.winRate >= 30
                      ? "#059669"
                      : "#D97706"
                }
              />
              <Divider />
              <StatInline
                label="SLA estourado"
                value={`${kpis.breachCount}`}
                hint={kpis.breachCount > 0 ? "Acao necessaria" : "Tudo no prazo"}
                accent={kpis.breachCount > 0 ? "#DC2626" : "#059669"}
              />

              {/* Mini funil — distribuicao por estagio */}
              {filteredDeals.length > 0 && (
                <div className="ml-auto flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40 shrink-0">
                    Funil
                  </span>
                  <div
                    className="flex items-center gap-px overflow-hidden h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06]"
                    role="img"
                    aria-label="Distribuicao de deals por estagio"
                    style={{ width: 180 }}
                  >
                    {pipeline.stages.map((s) => {
                      const count = filteredDeals.filter((d) => d.stage_id === s.id).length
                      if (count === 0) return null
                      const pct = (count / filteredDeals.length) * 100
                      const c = s.color ?? "#475569"
                      return (
                        <div
                          key={s.id}
                          title={`${s.name} · ${count} (${pct.toFixed(0)}%)`}
                          style={{
                            width: `${pct}%`,
                            background: c,
                            height: "100%",
                            minWidth: 3,
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linha 3: filtros (search + pills + owner + count) */}
          {pipeline.layout !== "state" && (
            <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 bg-white dark:bg-[#0F1117] border-b border-black/[0.04] dark:border-white/[0.06]">
              {/* Search */}
              <div className="relative flex-1 max-w-[280px]">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-white/40"
                />
                <input
                  type="text"
                  placeholder="Buscar deals..."
                  aria-label="Buscar deals"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 rounded-[6px] pl-8 pr-7 text-[12px] bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-white/90 border border-black/[0.06] dark:border-white/[0.06] placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-300 dark:focus:border-white/20 focus:bg-white dark:focus:bg-[#1A1D27]"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Pills de periodo */}
              <div
                className="inline-flex items-center gap-0.5 rounded-[6px] bg-slate-50 dark:bg-white/[0.04] p-0.5 border border-black/[0.04] dark:border-white/[0.04]"
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
                      className={
                        active
                          ? "text-[11px] font-semibold px-2.5 py-1 rounded-[4px] bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                          : "text-[11px] font-medium px-2.5 py-1 rounded-[4px] text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white/90"
                      }
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {/* Owner filter */}
              {owners.length > 1 && (
                <div className="relative">
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    className="appearance-none h-8 pl-3 pr-7 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27] cursor-pointer focus:outline-none"
                  >
                    <option value="">Todos owners ({owners.length})</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-slate-400 dark:text-white/40"
                  />
                </div>
              )}

              <button
                aria-label="Mais filtros"
                title="Mais filtros (em breve)"
                className="h-8 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-white/70 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27]"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filtros
              </button>

              <button
                aria-label="Ordenar"
                title="Ordenar"
                className="h-8 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-white/70 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27]"
              >
                <ArrowUpDown className="h-3 w-3" />
                Ordenar
              </button>

              {/* Contador alinhado a direita */}
              <span
                className="ml-auto text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums"
                aria-live="polite"
              >
                {filteredDeals.length}{" "}
                {filteredDeals.length === 1 ? "negocio" : "negocios"}
                {(search || ownerFilter || periodFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearch("")
                      setOwnerFilter("")
                      setPeriodFilter("all")
                    }}
                    className="ml-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Limpar filtros
                  </button>
                )}
              </span>
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
                onAddActivity={(id) => setActiveDealId(id)}
                onDeleteDeal={handleDelete}
              />
            )}
          </div>
        </>
      )}

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

    </div>
  )
}


/**
 * Stat inline — versao compacta do KpiCard pra header. Sem cards
 * grandes, sem icones. Apenas label + value + hint em coluna,
 * separados por Divider. Estilo Linear/Vercel.
 */
function StatInline({
  label,
  value,
  hint,
  accent = "#475569",
}: {
  label: string
  value: string
  hint?: string
  accent?: string
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white leading-tight">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-slate-500 dark:text-white/50 mt-0.5 truncate">
          {hint}
        </div>
      )}
    </div>
  )
}

function Divider() {
  return (
    <div
      className="h-9 w-px bg-black/[0.06] dark:bg-white/[0.08] shrink-0"
      aria-hidden
    />
  )
}

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
