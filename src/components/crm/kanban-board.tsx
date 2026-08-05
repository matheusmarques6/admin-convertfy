"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { DealCard, type DealCardData } from "./deal-card"
import { useIsMobile } from "@/hooks/use-is-mobile"

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
  onTransferDeal?: (dealId: string) => void
  onAddActivity?: (dealId: string) => void
  onDuplicateDeal?: (dealId: string) => void
  onDeleteDeal?: (dealId: string) => void
  onEditStage?: (stage: KanbanStage) => void
  onDeleteStage?: (stage: KanbanStage) => void
  /** Modo compacto: cards enxutos (as larguras vêm das CSS vars do wrapper). */
  compact?: boolean
  /**
   * Renderer customizado de card. Permite trocar `DealCard` por
   * `OnboardingCard` (CS) ou outros sem refactorar o board.
   * Recebe o deal/store enriquecido + handlers + stage color.
   */
  renderCard?: (
    item: DealCardData & {
      stage_id: string
      pipeline_id: string
      position?: number
    },
    ctx: {
      stage: KanbanStage
      stageColor: string
      isTerminal: boolean
      isDragging: boolean
      onClick?: (id: string) => void
      onWin?: (id: string) => void
      onLose?: (id: string) => void
      onMove?: (id: string) => void
      onTransfer?: (id: string) => void
      onAddActivity?: (id: string) => void
      onDelete?: (id: string) => void
    },
  ) => React.ReactNode
}

