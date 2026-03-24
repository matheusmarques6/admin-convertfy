"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { BrandIcon, BRAND_ICONS } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useMediaQuery } from "@/hooks/use-media-query"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { OnboardingStoreItem } from "@/app/admin/onboarding/page"

// ─── Types ───────────────────────────────────────────────

interface OnboardingOverviewClientProps {
  items: OnboardingStoreItem[]
  allItems: OnboardingStoreItem[]
  kpis: {
    totalActive: number
    avgDaysToComplete: number
    completionRate: number
    busiestPhase: string
    busiestPhaseCount: number
  }
  phases: string[]
  phaseLabels: Record<string, string>
}

type ViewTab = "board" | "list"

// ─── Helpers ─────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}

function getPlatformIcon(platform: string) {
  if (platform === "shopify") return BRAND_ICONS.shopify
  return BRAND_ICONS.shopify // default
}

// ─── KPI Cards ───────────────────────────────────────────

function KPICards({ kpis }: { kpis: OnboardingOverviewClientProps["kpis"] }) {
  const cards = [
    { label: "Em onboarding", value: String(kpis.totalActive), mono: true },
    {
      label: "Média dias p/ completar",
      value: kpis.avgDaysToComplete > 0 ? `${kpis.avgDaysToComplete}d` : "—",
      mono: true,
    },
    {
      label: "Conclusão 30d",
      value: `${kpis.completionRate}%`,
      mono: true,
    },
    {
      label: "Fase com mais lojas",
      value: kpis.busiestPhase,
      sub: kpis.busiestPhaseCount > 0 ? `${kpis.busiestPhaseCount} lojas` : undefined,
      mono: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-card p-4"
        >
          <p className="text-xs text-gray-500 dark:text-[#8B92A5] mb-1">{card.label}</p>
          <p
            className={cn(
              "text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]",
              card.mono && "font-mono tabular-nums"
            )}
          >
            {card.value}
          </p>
          {card.sub && (
            <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-0.5">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Board Column Card ───────────────────────────────────

function OnboardingBoardCard({ item }: { item: OnboardingStoreItem }) {
  return (
    <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-3 dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]">
      <div className="flex items-center gap-2 mb-1.5">
        <BrandIcon src={getPlatformIcon(item.platform)} alt={item.platform} size={16} />
        <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
          {item.storeName}
        </span>
      </div>
      <span className="text-xs text-gray-500 dark:text-[#8B92A5]">{item.clientName}</span>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
          Início: {formatDate(item.startDate)}
        </span>
        <span
          className={cn(
            "text-[11px] font-mono tabular-nums font-semibold",
            item.daysInPhase > 7
              ? "text-[#92400E] dark:text-[#FCD34D]"
              : "text-gray-400 dark:text-[#5C6378]"
          )}
        >
          {item.daysInPhase}d nesta fase
        </span>
      </div>
    </div>
  )
}

// ─── Board View (Kanban) ─────────────────────────────────

function BoardView({
  items,
  phases,
  phaseLabels,
  onMoveItem,
  onClickItem,
}: {
  items: OnboardingStoreItem[]
  phases: string[]
  phaseLabels: Record<string, string>
  onMoveItem: (itemId: string, newPhase: string) => void
  onClickItem: (item: OnboardingStoreItem) => void
}) {
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [mobilePhaseIdx, setMobilePhaseIdx] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Group items by phase
  const byPhase = useMemo(() => {
    const map: Record<string, OnboardingStoreItem[]> = {}
    phases.forEach((p) => (map[p] = []))
    items.forEach((item) => {
      if (map[item.phase]) {
        map[item.phase].push(item)
      }
    })
    return map
  }, [items, phases])

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return
      const itemId = result.draggableId
      const newPhase = result.destination.droppableId
      if (result.source.droppableId !== newPhase) {
        onMoveItem(itemId, newPhase)
      }
    },
    [onMoveItem]
  )

  // Mobile: single column + swipe
  if (isMobile) {
    const currentPhase = phases[mobilePhaseIdx]
    const phaseItems = byPhase[currentPhase] || []

    return (
      <div>
        {/* Phase selector with arrows */}
        <div className="flex items-center justify-between mb-4 px-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={mobilePhaseIdx === 0}
            onClick={() => setMobilePhaseIdx((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {phaseLabels[currentPhase]}
            </p>
            <p className="text-xs text-gray-400 dark:text-[#5C6378]">
              {phaseItems.length} {phaseItems.length === 1 ? "loja" : "lojas"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={mobilePhaseIdx === phases.length - 1}
            onClick={() => setMobilePhaseIdx((i) => Math.min(phases.length - 1, i + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Dots indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {phases.map((_, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-150",
                i === mobilePhaseIdx
                  ? "bg-[#4E62D8] dark:bg-[#7B8CEA]"
                  : "bg-gray-200 dark:bg-[#2E3347]"
              )}
              onClick={() => setMobilePhaseIdx(i)}
              aria-label={phaseLabels[phases[i]]}
            />
          ))}
        </div>

        {/* Cards */}
        <div className="space-y-2 px-1">
          {phaseItems.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-[#5C6378] py-8">
              Nenhuma loja nesta fase
            </p>
          ) : (
            phaseItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onClickItem(item)}
                className="cursor-pointer"
              >
                <OnboardingBoardCard item={item} />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Desktop: horizontal kanban columns
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4"
        style={{ minHeight: 320 }}
      >
        {phases.map((phase) => {
          const phaseItems = byPhase[phase] || []
          return (
            <div
              key={phase}
              className="flex flex-col shrink-0"
              style={{ width: 240, minWidth: 240 }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-2 py-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-gray-500 dark:text-[#5C6378]">
                  {phaseLabels[phase]}
                </span>
                <Badge variant="neutral" showDot={false}>
                  {phaseItems.length}
                </Badge>
              </div>

              {/* Droppable column */}
              <Droppable droppableId={phase}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 space-y-2 p-1 rounded-[8px] min-h-[120px]",
                      "transition-colors duration-150",
                      snapshot.isDraggingOver && "bg-[#4E62D8]/5 dark:bg-[#7B8CEA]/5"
                    )}
                  >
                    {phaseItems.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-center text-xs text-gray-400 dark:text-[#5C6378] py-6">
                        Nenhuma loja nesta fase
                      </p>
                    )}
                    {phaseItems.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              "transition-shadow duration-150",
                              dragSnapshot.isDragging && "shadow-lg"
                            )}
                            onClick={() => onClickItem(item)}
                          >
                            <OnboardingBoardCard item={item} />
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

// ─── List View (DataTable) ───────────────────────────────

function ListView({
  items,
  phaseLabels: _phaseLabels,
  onClickItem,
}: {
  items: OnboardingStoreItem[]
  phaseLabels: Record<string, string>
  onClickItem: (item: OnboardingStoreItem) => void
}) {
  const columns: ColumnDef<OnboardingStoreItem>[] = useMemo(
    () => [
      {
        accessorKey: "storeName",
        header: "Loja",
        mobilePriority: "title" as const,
        width: "200px",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <BrandIcon src={getPlatformIcon(row.platform)} alt={row.platform} size={16} />
            <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
              {row.storeName}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "clientName",
        header: "Cliente",
        mobilePriority: "detail" as const,
        width: "160px",
      },
      {
        accessorKey: "phaseLabel",
        header: "Fase atual",
        type: "badge" as const,
        mobilePriority: "badge" as const,
        width: "150px",
        cell: (row) => (
          <Badge variant="info" showDot>
            {row.phaseLabel}
          </Badge>
        ),
      },
      {
        accessorKey: "daysInPhase",
        header: "Dias na fase",
        type: "number" as const,
        mobilePriority: "detail" as const,
        width: "120px",
        cell: (row) =>
          row.daysInPhase > 7 ? (
            <StatusBadge status="warning" label={`${row.daysInPhase}d`} />
          ) : (
            <span className="font-mono tabular-nums text-sm text-gray-700 dark:text-[#8B92A5]">
              {row.daysInPhase}d
            </span>
          ),
      },
      {
        accessorKey: "startDate",
        header: "Início",
        mobilePriority: "hidden" as const,
        hideOnTablet: true,
        width: "100px",
        cell: (row) => (
          <span className="text-sm font-mono tabular-nums text-gray-500 dark:text-[#8B92A5]">
            {formatDate(row.startDate)}
          </span>
        ),
      },
      {
        accessorKey: "phaseIndex",
        header: "Progresso",
        mobilePriority: "detail" as const,
        width: "140px",
        cell: (row) => (
          <ProgressBar current={row.phaseIndex + 1} total={row.totalPhases} />
        ),
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      data={items}
      onRowClick={onClickItem}
      rowKey="id"
      emptyMessage="Nenhuma loja em onboarding"
      emptyDescription="Inicie o onboarding de uma loja a partir da página de detalhes da loja."
    />
  )
}

// ─── Main Component ──────────────────────────────────────

export function OnboardingOverviewClient({
  items: initialItems,
  allItems,
  kpis,
  phases,
  phaseLabels,
}: OnboardingOverviewClientProps) {
  const router = useRouter()
  const [viewTab, setViewTab] = useState<ViewTab>("board")
  const [items, setItems] = useState(initialItems)

  // Sync with server data on prop change
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const handleMoveItem = useCallback(
    async (itemId: string, newPhase: string) => {
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                phase: newPhase as OnboardingStoreItem["phase"],
                phaseLabel: phaseLabels[newPhase] || newPhase,
                phaseIndex: phases.indexOf(newPhase),
                daysInPhase: 0,
              }
            : item
        )
      )

      try {
        // Map phase back to status for API
        const statusMap: Record<string, string> = {
          configuracao: "pending_approval",
          briefing: "generating_copies",
          setup_klaviyo: "design",
          primeira_campanha: "implementation",
          go_live: "in_progress",
          feedback_30d: "completed",
        }

        const res = await fetch(`/api/onboarding/${itemId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusMap[newPhase] || newPhase,
            current_phase: newPhase,
          }),
        })

        if (!res.ok) throw new Error("Erro ao mover")

        toast({
          title: "Loja movida",
          description: `Movida para ${phaseLabels[newPhase]}.`,
        })
      } catch {
        // Revert on error
        setItems(initialItems)
        toast({
          variant: "destructive",
          title: "Erro ao mover",
          description: "Não foi possível atualizar a fase.",
        })
      }
    },
    [initialItems, phaseLabels, phases]
  )

  const handleClickItem = useCallback(
    (item: OnboardingStoreItem) => {
      if (item.storeId) {
        router.push(`/admin/stores/${item.storeId}?tab=onboarding`)
      }
    },
    [router]
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <KPICards kpis={kpis} />

      {/* View switcher */}
      <div className="flex items-center justify-between">
        <SegmentedTabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <SegmentedTabItem value="board">
            <Icon icon={LayoutGrid} size={16} className="mr-1.5" />
            Board
          </SegmentedTabItem>
          <SegmentedTabItem value="list">
            <Icon icon={List} size={16} className="mr-1.5" />
            Lista
          </SegmentedTabItem>
        </SegmentedTabs>
      </div>

      {/* Views */}
      {viewTab === "board" ? (
        <BoardView
          items={items}
          phases={phases}
          phaseLabels={phaseLabels}
          onMoveItem={handleMoveItem}
          onClickItem={handleClickItem}
        />
      ) : (
        <ListView
          items={allItems}
          phaseLabels={phaseLabels}
          onClickItem={handleClickItem}
        />
      )}
    </div>
  )
}
