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

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(v)

// Cor default da barra superior por stage_type — usada quando stage.color e null.
const STAGE_TYPE_DEFAULT_COLOR: Record<string, string> = {
  open: "#94A3B8",
  won: "#10B981",
  lost: "#EF4444",
  paused: "#F59E0B",
}

function stageColor(stage: KanbanStage): string {
  if (stage.color) return stage.color
  return STAGE_TYPE_DEFAULT_COLOR[stage.stage_type || "open"] || "#94A3B8"
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
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
      <div
        className="flex h-full gap-3 overflow-x-auto px-4 py-4"
        style={{
          background: "#F8FAFC",
        }}
      >
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
              style={{
                width: 296,
                minWidth: 296,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header de coluna — barra colorida no topo + sticky */}
              <div
                style={{
                  background: "#FFFFFF",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  borderTop: `3px solid ${color}`,
                  padding: "10px 12px",
                  marginBottom: 10,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      title={stage.name}
                      className="truncate"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#1F2937",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {stage.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onAddDeal && !isTerminal && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        aria-label="Adicionar deal"
                        title="Adicionar deal aqui"
                        className="hover:bg-[rgba(0,0,0,0.04)]"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#9CA3AF",
                          cursor: "pointer",
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      aria-label="Mais opcoes"
                      title="Opcoes da coluna"
                      className="hover:bg-[rgba(0,0,0,0.04)]"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#9CA3AF",
                        cursor: "pointer",
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Total + count + SLA breach */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#111827",
                        fontVariantNumeric: "tabular-nums",
                      }}
                      className="truncate"
                    >
                      {fmtBRL(stageTotal)}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                      · {stageDeals.length} {stageDeals.length === 1 ? "negocio" : "negocios"}
                    </span>
                  </div>
                  {breachCount > 0 && (
                    <span
                      title={`${breachCount} deal(s) acima do SLA (${slaDays}d)`}
                      style={{
                        fontSize: 10,
                        color: "#991B1B",
                        background: "#FEE2E2",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        flexShrink: 0,
                      }}
                    >
                      <AlertCircle className="h-2.5 w-2.5" />
                      {breachCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Droppable column */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      flex: 1,
                      background: snapshot.isDraggingOver
                        ? "rgba(37, 99, 235, 0.04)"
                        : "transparent",
                      border: snapshot.isDraggingOver
                        ? "1px dashed #2563EB"
                        : "1px dashed transparent",
                      borderRadius: 8,
                      padding: 4,
                      transition: "background 150ms ease, border-color 150ms ease",
                      minHeight: 100,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
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

                    {/* Adicionar deal — botao discreto no final */}
                    {onAddDeal && !isTerminal && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        className="hover:bg-[rgba(0,0,0,0.03)] hover:border-[rgba(0,0,0,0.12)]"
                        style={{
                          width: "100%",
                          padding: stageDeals.length === 0 ? "16px 12px" : "8px 12px",
                          borderRadius: 6,
                          border: "1px dashed rgba(0,0,0,0.10)",
                          background: "transparent",
                          color: "#9CA3AF",
                          fontSize: 11,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          marginTop: stageDeals.length === 0 ? 0 : 2,
                          transition: "background 150ms ease, border-color 150ms ease",
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        {stageDeals.length === 0
                          ? "Adicionar primeiro deal"
                          : "Adicionar"}
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
