"use client"

import { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  Plus,
  ChevronDown,
  TrendingUp,
  Target,
  Users,
  AlertCircle,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
} from "lucide-react"
import { CrmPageShell } from "./crm-page-shell"
import { CrmEmptyState } from "./crm-empty-state"
import { KanbanBoard, type KanbanStage } from "./kanban-board"
import { StateBoard } from "./state-board"
import { DealDrawer } from "./deal-drawer"
import { NewDealDialog } from "./new-deal-dialog"
import { LostReasonDialog } from "./lost-reason-dialog"
import { ROUTES } from "@/lib/routes"

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

export function PipelineBoardView({ pipelineId, scope }: PipelineBoardViewProps) {
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

  const backHref =
    scope === "cs"
      ? ROUTES.ADMIN.OPERACIONAL.PIPELINES
      : ROUTES.ADMIN.COMERCIAL.PIPELINES

  return (
    <CrmPageShell
      title={pipeline?.name || "Carregando..."}
      subtitle={pipeline?.description || undefined}
      actions={
        <>
          <Link
            href={backHref}
            className="crm-button-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          {owners.length > 1 && (
            <div className="relative">
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="crm-input"
                style={{ paddingRight: 28, appearance: "none" }}
              >
                <option value="">Todos owners ({owners.length})</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none"
                style={{ color: "var(--crm-gray-500)" }}
              />
            </div>
          )}
          <button
            className="crm-button-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--crm-space-2)",
            }}
            onClick={() => setNewDealStageId(pipeline?.stages?.[0]?.id || null)}
            disabled={!pipeline}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo deal
          </button>
        </>
      }
    >
      {isLoading ? (
        <PipelineSkeleton />
      ) : !pipeline ? (
        <div className="p-6">
          <CrmEmptyState
            title="Pipeline nao encontrado"
            description="O pipeline pode ter sido arquivado ou voce nao tem acesso."
          />
        </div>
      ) : pipeline.stages.length === 0 ? (
        <div className="p-6">
          <CrmEmptyState
            title="Pipeline sem estagios"
            description="Configure os estagios deste pipeline antes de criar deals."
          />
        </div>
      ) : (
        <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
          {/* ── KPI bar — 4 cards compactos com hierarquia clara ── */}
          {pipeline.layout !== "state" && (
            <div
              className="grid gap-2 px-5 pt-4"
              style={{
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              }}
            >
              <KpiCell
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Pipeline aberto"
                value={fmtBRL(kpis.totalOpenValue)}
                hint={`${kpis.openCount} deals · ticket medio ${
                  kpis.avgDeal > 0
                    ? fmtBRL(Math.round(kpis.avgDeal))
                    : "—"
                }`}
                accent="#2563EB"
              />
              <KpiCell
                icon={<Target className="h-3.5 w-3.5" />}
                label="Win rate"
                value={
                  kpis.winRate != null ? `${kpis.winRate.toFixed(0)}%` : "—"
                }
                hint={`${kpis.wonCount} ganhos`}
                accent={
                  kpis.winRate == null
                    ? "#475569"
                    : kpis.winRate >= 30
                      ? "#059669"
                      : "#D97706"
                }
              />
              <KpiCell
                icon={<Users className="h-3.5 w-3.5" />}
                label="Owners ativos"
                value={`${owners.length}`}
                hint={
                  ownerFilter
                    ? `Filtrado: ${owners.find((o) => o.id === ownerFilter)?.name}`
                    : "Sem filtro"
                }
                accent="#7C3AED"
              />
              <KpiCell
                icon={<AlertCircle className="h-3.5 w-3.5" />}
                label="SLA estourado"
                value={`${kpis.breachCount}`}
                hint={
                  kpis.breachCount > 0
                    ? "Deals acima do prazo do estagio"
                    : "Tudo dentro do prazo"
                }
                accent={kpis.breachCount > 0 ? "#DC2626" : "#059669"}
              />
            </div>
          )}

          {/* ── Toolbar: pills de periodo + search + filtros ── */}
          {pipeline.layout !== "state" && (
            <div
              className="flex flex-wrap items-center gap-2 px-5 py-3"
            >
              {/* Pills de periodo (DataCrazy-style) */}
              <div
                className="inline-flex items-center gap-0.5 rounded-[6px] bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.08] p-0.5"
                role="tablist"
                aria-label="Filtrar por periodo de criacao"
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
                          ? "text-[11px] font-semibold px-2.5 py-1 rounded-[4px] bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-[11px] font-medium px-2.5 py-1 rounded-[4px] text-slate-600 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      }
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              <div className="relative flex-1 max-w-xs">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: "#94A3B8" }}
                />
                <input
                  type="text"
                  placeholder="Buscar por nome, cliente, tag..."
                  aria-label="Buscar deals"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white/90 border border-black/[0.08] dark:border-white/[0.08] placeholder:text-slate-400 dark:placeholder:text-white/30"
                  style={{
                    height: 32,
                    fontSize: 12,
                    borderRadius: 6,
                    padding: "0 28px 0 30px",
                    outline: "none",
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 hover:text-slate-600"
                    style={{ color: "#94A3B8" }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                title="Filtros"
                aria-label="Filtros"
                className="bg-white dark:bg-[#1A1D27] text-slate-600 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:hover:border-white/[0.16]"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filtros
              </button>

              <button
                title="Ordenacao"
                aria-label="Ordenacao"
                className="bg-white dark:bg-[#1A1D27] text-slate-600 dark:text-white/70 border border-black/[0.08] dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:hover:border-white/[0.16]"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
              >
                <ArrowUpDown className="h-3 w-3" />
                Ordenar
              </button>

              <span
                className="ml-auto text-slate-500 dark:text-white/55"
                aria-live="polite"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {filteredDeals.length}{" "}
                {filteredDeals.length === 1 ? "negocio" : "negocios"}
                {search && (
                  <span className="text-slate-400 dark:text-white/40"> · &ldquo;{search}&rdquo;</span>
                )}
              </span>
            </div>
          )}

          {/* ── Mini funil de conversao — barra horizontal compacta
               mostrando como deals se distribuem entre stages. Cada
               segmento e proporcional ao count e usa a cor do stage. ── */}
          {pipeline.layout !== "state" && filteredDeals.length > 0 && (
            <div className="px-5 pb-3">
              <div
                className="flex items-center gap-px overflow-hidden h-1.5 rounded-full bg-slate-200/70 dark:bg-white/[0.06]"
                role="img"
                aria-label="Distribuicao de deals por estagio"
              >
                {pipeline.stages.map((s) => {
                  const count = filteredDeals.filter((d) => d.stage_id === s.id).length
                  if (count === 0) return null
                  const pct = (count / filteredDeals.length) * 100
                  const c = s.color ?? "#475569"
                  return (
                    <div
                      key={s.id}
                      title={`${s.name} · ${count} deal${count === 1 ? "" : "s"} (${pct.toFixed(0)}%)`}
                      style={{
                        width: `${pct}%`,
                        background: c,
                        height: "100%",
                        minWidth: 4,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

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
        </div>
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
    </CrmPageShell>
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

function KpiCell({
  icon,
  label,
  value,
  hint,
  accent = "#475569",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  /** Cor de acento — pinta o icone e a borda lateral. */
  accent?: string
}) {
  return (
    <div
      className="bg-white dark:bg-[#1A1D27] border border-black/[0.06] dark:border-white/[0.06]"
      style={{
        padding: "10px 14px",
        borderRadius: 6,
        borderLeft: `3px solid ${accent}`,
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{
          fontSize: 10,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        className="mt-1 text-slate-900 dark:text-white"
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="text-slate-500 dark:text-white/55"
          style={{
            fontSize: 10,
            marginTop: 3,
            lineHeight: 1.3,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}
