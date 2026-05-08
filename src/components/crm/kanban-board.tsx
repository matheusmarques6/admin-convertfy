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

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto px-5 py-5 bg-slate-100 dark:bg-[#0B0E15]">
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || []
          const stageType = stage.stage_type || "open"
          const color = stageColor(stage)
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
              {/* ── Header da coluna — chip colorido estilo DataCrazy ── */}
              <div
                className="sticky top-0 z-[1]"
                style={{
                  background: color,
                  borderRadius: "6px 6px 0 0",
                  padding: "8px 12px",
                  color: "#FFFFFF",
                  boxShadow: `0 1px 3px ${hexAlpha(color, 0.25)}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      title={stage.name}
                      className="truncate"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                        color: "#FFFFFF",
                      }}
                    >
                      {stage.name}
                    </span>
                    <span
                      className="shrink-0 inline-flex items-center justify-center"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: hexAlpha("#FFFFFF", 0.22),
                        color: "#FFFFFF",
                        padding: "1px 6px",
                        minWidth: 20,
                        height: 16,
                        borderRadius: 999,
                        fontVariantNumeric: "tabular-nums",
                      }}
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
                        className="hover:bg-white/15"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#FFFFFF",
                          cursor: "pointer",
                          background: "transparent",
                          border: "none",
                          transition: "background 150ms ease",
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      aria-label="Mais opcoes"
                      title="Opcoes da coluna"
                      className="hover:bg-white/15"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                        transition: "background 150ms ease",
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra de subtotal + breach — fora do chip colorido pra
                  manter o header limpo e o numero legivel */}
              <div
                className="flex items-center justify-between bg-white dark:bg-[#161922] border-l border-r border-black/5 dark:border-white/[0.06]"
                style={{ padding: "8px 12px" }}
              >
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

              {/* ── Droppable column ── */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 flex flex-col bg-white dark:bg-[#161922] border-l border-r border-b border-black/5 dark:border-white/[0.06]"
                    style={{
                      background: snapshot.isDraggingOver
                        ? hexAlpha(color, 0.08)
                        : undefined,
                      borderRadius: "0 0 6px 6px",
                      borderTop: snapshot.isDraggingOver
                        ? `1px dashed ${color}`
                        : "1px solid transparent",
                      padding: 8,
                      transition: "background 150ms ease, border-color 150ms ease",
                      minHeight: 120,
                      gap: 6,
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    {stageDeals.length === 0 && !snapshot.isDraggingOver ? (
                      <div
                        className="flex flex-col items-center justify-center text-center text-slate-400 dark:text-white/30"
                        style={{ padding: "24px 12px" }}
                      >
                        <p style={{ fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                          Vazio
                        </p>
                        <p className="text-slate-300 dark:text-white/20" style={{ fontSize: 10 }}>
                          Arraste cards ou clique em + para adicionar
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
                              onClick={onCardClick}
                              onWin={!isTerminal ? onWinDeal : undefined}
                              onLose={!isTerminal ? onLoseDeal : undefined}
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
