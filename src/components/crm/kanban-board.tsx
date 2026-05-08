"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, AlertCircle, MoreHorizontal } from "lucide-react"
import { DealCard, type DealCardData } from "./deal-card"

export interface KanbanStage {
  id: string
  name: string
  position: number
  stage_type: string | null
  sla_hours: number | null
  exit_criteria: string | null
  /** Cor opcional vinda do banco — sobrescreve a cor default por stage_type. */
  color?: string | null
}

interface KanbanBoardProps {
  stages: KanbanStage[]
  deals: Array<DealCardData & { stage_id: string; pipeline_id: string }>
  onMove: (dealId: string, toStageId: string, toPosition: number) => Promise<void> | void
  onCardClick?: (id: string) => void
  onAddDeal?: (stageId: string) => void
  onWinDeal?: (dealId: string) => void
  onLoseDeal?: (dealId: string) => void
  onMoveDeal?: (dealId: string) => void
  onAddActivity?: (dealId: string) => void
  onDeleteDeal?: (dealId: string) => void
}

const fmtBRLCompact = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}K`
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)
}

// Cor default por stage_type — usada quando stage.color e null.
// Tons saturados estilo DataCrazy: open=ardosia, won=verde esmeralda,
// lost=vermelho coral, paused=ambar.
const STAGE_TYPE_DEFAULT_COLOR: Record<string, string> = {
  open: "#475569",
  won: "#059669",
  lost: "#DC2626",
  paused: "#D97706",
}

function stageColor(stage: KanbanStage): string {
  if (stage.color) return stage.color
  return STAGE_TYPE_DEFAULT_COLOR[stage.stage_type || "open"] || "#475569"
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

/**
 * Converte um hex (#RRGGBB) num rgba com alpha. Usado pra gerar versoes
 * mais claras da cor da etapa pro background do header sem precisar de
 * variaveis CSS extras.
 */
function hexAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/.{2}/g)
  if (!m || m.length !== 3) return hex
  const [r, g, b] = m.map((x) => parseInt(x, 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function KanbanBoard({
  stages,
  deals,
  onMove,
  onCardClick,
  onAddDeal,
  onWinDeal,
  onLoseDeal,
  onMoveDeal,
  onAddActivity,
  onDeleteDeal,
}: KanbanBoardProps) {
  const [optimisticDeals, setOptimisticDeals] = useState(deals)
  const [isMoving, setIsMoving] = useState(false)

  useEffect(() => {
    setOptimisticDeals(deals)
  }, [deals])

  const dealsByStage = useMemo(() => {
    const map = new Map<string, typeof optimisticDeals>()
    for (const s of stages) map.set(s.id, [])
    for (const d of optimisticDeals) {
      const list = map.get(d.stage_id)
      if (list) list.push(d)
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const va = (a as { position?: number }).position ?? 0
        const vb = (b as { position?: number }).position ?? 0
        return va - vb
      })
    }
    return map
  }, [optimisticDeals, stages])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return

    const fromList = (dealsByStage.get(source.droppableId) || []).slice()
    const toList =
      source.droppableId === destination.droppableId
        ? fromList
        : (dealsByStage.get(destination.droppableId) || []).slice()

    const [moved] = fromList.splice(source.index, 1)
    if (!moved) return
    moved.stage_id = destination.droppableId
    if (source.droppableId === destination.droppableId) {
      fromList.splice(destination.index, 0, moved)
    } else {
      toList.splice(destination.index, 0, moved)
    }

    const newOptimistic = optimisticDeals.map((d) => {
      if (d.id === moved.id) return { ...moved }
      return d
    })
    setOptimisticDeals(newOptimistic)

    setIsMoving(true)
    try {
      const newPos = (destination.index + 1) * 10
      await onMove(draggableId, destination.droppableId, newPos)
    } catch {
      setOptimisticDeals(deals)
    } finally {
      setIsMoving(false)
    }
  }

  // Stages "open" — usados pra calcular o mini stepper (posicao do
  // deal no funil de aquisicao, ignorando won/lost que sao terminais).
  const openStages = useMemo(
    () => stages.filter((s) => (s.stage_type || "open") === "open"),
    [stages],
  )

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto px-6 py-5 bg-slate-50 dark:bg-[#0B0E15]">
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || []
          const stageType = stage.stage_type || "open"
          const color = stageColor(stage)
          // Indice da stage atual dentro do funil "open" — usado pelos
          // cards pra desenhar o mini stepper. Stages won/lost ficam
          // sem stepper (-1 -> stagePosition undefined no card).
          const openIdx = openStages.findIndex((s) => s.id === stage.id)
          const stageTotal = stageDeals.reduce(
            (sum, d) => sum + (d.value || 0),
            0,
          )
          const slaDays = stage.sla_hours
            ? Math.ceil(stage.sla_hours / 24)
            : null
          const breachCount = slaDays
            ? stageDeals.filter(
                (d) => daysSince(d.last_stage_changed_at) > slaDays,
              ).length
            : 0
          const isTerminal = stageType === "won" || stageType === "lost"

          return (
            <div
              key={stage.id}
              className="flex flex-col"
              style={{ width: 304, minWidth: 304 }}
            >
              {/* ── Header da coluna — pilula clean estilo Linear ──
                  Diferente do chip 100% colorido (que fica forte demais
                  com 5+ colunas seguidas), agora usa bg branco + barra
                  superior fina colorida + dot da cor do stage. Resultado
                  mais leve e profissional. */}
              <div
                className="sticky top-0 z-[1] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                style={{
                  borderRadius: "8px 8px 0 0",
                }}
              >
                {/* Barra superior fina colorida — assinatura visual da
                    coluna sem invadir o conteudo */}
                <div
                  className="h-1"
                  style={{
                    background: color,
                    borderRadius: "8px 8px 0 0",
                  }}
                  aria-hidden
                />

                <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span
                      title={stage.name}
                      className="truncate text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-700 dark:text-white/85"
                    >
                      {stage.name}
                    </span>
                    <span
                      className="shrink-0 inline-flex items-center justify-center text-[10px] font-bold tabular-nums rounded-full px-1.5 min-w-[20px] h-4 bg-slate-100 dark:bg-white/[0.08] text-slate-600 dark:text-white/70"
                    >
                      {stageDeals.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onAddDeal && !isTerminal && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        aria-label="Adicionar deal"
                        title="Adicionar deal aqui"
                        className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      aria-label="Mais opcoes"
                      title="Opcoes da coluna"
                      className="flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subtotal inline */}
                <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                <span
                  className="truncate text-slate-900 dark:text-white/90"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stageTotal > 0 ? fmtBRLCompact(stageTotal) : "—"}
                </span>
                {breachCount > 0 ? (
                  <span
                    title={`${breachCount} deal(s) acima do SLA (${slaDays}d)`}
                    className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <AlertCircle className="h-2.5 w-2.5" />
                    {breachCount}
                  </span>
                ) : (
                  <span
                    className="text-slate-400 dark:text-white/40"
                    style={{ fontSize: 10, fontWeight: 500 }}
                  >
                    {slaDays ? `SLA ${slaDays}d` : ""}
                  </span>
                )}
                </div>
              </div>

              {/* ── Droppable column ──
                  Container que recebe os cards. Continuacao visual do
                  header (mesmo bg, bordas laterais, fechamento bottom).
                  Quando dragging-over, ganha tinta da cor do stage e
                  borda dashed pra indicar drop target. */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 flex flex-col bg-white dark:bg-[#161922] border-l border-r border-b border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    style={{
                      background: snapshot.isDraggingOver
                        ? hexAlpha(color, 0.08)
                        : undefined,
                      borderRadius: "0 0 8px 8px",
                      padding: 8,
                      transition: "background 150ms ease",
                      minHeight: 200,
                      gap: 8,
                      borderTop: snapshot.isDraggingOver
                        ? `1.5px dashed ${color}`
                        : "1px solid transparent",
                    }}
                  >
                    {stageDeals.length === 0 && !snapshot.isDraggingOver ? (
                      <div className="flex flex-col items-center justify-center text-center px-4 py-10">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full mb-2.5 shrink-0"
                          style={{
                            background: hexAlpha(color, 0.10),
                            color: color,
                          }}
                          aria-hidden
                        >
                          <Plus className="h-4 w-4" />
                        </div>
                        <p className="text-[12px] font-medium text-slate-700 dark:text-white/70 mb-1">
                          Nenhum deal
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-white/40 leading-relaxed max-w-[180px]">
                          Arraste cards ou clique em <span className="font-semibold">+</span> no header da coluna
                        </p>
                      </div>
                    ) : null}

                    {stageDeals.map((deal, index) => (
                      <Draggable
                        key={deal.id}
                        draggableId={deal.id}
                        index={index}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity:
                                isMoving && dragSnapshot.isDragging ? 0.5 : 1,
                            }}
                          >
                            <DealCard
                              deal={deal}
                              slaHours={stage.sla_hours}
                              stageColor={color}
                              stagePosition={
                                openIdx >= 0 && openStages.length > 1
                                  ? { current: openIdx, total: openStages.length }
                                  : undefined
                              }
                              onClick={onCardClick}
                              onWin={!isTerminal ? onWinDeal : undefined}
                              onLose={!isTerminal ? onLoseDeal : undefined}
                              onMove={onMoveDeal}
                              onAddActivity={onAddActivity}
                              onDelete={onDeleteDeal}
                              isDragging={dragSnapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {/* Add deal — botao discreto no fim, so se ha deals */}
                    {onAddDeal && !isTerminal && stageDeals.length > 0 && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        className="w-full bg-transparent text-slate-400 dark:text-white/40 border border-dashed border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/[0.16] hover:text-slate-600 dark:hover:text-white/70"
                        style={{
                          padding: "8px 12px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          marginTop: 2,
                          transition: "all 150ms ease",
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
