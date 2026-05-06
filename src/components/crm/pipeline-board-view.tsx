"use client"

import { useEffect, useState, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Plus, ChevronDown } from "lucide-react"
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

export function PipelineBoardView({ pipelineId, scope }: PipelineBoardViewProps) {
  const { data, isLoading, mutate } = useSWR<PipelineDetailResponse>(
    `/api/crm/pipelines/${pipelineId}`,
    fetcher,
  )

  const searchParams = useSearchParams()
  const [activeDealId, setActiveDealId] = useState<string | null>(null)
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>("")
  const [pendingLostMove, setPendingLostMove] = useState<{
    dealId: string
    stageId: string
    position: number
  } | null>(null)

  // Open drawer if ?deal=<id> in URL
  useEffect(() => {
    const dealParam = searchParams.get("deal")
    if (dealParam) setActiveDealId(dealParam)
  }, [searchParams])

  const pipeline = data?.pipeline
  const allDeals = data?.deals || []

  // Owners disponiveis para filtro
  const owners = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const d of allDeals) {
      if (d.owner) seen.set(d.owner.id, { id: d.owner.id, name: d.owner.name })
    }
    return Array.from(seen.values())
  }, [allDeals])

  const filteredDeals = useMemo(() => {
    if (!ownerFilter) return allDeals
    return allDeals.filter((d) => d.owner?.id === ownerFilter)
  }, [allDeals, ownerFilter])

  const totalValue = filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0)

  const handleMove = async (dealId: string, toStageId: string, toPosition: number) => {
    // Detecta se a stage destino e do tipo "lost" — se sim, abre dialog
    const targetStage = pipeline?.stages.find((s) => s.id === toStageId)
    if (targetStage?.stage_type === "lost") {
      setPendingLostMove({ dealId, stageId: toStageId, position: toPosition })
      // Lanca pra o kanban fazer rollback do optimistic update — o move
      // real so acontece quando o usuario confirmar a razao.
      throw new Error("Aguardando razao da perda")
    }

    const res = await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: toStageId, position: toPosition }),
    })
    if (!res.ok) {
      throw new Error("Falha ao mover deal")
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
    if (res.ok) await mutate()
  }

  const backHref =
    scope === "cs" ? ROUTES.ADMIN.CRM.CS.PIPELINES : ROUTES.ADMIN.CRM.SALES.PIPELINES

  return (
    <CrmPageShell
      title={pipeline?.name || "Carregando..."}
      subtitle={
        pipeline
          ? `${filteredDeals.length} deals · ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            }).format(totalValue)} total`
          : undefined
      }
      actions={
        <>
          <Link
            href={backHref}
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
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
                <option value="">Todos owners</option>
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
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--crm-space-2)" }}
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
      ) : pipeline.layout === "state" ? (
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
        />
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
          mutate() // refetch pra reverter optimistic UI do kanban
        }}
      />
    </CrmPageShell>
  )
}
