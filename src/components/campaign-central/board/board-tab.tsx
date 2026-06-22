"use client"

import { useMemo, useState } from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { Loader2 } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { useBoard } from "@/app/admin/campaigns/central/use-board"
import {
  BOARD_COLUMNS,
  boardColumnIndex,
  type BoardColumnKey,
} from "@/lib/services/campaign-central/board-mapping"
import type { BoardCard } from "@/types/campaign-board"
import type { CampaignSuggestion } from "@/types/campaign-central"
import type { ProductionCampaign } from "@/types/campaign-production"
import { BoardColumn } from "./board-column"
import { CopyPanel } from "../copy-panel"
import { CampaignDetailModal } from "../campaign-detail-modal"
import { DesignerModal } from "../production/designer-modal"

/** Constrói um ProductionCampaign a partir de um BoardCard (pro DesignerModal). */
function toProductionCampaign(card: BoardCard): ProductionCampaign {
  return {
    id: card.pipeline_item_id ?? card.id,
    suggestion_id: card.suggestion_id,
    type: card.type,
    title: card.title,
    subject: card.subject,
    angle: card.angle,
    channel: card.channel,
    send_date: card.send_date,
    send_in: card.send_in,
    stores: card.stores,
    is_draft: card.status !== "approved" || !card.has_pilot_good,
  }
}

interface BoardTabProps {
  /** Revalida a aba de ciclo/sugestões quando o board muda (badges, etc.). */
  onChanged?: () => void
}

export function BoardTab({ onChanged }: BoardTabProps) {
  const { toast } = useToast()
  const board = useBoard(true)
  const { cards, designers, isLoading } = board

  // Modais abertos a partir do card.
  const [copySuggestion, setCopySuggestion] = useState<CampaignSuggestion | null>(null)
  const [detailSuggestion, setDetailSuggestion] = useState<CampaignSuggestion | null>(null)
  const [designerTask, setDesignerTask] = useState<{ campaign: ProductionCampaign; storeIndex: number } | null>(
    null,
  )

  const byColumn = useMemo(() => {
    const map: Record<BoardColumnKey, BoardCard[]> = {
      sugestao: [],
      aprovada: [],
      copy: [],
      design: [],
      revisao: [],
      agendada: [],
      enviada: [],
    }
    for (const c of cards) map[c.column].push(c)
    return map
  }, [cards])

  const runMove = async (card: BoardCard, to: BoardColumnKey) => {
    const fromIdx = boardColumnIndex(card.column)
    const toIdx = boardColumnIndex(to)
    if (fromIdx === toIdx) return
    if (Math.abs(fromIdx - toIdx) !== 1) {
      toast({
        title: "Movimento inválido",
        description: "Mova o card uma coluna por vez (só para a coluna vizinha).",
        variant: "destructive",
      })
      return
    }
    // Gate de piloto 'good' no cliente (servidor é a barreira final).
    if (card.column === "sugestao" && to === "aprovada" && !card.has_pilot_good) {
      toast({
        title: "Aprovação bloqueada",
        description: "Gere a copy de teste e marque ao menos 1 loja como 'Boa' antes de aprovar.",
        variant: "destructive",
      })
      return
    }
    const res = await board.moveCard(card.id, to)
    if (res.ok) onChanged?.()
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const to = result.destination.droppableId as BoardColumnKey
    const card = cards.find((c) => c.id === result.draggableId)
    if (!card) return
    if (card.column === to) return
    void runMove(card, to)
  }

  const openCard = async (card: BoardCard) => {
    // Cards de produção (design/revisão/agendada/enviada) abrem o workspace
    // do designer; demais abrem o detalhe da campanha.
    if (["design", "revisao", "agendada", "enviada"].includes(card.column) && card.stores.length > 0) {
      setDesignerTask({ campaign: toProductionCampaign(card), storeIndex: 0 })
      return
    }
    if (!card.suggestion_id) {
      toast({ title: "Campanha sem detalhe disponível", variant: "destructive" })
      return
    }
    const full = await board.fetchSuggestion(card.suggestion_id)
    if (full) setDetailSuggestion(full)
  }

  const openCopy = async (card: BoardCard) => {
    // Pipeline_item: garante suggestion 'suggested' atrelada (reopen). Card
    // só-sugestão: busca a suggestion direto.
    const full = card.pipeline_item_id
      ? await board.reopenForCopy(card.pipeline_item_id)
      : card.suggestion_id
        ? await board.fetchSuggestion(card.suggestion_id)
        : null
    if (full) setCopySuggestion(full)
  }

  const openWorkspace = (card: BoardCard) => {
    if (card.stores.length === 0) {
      void openCopy(card)
      return
    }
    setDesignerTask({ campaign: toProductionCampaign(card), storeIndex: 0 })
  }

  const rejectCard = async (card: BoardCard) => {
    if (!card.suggestion_id) return
    try {
      const res = await fetch(`/api/admin/campaign-central/suggestions/${card.suggestion_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      await board.mutate()
      onChanged?.()
    } catch (err) {
      toast({
        title: "Falha ao rejeitar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  if (isLoading && cards.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Carregando fluxo…
      </div>
    )
  }

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => (
            <BoardColumn
              key={col.key}
              column={col}
              cards={byColumn[col.key]}
              designers={designers}
              onOpen={openCard}
              onMove={runMove}
              onReject={rejectCard}
              onCopy={openCopy}
              onWorkspace={openWorkspace}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Modais abertos a partir do card */}
      {detailSuggestion && (
        <CampaignDetailModal
          key={detailSuggestion.id}
          suggestion={detailSuggestion}
          onClose={() => setDetailSuggestion(null)}
          onChanged={() => void board.mutate()}
          onApprove={async () => {
            const res = await patchSuggestion(detailSuggestion.id, { action: "approve" })
            if (res.ok) {
              await board.mutate()
              onChanged?.()
              setDetailSuggestion(null)
            }
            return res
          }}
          onDismiss={async () => {
            const res = await patchSuggestion(detailSuggestion.id, { action: "dismiss" })
            if (res.ok) {
              await board.mutate()
              onChanged?.()
              setDetailSuggestion(null)
            }
            return res
          }}
          onGenerateCopy={() => {
            setDetailSuggestion(null)
            setCopySuggestion(detailSuggestion)
          }}
        />
      )}

      <CopyPanel
        suggestion={copySuggestion}
        onClose={() => setCopySuggestion(null)}
        onSaved={() => {
          void board.mutate()
          onChanged?.()
          // Re-sincroniza o snapshot aberto: o CopyPanel deriva hasMaster,
          // copy_results e o polling do prop `suggestion`. board.mutate() só
          // atualiza a lista de cards (sem email_draft) — sem isto o painel
          // fica stale (ex.: "Falta a copy master" mesmo após gerar a master).
          if (copySuggestion) {
            void board.fetchSuggestion(copySuggestion.id).then((fresh) => {
              if (fresh) setCopySuggestion(fresh)
            })
          }
        }}
      />

      <DesignerModal
        campaign={designerTask?.campaign ?? null}
        storeIndex={designerTask?.storeIndex ?? 0}
        designers={designers}
        onClose={() => setDesignerTask(null)}
        onUpdateStore={(storeId, patch) => {
          const itemId = designerTask?.campaign.id
          if (itemId) void board.updateStore(itemId, storeId, patch)
        }}
      />
    </>
  )
}

/** Helper local — PATCH numa suggestion, devolve {ok,error}. */
async function patchSuggestion(
  id: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/campaign-central/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro desconhecido" }
  }
}
