"use client"

import { useEffect, useMemo, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, AlertCircle } from "lucide-react"
import { DealCard, type DealCardData } from "./deal-card"

export interface KanbanStage {
  id: string
  name: string
  position: number
  stage_type: string | null
  sla_hours: number | null
  exit_criteria: string | null
}

interface KanbanBoardProps {
  stages: KanbanStage[]
  deals: Array<DealCardData & { stage_id: string; pipeline_id: string }>
  onMove: (dealId: string, toStageId: string, toPosition: number) => Promise<void> | void
  onCardClick?: (id: string) => void
  onAddDeal?: (stageId: string) => void
  /**
   * Quando informados, o card mostra acoes rapidas de ganhar/perder no
   * hover. O parent decide pra qual stage mover.
   */
  onWinDeal?: (dealId: string) => void
  onLoseDeal?: (dealId: string) => void
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

const fmtBRLCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `R$ ${Math.round(v / 1000)}k`
  return fmtBRL(v)
}

const STAGE_TYPE_COLORS: Record<string, { fg: string }> = {
  open: { fg: "var(--crm-gray-500)" },
  won: { fg: "var(--crm-success-fg)" },
  lost: { fg: "var(--crm-danger-fg)" },
  paused: { fg: "var(--crm-warning-fg)" },
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
        const va = (a as any).position ?? 0
        const vb = (b as any).position ?? 0
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
        className="flex h-full gap-3 overflow-x-auto px-6 py-4"
        style={{ background: "var(--crm-gray-50)" }}
      >
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || []
          const stageType = stage.stage_type || "open"
          const colors = STAGE_TYPE_COLORS[stageType] || STAGE_TYPE_COLORS.open
          const stageTotal = stageDeals.reduce(
            (sum, d) => sum + (d.value || 0),
            0,
          )

          // SLA breach count na coluna
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
                width: "var(--crm-column-kanban-width)",
                minWidth: "var(--crm-column-kanban-width)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Column header — card-like, sticky */}
              <div
                style={{
                  background: "var(--crm-gray-0)",
                  border: "1px solid var(--crm-gray-200)",
                  borderRadius: "var(--crm-radius-md)",
                  padding: "8px 10px",
                  marginBottom: 8,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "var(--crm-radius-full)",
                        background: colors.fg,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      title={stage.name}
                      className="truncate"
                      style={{
                        fontSize: "var(--crm-text-sm)",
                        fontWeight: "var(--crm-weight-medium)",
                        color: "var(--crm-gray-900)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {stage.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--crm-gray-500)",
                        background: "var(--crm-gray-100)",
                        padding: "1px 6px",
                        borderRadius: "var(--crm-radius-full)",
                        fontFamily: "var(--crm-font-mono)",
                        fontWeight: "var(--crm-weight-medium)",
                        flexShrink: 0,
                      }}
                    >
                      {stageDeals.length}
                    </span>
                  </div>
                  {onAddDeal && !isTerminal && (
                    <button
                      onClick={() => onAddDeal(stage.id)}
                      aria-label="Adicionar deal"
                      title="Adicionar deal aqui"
                      className="flex h-5 w-5 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
                      style={{
                        borderRadius: "var(--crm-radius-sm)",
                        color: "var(--crm-gray-500)",
                        flexShrink: 0,
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Linha de meta: valor total + SLA breach */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color:
                        stageType === "won"
                          ? "var(--crm-success-fg)"
                          : "var(--crm-gray-700)",
                      fontFamily: "var(--crm-font-mono)",
                      fontWeight: "var(--crm-weight-medium)",
                    }}
                  >
                    {stageTotal > 0 ? fmtBRLCompact(stageTotal) : "—"}
                  </span>
                  {breachCount > 0 && (
                    <span
                      title={`${breachCount} deal(s) acima do SLA (${slaDays}d)`}
                      style={{
                        fontSize: 10,
                        color: "var(--crm-danger-fg)",
                        background: "var(--crm-danger-bg)",
                        padding: "1px 5px",
                        borderRadius: "var(--crm-radius-sm)",
                        fontWeight: "var(--crm-weight-medium)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
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
                        ? "1px dashed var(--crm-accent)"
                        : "1px dashed transparent",
                      borderRadius: "var(--crm-radius-md)",
                      padding: 4,
                      transition:
                        "background var(--crm-duration-fast) var(--crm-ease), border-color var(--crm-duration-fast) var(--crm-ease)",
                      minHeight: 120,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
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

                    {/* Inline add at bottom — HubSpot pattern */}
                    {onAddDeal && !isTerminal && stageDeals.length > 0 && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        className="hover:bg-[color:var(--crm-gray-100)] hover:border-[color:var(--crm-gray-300)]"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "var(--crm-radius-md)",
                          border: "1px dashed var(--crm-gray-200)",
                          background: "transparent",
                          color: "var(--crm-gray-500)",
                          fontSize: "var(--crm-text-xs)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          marginTop: 2,
                          transition:
                            "background var(--crm-duration-fast) var(--crm-ease), border-color var(--crm-duration-fast) var(--crm-ease)",
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar deal
                      </button>
                    )}

                    {/* Empty state inline */}
                    {stageDeals.length === 0 && onAddDeal && !isTerminal && (
                      <button
                        onClick={() => onAddDeal(stage.id)}
                        className="hover:bg-[color:var(--crm-gray-100)] hover:border-[color:var(--crm-gray-300)]"
                        style={{
                          width: "100%",
                          padding: "20px 12px",
                          borderRadius: "var(--crm-radius-md)",
                          border: "1px dashed var(--crm-gray-200)",
                          background: "transparent",
                          color: "var(--crm-gray-400)",
                          fontSize: "var(--crm-text-xs)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          flexDirection: "column",
                          transition:
                            "background var(--crm-duration-fast) var(--crm-ease), border-color var(--crm-duration-fast) var(--crm-ease)",
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        <span>Adicionar deal</span>
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
