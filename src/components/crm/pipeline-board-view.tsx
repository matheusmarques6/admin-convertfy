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
  }, [allDeals, ownerFilter, search])

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
        <div
          className="p-6"
          style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}
        >
          Carregando pipeline...
        </div>
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
        <div className="flex h-full flex-col">
          {/* KPI bar — sticky inline acima do kanban */}
          {pipeline.layout !== "state" && (
            <div
              className="grid border-b"
              style={{
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                background: "var(--crm-gray-0)",
                borderColor: "var(--crm-gray-200)",
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
              />
              <KpiCell
                icon={<Target className="h-3.5 w-3.5" />}
                label="Win rate"
                value={
                  kpis.winRate != null ? `${kpis.winRate.toFixed(0)}%` : "—"
                }
                hint={`${kpis.wonCount} ganhos`}
                color={
                  kpis.winRate == null
                    ? "default"
                    : kpis.winRate >= 30
                      ? "success"
                      : "default"
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
                color={kpis.breachCount > 0 ? "danger" : "success"}
              />
            </div>
          )}

          {/* Toolbar: busca + filtros + ordenacao */}
          {pipeline.layout !== "state" && (
            <div
              className="flex items-center gap-3 px-4 py-2.5 border-b"
              style={{
                background: "#FFFFFF",
                borderColor: "rgba(0,0,0,0.06)",
              }}
            >
              <div className="relative flex-1 max-w-sm">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                  style={{ color: "#9CA3AF" }}
                />
                <input
                  type="text"
                  placeholder="Buscar por nome, cliente, tag..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                  style={{
                    height: 32,
                    fontSize: 12,
                    background: "#F9FAFB",
                    border: "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 6,
                    padding: "0 28px 0 30px",
                    color: "#111827",
                    outline: "none",
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: "#9CA3AF" }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                title="Filtros"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 6,
                  color: "#374151",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
                className="hover:bg-[rgba(0,0,0,0.02)]"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filtros
              </button>

              <button
                title="Ordenacao"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 6,
                  color: "#374151",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
                className="hover:bg-[rgba(0,0,0,0.02)]"
              >
                <ArrowUpDown className="h-3 w-3" />
                Ordenacao
              </button>

              <span
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  marginLeft: "auto",
                }}
              >
                {filteredDeals.length}{" "}
                {filteredDeals.length === 1 ? "negocio" : "negocios"}
                {search && (
                  <span> · filtrando &ldquo;{search}&rdquo;</span>
                )}
              </span>
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
              />
            )}
          </div>
        </div>
      )}

      <DealDrawer
        dealId={activeDealId}
        onClose={() => setActiveDealId(null)}
        onUpdated={() => mutate()}
      />

      {pipeline && (
        <NewDealDialog
          open={newDealStageId !== null}
          onClose={() => setNewDealStageId(null)}
          pipelineId={pipeline.id}
          defaultStageId={newDealStageId || undefined}
          stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name }))}
          onCreated={(dealId) => {
            mutate()
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

function KpiCell({
  icon,
  label,
  value,
  hint,
  color = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  color?: "default" | "success" | "danger"
}) {
  const valueColor =
    color === "success"
      ? "var(--crm-success-fg)"
      : color === "danger"
        ? "var(--crm-danger-fg)"
        : "var(--crm-gray-900)"
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRight: "1px solid var(--crm-gray-200)",
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: "var(--crm-weight-medium)",
        }}
      >
        {icon}
        {label}
      </div>
      <div
        className="mt-0.5"
        style={{
          fontSize: "var(--crm-text-lg)",
          fontWeight: "var(--crm-weight-medium)",
          color: valueColor,
          fontFamily: "var(--crm-font-mono)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: "var(--crm-gray-500)",
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  )
}