const fmtBRLCompact = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)}k`
  return "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
}

// Cor default por stage_type — usada quando stage.color e null.
const STAGE_TYPE_DEFAULT_COLOR: Record<string, string> = {
  open: "#6B7280",
  won: "#065F46",
  lost: "#991B1B",
  paused: "#D97706",
}

function stageColor(stage: KanbanStage): string {
  if (stage.color) return stage.color
  return STAGE_TYPE_DEFAULT_COLOR[stage.stage_type || "open"] || "#6B7280"
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

/** Hex → rgba com alpha. */
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
  onTransferDeal,
  onAddActivity,
  onDuplicateDeal,
  onDeleteDeal,
  onEditStage,
  onDeleteStage,
  compact = false,
  renderCard,
}: KanbanBoardProps) {
  const [optimisticDeals, setOptimisticDeals] = useState(deals)
  const [isMoving, setIsMoving] = useState(false)
  const isMobile = useIsMobile()
  const [activeMobileStageId, setActiveMobileStageId] = useState<string | null>(
    null,
  )
  const pillsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOptimisticDeals(deals)
  }, [deals])

  // Inicializa stage ativa em mobile com a primeira (ou primeira nao-terminal)
  useEffect(() => {
    if (!isMobile || activeMobileStageId) return
    const first = stages.find((s) => s.stage_type !== "won" && s.stage_type !== "lost") ?? stages[0]
    if (first) setActiveMobileStageId(first.id)
  }, [isMobile, stages, activeMobileStageId])

  // Auto-centraliza a pill ativa quando muda
  useEffect(() => {
    if (!isMobile || !activeMobileStageId || !pillsRef.current) return
    const active = pillsRef.current.querySelector(
      `[data-stage-id="${activeMobileStageId}"]`,
    ) as HTMLElement | null
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
    }
  }, [isMobile, activeMobileStageId])

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

    const current = optimisticDeals.find((d) => d.id === draggableId)
    if (!current) return

    // Copia — nunca mutar o objeto vindo do prop `deals`. Se mutar, o
    // revert em caso de falha da API (setOptimisticDeals(deals)) devolve
    // o MESMO objeto já alterado e o card fica preso na coluna errada
    // até o próximo refetch.
    const newPos = (destination.index + 1) * 10
    const movedCopy = {
      ...current,
      stage_id: destination.droppableId,
      position: newPos,
    } as typeof current
    setOptimisticDeals(
      optimisticDeals.map((d) => (d.id === draggableId ? movedCopy : d)),
    )

    setIsMoving(true)
    try {
      await onMove(draggableId, destination.droppableId, newPos)
    } catch {
      setOptimisticDeals(deals)
    } finally {
      setIsMoving(false)
    }
  }

  // Em mobile, renderiza so a stage ativa (selecionada pelas pills)
  const visibleStages = isMobile && activeMobileStageId
    ? stages.filter((s) => s.id === activeMobileStageId)
    : stages

  // Counts por stage pra exibir nas pills
  const stageCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const s of stages) counts[s.id] = dealsByStage.get(s.id)?.length ?? 0
    return counts
  }, [stages, dealsByStage])

  // Onde o FAB cai (primeira stage nao-terminal)
  const firstOpenStage = stages.find(
    (s) => s.stage_type !== "won" && s.stage_type !== "lost",
  )

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div
        className="flex h-full flex-col relative"
        style={{
          background: "var(--crm-gray-100)",
          fontFamily: "var(--crm-font-sans)",
        }}
      >
        {/* Pill picker mobile (artboard 13 do prototipo) */}
        {isMobile && (
          <div
            ref={pillsRef}
            className="flex gap-2 overflow-x-auto shrink-0"
            style={{
              padding: "8px 16px 12px",
              background: "var(--crm-gray-0)",
              borderBottom: "1px solid var(--crm-border)",
              scrollbarWidth: "none",
            }}
          >
            {stages.map((s) => {
              const isActive = s.id === activeMobileStageId
              const dot = stageColor(s)
              const count = stageCounts[s.id] ?? 0
              return (
                <button
                  key={s.id}
                  data-stage-id={s.id}
                  onClick={() => setActiveMobileStageId(s.id)}
                  className="cf-focusable inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  style={{
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 999,
                    background: isActive ? "var(--crm-gray-900)" : "var(--crm-gray-0)",
                    color: isActive ? "#fff" : "var(--crm-gray-700)",
                    border: isActive ? "none" : "1px solid var(--crm-border)",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isActive ? "#fff" : dot,
                      opacity: isActive ? 0.6 : 1,
                    }}
                  />
                  {s.name}
                  <span
                    className="crm-tnum"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      opacity: 0.7,
                    }}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div
          className="flex flex-1 overflow-x-auto items-stretch gap-3 md:gap-[18px] px-4 md:px-7 py-5 md:py-[22px] pb-7"
          style={{
            scrollSnapType: isMobile ? "x mandatory" : undefined,
          }}
        >
          {visibleStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || []
          const stageType = stage.stage_type || "open"
          const color = stageColor(stage)
          const stageTotal = stageDeals.reduce(
            (sum, d) => sum + (d.value || 0),
            0,
          )
          const slaDays = stage.sla_hours ? Math.ceil(stage.sla_hours / 24) : null
          const atRiskCount = stageDeals.filter((d) => {
            if (d.warn || d.critical) return true
            if (slaDays != null && daysSince(d.last_stage_changed_at) > slaDays) return true
            return false
          }).length
          const isTerminal = stageType === "won" || stageType === "lost"

          return (
            <div
              key={stage.id}
              className="flex flex-col shrink-0"
              style={{
                width: "var(--crm-column-kanban-width)",
                minHeight: 0,
                background: "var(--crm-gray-25)",
                border: "1px solid var(--crm-gray-200)",
                borderRadius: "var(--crm-radius-2xl)",
                overflow: "hidden",
              }}
            >
              {/* ── Top stripe: cor do stage ── */}
              <div
                aria-hidden
                style={{ height: 3, background: color }}
              />

              {/* ── Header ── */}
              <div
                style={{
                  padding: "14px 14px 12px",
                  background: "var(--crm-gray-0)",
                  borderBottom: "1px solid var(--crm-gray-100)",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span
                    className="flex-1 truncate"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--crm-gray-900)",
                    }}
                    title={stage.name}
                  >
                    {stage.name}
                  </span>
                  <span
                    className="crm-tnum"
                    style={{
                      fontSize: 11,
                      color: "var(--crm-gray-500)",
                      fontWeight: 600,
                      padding: "1px 7px",
                      background: "var(--crm-gray-100)",
                      borderRadius: 9999,
                    }}
                  >
                    {stageDeals.length}
                  </span>
                  <StageMenu
                    stage={stage}
                    isTerminal={isTerminal}
                    onEditStage={onEditStage}
                    onDeleteStage={onDeleteStage}
                  />
                  {onAddDeal && !isTerminal && (
                    <button
                      onClick={() => onAddDeal(stage.id)}
                      title="Adicionar deal"
                      className="flex h-6 w-6 items-center justify-center rounded-[4px] cf-focusable"
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--crm-gray-400)",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-gray-100)"))}
                      onMouseLeave={(e) => ((e.currentTarget.style.background = "transparent"))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Subtotal + atrisk */}
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className="crm-tnum truncate"
                    style={{
                      fontSize: 11,
                      color: "var(--crm-gray-600)",
                      fontWeight: 500,
                    }}
                  >
                    {stageTotal > 0 ? (
                      <>
                        {fmtBRLCompact(stageTotal)}
                        <span style={{ color: "var(--crm-gray-400)", fontWeight: 400 }}>
                          {" "}em pipe
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "var(--crm-gray-400)" }}>Sem valor</span>
                    )}
                  </span>
                  {atRiskCount > 0 ? (
                    <span
                      className="crm-tnum inline-flex items-center gap-1"
                      style={{
                        fontSize: 10,
                        color: "var(--crm-warn)",
                        fontWeight: 600,
                      }}
                      title={`${atRiskCount} deal(s) precisam atenção`}
                    >
                      <Flag className="h-2.5 w-2.5" />
                      {atRiskCount}
                    </span>
                  ) : (
                    slaDays && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--crm-gray-400)",
                          fontWeight: 500,
                        }}
                      >
                        SLA {slaDays}d
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* ── Droppable column ── */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 flex flex-col overflow-y-auto"
                    style={{
                      gap: 12,
                      padding: "14px 12px 16px",
                      background: snapshot.isDraggingOver
                        ? hexAlpha(color, 0.06)
                        : "transparent",
                      transition: "background 150ms ease",
                      minHeight: 200,
                    }}
                  >
                    {stageDeals.length === 0 && !snapshot.isDraggingOver ? (
                      <EmptyColumn color={color} onAddDeal={onAddDeal ? () => onAddDeal(stage.id) : undefined} isTerminal={isTerminal} />
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
                            {renderCard ? (
                              renderCard(deal, {
                                stage,
                                stageColor: color,
                                isTerminal,
                                isDragging: dragSnapshot.isDragging,
                                onClick: onCardClick,
                                onWin: !isTerminal ? onWinDeal : undefined,
                                onLose: !isTerminal ? onLoseDeal : undefined,
                                onMove: onMoveDeal,
                                onTransfer: onTransferDeal,
                                onAddActivity,
                                onDelete: onDeleteDeal,
                              })
                            ) : (
                              <DealCard
                                deal={deal}
                                slaHours={stage.sla_hours}
                                stageColor={color}
                                onClick={onCardClick}
                                onWin={!isTerminal ? onWinDeal : undefined}
                                onLose={!isTerminal ? onLoseDeal : undefined}
                                onMove={onMoveDeal}
                                onTransfer={onTransferDeal}
                                onAddActivity={onAddActivity}
                                onDuplicate={onDuplicateDeal}
                                onDelete={onDeleteDeal}
                                isDragging={dragSnapshot.isDragging}
                                compact={compact}
                              />
                            )}
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

        {/* FAB mobile (artboard 13/14): primary action no canto inferior direito */}
        {isMobile && onAddDeal && firstOpenStage && (
          <button
            onClick={() => onAddDeal(activeMobileStageId ?? firstOpenStage.id)}
            aria-label="Novo deal"
            title="Novo deal"
            className="cf-focusable absolute"
            style={{
              right: 20,
              bottom: 24,
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              border: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(78, 98, 216, 0.40)",
            }}
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>
    </DragDropContext>
  )
}

// ─── Empty column ────────────────────────────────────────────────

function EmptyColumn({
  color,
  onAddDeal,
  isTerminal,
}: {
  color: string
  onAddDeal?: () => void
  isTerminal: boolean
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        padding: "24px 12px",
        border: "1.5px dashed var(--crm-gray-200)",
        borderRadius: "var(--crm-radius-xl)",
        background: "var(--crm-gray-0)",
      }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full mb-2.5"
        style={{
          background: hexAlpha(color, 0.1),
          color,
        }}
        aria-hidden
      >
        <Plus className="h-4 w-4" />
      </div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--crm-gray-700)",
          marginBottom: 4,
        }}
      >
        Sem deals nesta etapa
      </p>
      {onAddDeal && !isTerminal && (
        <button
          onClick={onAddDeal}
          style={{
            fontSize: 11,
            color: "var(--crm-brand)",
            fontWeight: 500,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          + Adicionar deal
        </button>
      )}
    </div>
  )
}

// ─── Stage menu (⋯) ──────────────────────────────────────────────

function StageMenu({
  stage,
  isTerminal,
  onEditStage,
  onDeleteStage,
}: {
  stage: KanbanStage
  isTerminal: boolean
  onEditStage?: (stage: KanbanStage) => void
  onDeleteStage?: (stage: KanbanStage) => void
}) {
  if (!onEditStage && !onDeleteStage) return null
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Opções da etapa"
          title="Ações da etapa"
          className="flex h-6 w-6 items-center justify-center rounded-[4px] cf-focusable"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-400)",
          }}
          onMouseEnter={(e) => ((e.currentTarget.style.background = "var(--crm-gray-100)"))}
          onMouseLeave={(e) => ((e.currentTarget.style.background = "transparent"))}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[180px] rounded-[6px] py-1"
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          {onEditStage && (
            <DropdownMenu.Item
              onClick={() => onEditStage(stage)}
              className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer outline-none data-[highlighted]:bg-slate-50"
              style={{ color: "var(--crm-gray-700)" }}
            >
              <Pencil className="h-3.5 w-3.5" style={{ color: "var(--crm-gray-400)" }} />
              Editar etapa
            </DropdownMenu.Item>
          )}
          {onDeleteStage && !isTerminal && (
            <>
              <DropdownMenu.Separator
                className="h-px my-1"
                style={{ background: "var(--crm-gray-100)" }}
              />
              <DropdownMenu.Item
                onClick={() => onDeleteStage(stage)}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer outline-none data-[highlighted]:bg-red-50"
                style={{ color: "var(--crm-neg)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir etapa
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
