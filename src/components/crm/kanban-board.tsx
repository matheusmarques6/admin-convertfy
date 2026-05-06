"use client"

import { useMemo, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus } from "lucide-react"
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
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)

const STAGE_TYPE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  open: { bg: "var(--crm-gray-100)", fg: "var(--crm-gray-700)", border: "var(--crm-gray-200)" },
  won: { bg: "var(--crm-success-bg)", fg: "var(--crm-success-fg)", border: "var(--crm-success-border)" },
  lost: { bg: "var(--crm-danger-bg)", fg: "var(--crm-danger-fg)", border: "var(--crm-danger-border)" },
  paused: { bg: "var(--crm-warning-bg)", fg: "var(--crm-warning-fg)", border: "var(--crm-warning-border)" },
}

export function KanbanBoard({ stages, deals, onMove, onCardClick, onAddDeal }: KanbanBoardProps) {
  const [optimisticDeals, setOptimisticDeals] = useState(deals)
  const [isMoving, setIsMoving] = useState(false)

  // Sync when prop deals changes (after revalidation)
  useMemo(() => {
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
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const fromList = (dealsByStage.get(source.droppableId) || []).slice()
    const toList = source.droppableId === destination.droppableId
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

    // Optimistic update — recompute positions in destination
    const newOptimistic = optimisticDeals.map((d) => {
      if (d.id === moved.id) return { ...moved }
      return d
    })
    setOptimisticDeals(newOptimistic)

    setIsMoving(true)
    try {
      const newPos = (destination.index + 1) * 10
      await onMove(draggableId, destination.droppableId, newPos)
    } catch (error) {
      // Rollback on error
      setOptimisticDeals(deals)
    } finally {
      setIsMoving(false)
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        className="flex h-full gap-3 overflow-x-auto p-6"
        style={{ background: "var(--crm-gray-50)" }}
      >
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || []
          const stageType = stage.stage_type || "open"
          const colors = STAGE_TYPE_COLORS[stageType] || STAGE_TYPE_COLORS.open
          const stageTotal = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)

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
              {/* Column header */}
              <div
                className="mb-2 flex items-center justify-between px-1"
                style={{ height: 24 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "var(--crm-radius-full)",
                      background: colors.fg,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "var(--crm-text-sm)",
                      fontWeight: "var(--crm-weight-medium)",
                      color: "var(--crm-gray-800)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {stage.name}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--crm-text-xs)",
                      color: "var(--crm-gray-500)",
                    }}
                  >
                    {stageDeals.length}
                  </span>
                </div>
                {onAddDeal && (
                  <button
                    onClick={() => onAddDeal(stage.id)}
                    aria-label="Adicionar deal"
                    className="flex h-5 w-5 items-center justify-center hover:bg-[color:var(--crm-gray-200)]"
                    style={{
                      borderRadius: "var(--crm-radius-sm)",
                      color: "var(--crm-gray-500)",
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Total of stage (if open type and has value) */}
              {stageType === "open" && stageTotal > 0 && (
                <div
                  className="mb-2 px-1"
                  style={{
                    fontSize: "var(--crm-text-xs)",
                    color: "var(--crm-gray-500)",
                    fontFamily: "var(--crm-font-mono)",
                  }}
                >
                  {fmtBRL(stageTotal)}
                </div>
              )}

              {/* Droppable column */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      flex: 1,
                      background: snapshot.isDraggingOver ? "var(--crm-gray-100)" : "transparent",
                      border: snapshot.isDraggingOver ? "1px dashed var(--crm-gray-300)" : "1px dashed transparent",
                      borderRadius: "var(--crm-radius-md)",
                      padding: 4,
                      transition: "background var(--crm-duration-fast) var(--crm-ease)",
                      minHeight: 80,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {stageDeals.map((deal, index) => (
                      <Draggable key={deal.id} draggableId={deal.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: isMoving && dragSnapshot.isDragging ? 0.5 : 1,
                            }}
                          >
                            <DealCard
                              deal={deal}
                              slaHours={stage.sla_hours}
                              onClick={onCardClick}
                              isDragging={dragSnapshot.isDragging}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
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
