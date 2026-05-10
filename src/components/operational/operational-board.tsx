"use client"

/**
 * Operational Board — Kanban Monday-style para pipelines operacionais.
 * Colunas customizaveis por pipeline (vem do JSONB), drag-and-drop
 * via @hello-pangea/dnd, automacoes disparadas no backend ao mover.
 */

import { useState, useMemo, useEffect } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { Plus, Calendar, AlertTriangle, Clock } from "lucide-react"
import type {
  OperationalColumn,
  OperationalPipeline,
} from "@/types/operational-pipeline"
import { OperationalHeader } from "./operational-header"
import { OperationalTaskDialog } from "./operational-task-dialog"

interface OperationalTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  tags: string[]
  position: number
  operational_column_id: string | null
  assignee?: {
    id: string
    profile?: { id: string; name: string; avatar_url: string | null } | null
  } | null
  client?: { id: string; name: string } | null
  store?: { id: string; store_name: string; platform: string | null } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  pipelineSlug: string
}

export function OperationalBoard({ pipelineSlug }: Props) {
  const { data, mutate, isLoading } = useSWR<{
    pipeline: OperationalPipeline
    tasks: OperationalTask[]
  }>(`/api/operational-pipelines/${pipelineSlug}/tasks`, fetcher)

  const [search, setSearch] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<string>("")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("")
  const [clientFilter, setClientFilter] = useState<string>("")
  const [storeFilter, setStoreFilter] = useState<string>("")
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)

  const pipeline = data?.pipeline
  const tasks = useMemo(() => data?.tasks ?? [], [data])

  // Realtime: escuta mudanças na tabela tasks desta pipeline e revalida.
  // Outros usuarios movendo cards/criando tasks aparecem ao vivo.
  useEffect(() => {
    if (!pipeline?.id) return
    const supabase = createClient()
    const channel = supabase
      .channel(`op-board-${pipeline.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `operational_pipeline_id=eq.${pipeline.id}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [pipeline?.id, mutate])

  const sortedColumns = useMemo<OperationalColumn[]>(() => {
    if (!pipeline) return []
    return [...(pipeline.columns ?? [])].sort((a, b) => a.position - b.position)
  }, [pipeline])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (search) {
      const s = search.toLowerCase()
      t = t.filter(
        (x) =>
          x.title.toLowerCase().includes(s) ||
          (x.description ?? "").toLowerCase().includes(s),
      )
    }
    if (priorityFilter) t = t.filter((x) => x.priority === priorityFilter)
    if (assigneeFilter) t = t.filter((x) => x.assignee?.id === assigneeFilter)
    if (clientFilter) t = t.filter((x) => x.client?.id === clientFilter)
    if (storeFilter) t = t.filter((x) => x.store?.id === storeFilter)
    return t
  }, [tasks, search, priorityFilter, assigneeFilter, clientFilter, storeFilter])

  // Listas distintas pra preencher dropdowns. Aparecem so quando ha
  // tasks com client/store associado.
  const distinctClients = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const t of tasks) {
      if (t.client?.id && !seen.has(t.client.id)) {
        seen.set(t.client.id, { id: t.client.id, name: t.client.name })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const distinctStores = useMemo(() => {
    const seen = new Map<string, { id: string; store_name: string }>()
    for (const t of tasks) {
      if (t.store?.id && !seen.has(t.store.id)) {
        seen.set(t.store.id, {
          id: t.store.id,
          store_name: t.store.store_name,
        })
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.store_name.localeCompare(b.store_name),
    )
  }, [tasks])

  const tasksByCol = useMemo(() => {
    const map = new Map<string, OperationalTask[]>()
    for (const col of sortedColumns) map.set(col.id, [])
    for (const t of filteredTasks) {
      if (!t.operational_column_id) continue
      map.get(t.operational_column_id)?.push(t)
    }
    return map
  }, [filteredTasks, sortedColumns])

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !pipeline) return
    const { draggableId, destination, source } = result
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return

    // Reordenacao dentro da mesma coluna -> PATCH em /api/tasks/[id]
    // (aceita position). Cross-coluna usa /move-task que tambem dispara
    // automacoes de task_moved_to.
    if (destination.droppableId === source.droppableId) {
      await fetch(`/api/tasks/${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: destination.index * 10 }),
      })
    } else {
      await fetch(`/api/operational-pipelines/${pipeline.id}/move-task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: draggableId,
          column_id: destination.droppableId,
          position: destination.index * 10,
        }),
      })
    }
    mutate()
  }

  const owners = useMemo(() => {
    const seen = new Map<
      string,
      { id: string; name: string; avatar_url: string | null }
    >()
    for (const t of tasks) {
      const p = t.assignee?.profile
      if (p && t.assignee?.id && !seen.has(t.assignee.id)) {
        seen.set(t.assignee.id, {
          id: t.assignee.id,
          name: p.name,
          avatar_url: p.avatar_url,
        })
      }
    }
    return Array.from(seen.values())
  }, [tasks])

  if (isLoading || !pipeline) {
    return <BoardSkeleton />
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      <OperationalHeader
        pipeline={pipeline}
        taskCount={filteredTasks.length}
        totalTasks={tasks.length}
        search={search}
        onSearchChange={setSearch}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={setAssigneeFilter}
        clientFilter={clientFilter}
        onClientChange={setClientFilter}
        storeFilter={storeFilter}
        onStoreChange={setStoreFilter}
        owners={owners}
        clients={distinctClients}
        stores={distinctStores}
        onNewTask={() => setNewTaskColumnId(sortedColumns[0]?.id ?? null)}
        onPipelineUpdated={() => mutate()}
        onClearFilters={() => {
          setSearch("")
          setPriorityFilter("")
          setAssigneeFilter("")
          setClientFilter("")
          setStoreFilter("")
        }}
      />

      <div className="flex-1 min-h-0 overflow-x-auto">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 px-5 py-4 h-full">
            {sortedColumns.map((col) => {
              const colTasks = tasksByCol.get(col.id) ?? []
              const isOverWip =
                col.wip_limit != null && colTasks.length > col.wip_limit
              return (
                <div
                  key={col.id}
                  className="flex flex-col w-[300px] min-w-[300px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08]"
                >
                  {/* Column header */}
                  <div
                    className="px-3 py-2.5 rounded-t-[8px] border-b border-black/[0.04] dark:border-white/[0.06]"
                    style={{ background: `${col.color}15` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: col.color }}
                          aria-hidden
                        />
                        <span className="text-[12px] font-semibold text-slate-900 dark:text-white truncate">
                          {col.name}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
                          {colTasks.length}
                          {col.wip_limit != null && (
                            <span className="text-slate-400 dark:text-white/35">
                              {" / "}
                              {col.wip_limit}
                            </span>
                          )}
                        </span>
                        {isOverWip && (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewTaskColumnId(col.id)}
                        title="Adicionar task"
                        className="text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/85 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={
                          "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] transition-colors " +
                          (snapshot.isDraggingOver
                            ? "bg-blue-50/40 dark:bg-blue-500/[0.03]"
                            : "")
                        }
                      >
                        {colTasks.map((task, idx) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={idx}
                          >
                            {(dp, ds) => (
                              <div
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                {...dp.dragHandleProps}
                                onClick={() => setEditingTaskId(task.id)}
                                className={
                                  "group cursor-pointer rounded-[6px] border bg-white dark:bg-[#1A1D27] p-2.5 transition-all " +
                                  (ds.isDragging
                                    ? "border-blue-500 shadow-lg rotate-1"
                                    : "border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] dark:hover:border-white/[0.15] hover:shadow-sm")
                                }
                              >
                                <TaskCard task={task} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <button
                            type="button"
                            onClick={() => setNewTaskColumnId(col.id)}
                            className="w-full py-3 text-center text-[11px] text-slate-400 dark:text-white/35 hover:text-slate-600 dark:hover:text-white/60 border border-dashed border-slate-200 dark:border-white/[0.06] rounded-[6px]"
                          >
                            + Nova task
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
      </div>

      <OperationalTaskDialog
        open={newTaskColumnId !== null || editingTaskId !== null}
        pipelineId={pipeline.id}
        pipelineSlug={pipeline.slug}
        columns={sortedColumns}
        defaultColumnId={newTaskColumnId}
        editingTaskId={editingTaskId}
        onClose={() => {
          setNewTaskColumnId(null)
          setEditingTaskId(null)
        }}
        onSaved={() => {
          setNewTaskColumnId(null)
          setEditingTaskId(null)
          mutate()
        }}
      />
    </div>
  )
}

function TaskCard({ task }: { task: OperationalTask }) {
  const isOverdue =
    task.due_date && new Date(task.due_date).getTime() < Date.now()
  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-white leading-snug min-w-0 flex-1">
          {task.title}
        </h3>
        {task.priority === "urgent" && (
          <span
            className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30"
            title="Urgente"
          >
            Urg
          </span>
        )}
        {task.priority === "high" && (
          <span
            className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30"
            title="Alta"
          >
            Alta
          </span>
        )}
      </div>

      {(task.client || task.store) && (
        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-white/55 mb-1.5 truncate">
          {task.store?.store_name || task.client?.name}
        </div>
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {task.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/65"
            >
              {t}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[9px] text-slate-400 dark:text-white/35">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assignee?.profile && (
            <Avatar
              name={task.assignee.profile.name}
              avatarUrl={task.assignee.profile.avatar_url}
            />
          )}
        </div>
        {task.due_date && (
          <div
            className={
              "flex items-center gap-1 text-[10px] font-medium tabular-nums shrink-0 " +
              (isOverdue
                ? "text-red-600 dark:text-red-400"
                : "text-slate-500 dark:text-white/55")
            }
          >
            {isOverdue ? (
              <Clock className="h-3 w-3" />
            ) : (
              <Calendar className="h-3 w-3" />
            )}
            {new Date(task.due_date).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Avatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className="h-5 w-5 rounded-full object-cover"
      />
    )
  }
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 dark:bg-white/[0.10] text-[9px] font-semibold text-slate-700 dark:text-white/80">
      {initials}
    </span>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      <div className="h-14 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#0F1117]" />
      <div className="flex gap-3 p-5 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-[300px] min-w-[300px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08] p-3 animate-pulse"
          >
            <div className="h-4 w-24 bg-slate-200 dark:bg-white/[0.06] rounded mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((__, j) => (
                <div
                  key={j}
                  className="h-20 bg-slate-100 dark:bg-white/[0.04] rounded"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

