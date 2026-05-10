"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, Search, X, Rocket, Calendar, Layers } from "lucide-react"
import {
  STAGE_CONFIG,
  CAMPAIGN_TYPE_LABELS,
  type CampaignPipelineItem,
  type CampaignStage,
  type CampaignPipelineType,
} from "@/types/campaign-pipeline"
import { CampaignFactoryModal } from "./campaign-factory-modal"
import { CampaignPipelineItemDialog } from "./campaign-pipeline-item-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function CampaignPipelineBoard() {
  const { data, mutate, isLoading } = useSWR<{ items: CampaignPipelineItem[] }>(
    "/api/campaign-pipeline",
    fetcher,
  )
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<CampaignPipelineType | "">("")
  const [editing, setEditing] = useState<CampaignPipelineItem | "new" | null>(
    null,
  )
  const [factoryItem, setFactoryItem] = useState<CampaignPipelineItem | null>(
    null,
  )

  const items = useMemo(() => data?.items ?? [], [data])

  const filtered = useMemo(() => {
    let arr = items
    if (search) {
      const s = search.toLowerCase()
      arr = arr.filter(
        (x) =>
          x.title.toLowerCase().includes(s) ||
          (x.subject_line ?? "").toLowerCase().includes(s),
      )
    }
    if (typeFilter) arr = arr.filter((x) => x.campaign_type === typeFilter)
    return arr
  }, [items, search, typeFilter])

  const itemsByStage = useMemo(() => {
    const map = new Map<CampaignStage, CampaignPipelineItem[]>()
    for (const s of STAGE_CONFIG) map.set(s.key, [])
    for (const it of filtered) {
      map.get(it.stage as CampaignStage)?.push(it)
    }
    return map
  }, [filtered])

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination, source } = result
    if (destination.droppableId === source.droppableId) return
    await fetch(`/api/campaign-pipeline/${draggableId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: destination.droppableId }),
    })
    mutate()
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-white dark:bg-[#0F1117] border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Pipeline de Campanhas
          </h1>
          <span className="text-[11px] font-medium text-slate-400 dark:text-white/40 tabular-nums">
            {filtered.length}
          </span>
        </div>

        <div className="relative w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 rounded-[6px] pl-8 pr-7 text-[12px] bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-white/90 border border-black/[0.06] dark:border-white/[0.06] focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as CampaignPipelineType | "")
          }
          className="h-8 px-3 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] focus:outline-none"
        >
          <option value="">Todos tipos</option>
          {Object.entries(CAMPAIGN_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova campanha
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-5">
            <p className="text-[12px] text-slate-500 dark:text-white/45">
              Carregando...
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 px-5 py-4 h-full">
              {STAGE_CONFIG.map((stg) => {
                const cards = itemsByStage.get(stg.key) ?? []
                return (
                  <div
                    key={stg.key}
                    className="flex flex-col w-[280px] min-w-[280px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08]"
                  >
                    <div
                      className="px-3 py-2.5 rounded-t-[8px] border-b border-black/[0.04] dark:border-white/[0.06]"
                      style={{ background: `${stg.color}15` }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px]">{stg.emoji}</span>
                          <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
                            {stg.label}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
                            {cards.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Droppable droppableId={stg.key}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={
                            "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] " +
                            (snapshot.isDraggingOver
                              ? "bg-blue-50/40 dark:bg-blue-500/[0.03]"
                              : "")
                          }
                        >
                          {cards.map((card, idx) => (
                            <Draggable
                              key={card.id}
                              draggableId={card.id}
                              index={idx}
                            >
                              {(dp, ds) => (
                                <div
                                  ref={dp.innerRef}
                                  {...dp.draggableProps}
                                  {...dp.dragHandleProps}
                                  onClick={() => setEditing(card)}
                                  className={
                                    "group cursor-pointer rounded-[6px] border bg-white dark:bg-[#1A1D27] p-2.5 " +
                                    (ds.isDragging
                                      ? "border-blue-500 shadow-lg rotate-1"
                                      : "border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] hover:shadow-sm")
                                  }
                                >
                                  <Card
                                    item={card}
                                    onDeploy={(e) => {
                                      e.stopPropagation()
                                      setFactoryItem(card)
                                    }}
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
        )}
      </div>

      <CampaignPipelineItemDialog
        open={editing !== null}
        item={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          mutate()
        }}
      />

      {factoryItem && (
        <CampaignFactoryModal
          open={factoryItem !== null}
          item={factoryItem}
          onClose={() => setFactoryItem(null)}
          onCompleted={() => {
            setFactoryItem(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}

function Card({
  item,
  onDeploy,
}: {
  item: CampaignPipelineItem
  onDeploy: (e: React.MouseEvent) => void
}) {
  const stores = item.target_stores ?? []
  const deployed = stores.filter((s) => s.status === "deployed").length
  const isReadyToDeploy = item.stage === "ready_to_deploy"

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-white leading-snug min-w-0 flex-1">
          {item.title}
        </h3>
        {item.campaign_type && (
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30 shrink-0">
            {CAMPAIGN_TYPE_LABELS[item.campaign_type]?.slice(0, 4)}
          </span>
        )}
      </div>

      {item.subject_line && (
        <p className="text-[11px] text-slate-500 dark:text-white/55 truncate mb-1.5">
          {item.subject_line}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-white/55">
          {stores.length > 0 && (
            <span className="tabular-nums">
              {deployed}/{stores.length} lojas
            </span>
          )}
          {item.due_date && (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Calendar className="h-3 w-3" />
              {new Date(item.due_date).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          )}
        </div>

        {isReadyToDeploy && (
          <button
            type="button"
            onClick={onDeploy}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded text-white bg-emerald-600 hover:bg-emerald-700"
          >
            <Rocket className="h-3 w-3" />
            Deploy
          </button>
        )}
      </div>
    </>
  )
}
