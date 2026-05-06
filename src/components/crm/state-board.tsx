"use client"

import { useEffect, useMemo, useState } from "react"
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd"
import type { KanbanStage } from "./kanban-board"
import type { DealCardData } from "./deal-card"
import { Building2 } from "lucide-react"

interface StateBoardProps {
  stages: KanbanStage[]
  deals: Array<DealCardData & { stage_id: string; pipeline_id: string; store?: { id: string; name: string } | null }>
  onMove: (dealId: string, toStageId: string) => Promise<void> | void
  onCardClick?: (id: string) => void
}

const STATE_COLORS: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  ATIVO: {
    bg: "var(--crm-success-bg)",
    fg: "var(--crm-success-fg)",
    border: "var(--crm-success-border)",
    label: "Saudavel",
  },
  EM_RISCO: {
    bg: "var(--crm-warning-bg)",
    fg: "var(--crm-warning-fg)",
    border: "var(--crm-warning-border)",
    label: "Atencao",
  },
  CHURN_PREVISTO: {
    bg: "var(--crm-danger-bg)",
    fg: "var(--crm-danger-fg)",
    border: "var(--crm-danger-border)",
    label: "Critico",
  },
  RECUPERADO: {
    bg: "var(--crm-info-bg)",
    fg: "var(--crm-info-fg)",
    border: "var(--crm-info-border)",
    label: "Recuperado",
  },
  CHURN_CONFIRMADO: {
    bg: "var(--crm-gray-100)",
    fg: "var(--crm-gray-600)",
    border: "var(--crm-gray-300)",
    label: "Perdido",
  },
}

function stateKeyFromName(name: string): string {
  // Normalizes stage name into a state key. Seed uses "ATIVO", "EM_RISCO" etc.
  return name.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z_]/g, "")
}

export function StateBoard({ stages, deals, onMove, onCardClick }: StateBoardProps) {
  const [optimistic, setOptimistic] = useState(deals)
  const [moving, setMoving] = useState(false)

  useEffect(() => setOptimistic(deals), [deals])

  const dealsByStage = useMemo(() => {
    const map = new Map<string, typeof optimistic>()
    for (const s of stages) map.set(s.id, [])
    for (const d of optimistic) {
      const list = map.get(d.stage_id)
      if (list) list.push(d)
    }
    return map
  }, [optimistic, stages])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return

    const moved = optimistic.find((d) => d.id === draggableId)
    if (!moved) return

    setOptimistic((prev) =>
      prev.map((d) => (d.id === moved.id ? { ...d, stage_id: destination.droppableId } : d)),
    )
    setMoving(true)
    try {
      await onMove(draggableId, destination.droppableId)
    } catch {
      setOptimistic(deals)
    } finally {
      setMoving(false)
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid h-full gap-3 p-6" style={{
        gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
        background: "var(--crm-gray-50)",
      }}>
        {stages.map((stage) => {
          const key = stateKeyFromName(stage.name)
          const colors = STATE_COLORS[key] || STATE_COLORS.ATIVO
          const cards = dealsByStage.get(stage.id) || []

          return (
            <Droppable key={stage.id} droppableId={stage.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    background: snapshot.isDraggingOver ? colors.bg : "var(--crm-gray-0)",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "var(--crm-radius-md)",
                    display: "flex",
                    flexDirection: "column",
                    transition: "background var(--crm-duration-fast) var(--crm-ease)",
                  }}
                >
                  {/* Header */}
                  <div
                    className="flex items-center justify-between px-3 py-2"
                    style={{ borderBottom: `1px solid ${colors.border}`, background: colors.bg }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        style={{ width: 8, height: 8, borderRadius: "var(--crm-radius-full)", background: colors.fg }}
                      />
                      <span
                        style={{
                          fontSize: "var(--crm-text-sm)",
                          fontWeight: "var(--crm-weight-medium)",
                          color: colors.fg,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {stage.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "var(--crm-text-xs)",
                        color: colors.fg,
                        fontFamily: "var(--crm-font-mono)",
                        fontWeight: "var(--crm-weight-medium)",
                      }}
                    >
                      {cards.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 overflow-auto p-2">
                    {cards.length === 0 ? (
                      <div
                        className="flex h-20 items-center justify-center text-center"
                        style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-400)" }}
                      >
                        Nenhuma loja neste estado
                      </div>
                    ) : (
                      cards.map((d, idx) => (
                        <Draggable key={d.id} draggableId={d.id} index={idx}>
                          {(dragProvided, dragSnap) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => onCardClick?.(d.id)}
                              style={{
                                ...dragProvided.draggableProps.style,
                                background: "var(--crm-gray-0)",
                                border: "1px solid var(--crm-gray-200)",
                                borderRadius: "var(--crm-radius-md)",
                                padding: 10,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                opacity: moving && dragSnap.isDragging ? 0.5 : 1,
                                boxShadow: dragSnap.isDragging ? "var(--crm-shadow-md)" : undefined,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "var(--crm-text-base)",
                                  fontWeight: "var(--crm-weight-medium)",
                                  color: "var(--crm-gray-900)",
                                  lineHeight: "var(--crm-leading-tight)",
                                }}
                                className="truncate"
                              >
                                {d.title}
                              </div>
                              {d.store && (
                                <div
                                  className="flex items-center gap-1 truncate"
                                  style={{
                                    fontSize: "var(--crm-text-xs)",
                                    color: "var(--crm-gray-500)",
                                  }}
                                >
                                  <Building2 className="h-3 w-3 shrink-0" />
                                  {d.store.name}
                                </div>
                              )}
                              {d.owner && (
                                <div
                                  style={{
                                    fontSize: "var(--crm-text-xs)",
                                    color: "var(--crm-gray-500)",
                                  }}
                                  className="truncate"
                                >
                                  Owner: {d.owner.name}
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          )
        })}
      </div>
    </DragDropContext>
  )
}
