"use client"

import { Droppable, Draggable } from "@hello-pangea/dnd"
import { cn } from "@/lib/utils"
import type { BoardCard, BoardColumnKey } from "@/types/campaign-board"
import type { ProductionDesigner } from "@/types/campaign-production"
import { BoardCardView } from "./board-card"

interface ColumnDef {
  key: BoardColumnKey
  label: string
  color: string
  hint: string
}

interface Props {
  column: ColumnDef
  cards: BoardCard[]
  designers: ProductionDesigner[]
  onOpen: (card: BoardCard) => void
  onMove: (card: BoardCard, to: BoardColumnKey) => void
  onReject: (card: BoardCard) => void
  onCopy: (card: BoardCard) => void
  onWorkspace: (card: BoardCard) => void
}

export function BoardColumn({
  column,
  cards,
  designers,
  onOpen,
  onMove,
  onReject,
  onCopy,
  onWorkspace,
}: Props) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col self-stretch">
      {/* Header */}
      <div className="px-1 pb-2.5 pt-0.5">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="size-2 rounded-[3px]" style={{ background: column.color }} />
          <span className="text-[12.5px] font-bold text-foreground">{column.label}</span>
          <span className="inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full border border-border bg-card px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {cards.length}
          </span>
        </div>
        <div className="pl-[18px] text-[10.5px] leading-snug text-muted-foreground/80">
          {column.hint}
        </div>
      </div>

      {/* Droppable */}
      <Droppable droppableId={column.key}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex min-h-[420px] flex-1 flex-col gap-2.5 rounded-[8px] border p-2.5 transition-colors duration-150",
              snapshot.isDraggingOver ? "bg-primary/5" : "border-border bg-muted/30",
            )}
            style={{
              borderColor: snapshot.isDraggingOver ? column.color : undefined,
            }}
          >
            {cards.length === 0 && !snapshot.isDraggingOver && (
              <div className="rounded-[6px] border border-dashed border-border px-2.5 py-6 text-center text-[11px] text-muted-foreground/60">
                —
              </div>
            )}
            {cards.length === 0 && snapshot.isDraggingOver && (
              <div
                className="rounded-[6px] border border-dashed px-2.5 py-6 text-center text-[11px]"
                style={{ borderColor: column.color, color: column.color }}
              >
                Soltar aqui
              </div>
            )}
            {cards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                  >
                    <BoardCardView
                      card={card}
                      designers={designers}
                      dragging={dragSnapshot.isDragging}
                      dragHandleProps={dragProvided.dragHandleProps}
                      onOpen={onOpen}
                      onMove={onMove}
                      onReject={onReject}
                      onCopy={onCopy}
                      onWorkspace={onWorkspace}
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
}
