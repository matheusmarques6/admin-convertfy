"use client"

/**
 * /admin/me - Minhas Tarefas (unificadas).
 *
 * Mostra tasks de todas as fontes (onboarding, acompanhamento, project,
 * crm, manual) agrupadas por source_type. Filtros por status e por origem.
 * Owner/manager/coo veem toggle "Minhas / Todas".
 *
 * Fonte unica: GET /api/me/tasks (mesma do dashboard /admin/productivity).
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ListTodo, Loader2, ToggleLeft, ToggleRight } from "lucide-react"
import { TaskRow, TaskGroupHeader, type TaskRowData } from "@/components/tasks/task-row"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

interface ApiResponse {
  tasks: TaskRowData[]
  grouped: Record<string, TaskRowData[]>
  counts: { total: number; by_source: Record<string, number> }
  status_counts: Record<string, number>
  member: {
    id: string
    profile_id: string
    role: string
    is_elevated: boolean
  }
}

type StatusFilter = "all" | "pending" | "in_progress" | "completed"

const STATUS_LABELS: Record<StatusFilter, string> = {
  pending: "Pendentes",
  in_progress: "Em andamento",
  completed: "Concluídas",
  all: "Todas",
}

const SOURCE_ORDER = ["onboarding", "acompanhamento", "project", "crm", "manual"]

export function MyTasksClient() {
  const [status, setStatus] = useState<StatusFilter>("pending")
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [view, setView] = useState<"mine" | "all">("mine")

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (status !== "all") params.set("status", status)
    if (sourceFilter) params.set("source_type", sourceFilter)
    if (view === "all") params.set("view", "all")
    return `/api/me/tasks?${params.toString()}`
  }, [status, sourceFilter, view])

  const { data, isLoading, mutate } = useSWR<ApiResponse>(url, fetcher, {
    refreshInterval: 30000, // refresh a cada 30s pra ficar sync com outras telas
  })

  const role = data?.member?.role ?? "—"
  const isElevated = data?.member?.is_elevated ?? false
  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks])
  const statusCounts = data?.status_counts ?? {
    pending: 0,
    in_progress: 0,
    completed: 0,
  }
  const sourceCounts = data?.counts?.by_source ?? {}

  // Agrupa preservando ordem definida
  const groupedOrdered = useMemo(() => {
    const groups: Array<{ key: string; items: TaskRowData[] }> = []
    for (const key of SOURCE_ORDER) {
      const items = tasks.filter((t) => (t.source_type ?? "manual") === key)
      if (items.length > 0) groups.push({ key, items })
    }
    // Inclui outros source_types que existirem fora da lista padrao
    const otherKeys = Array.from(
      new Set(tasks.map((t) => t.source_type ?? "manual")),
    ).filter((k) => !SOURCE_ORDER.includes(k))
    for (const key of otherKeys) {
      const items = tasks.filter((t) => (t.source_type ?? "manual") === key)
      groups.push({ key, items })
    }
    return groups
  }, [tasks])

  async function completeTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? "Falha")
    }
    mutate()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <ListTodo className="h-3.5 w-3.5" />
            </span>
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
              Minhas tarefas
            </h1>
            <span className="text-[11px] font-mono uppercase tracking-wide text-slate-500 dark:text-white/55 px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06]">
              {role}
            </span>
            {isElevated && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 rounded">
                Owner
              </span>
            )}
          </div>
          <p className="text-[13px] text-slate-500 dark:text-white/55">
            Tudo que tá no seu prato. Onboarding, acompanhamento, projetos —
            tudo num lugar só.
          </p>
        </div>
        {isElevated && (
          <button
            type="button"
            onClick={() => setView((v) => (v === "mine" ? "all" : "mine"))}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/80 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.10] hover:border-slate-300 dark:hover:border-white/[0.14]"
          >
            {view === "mine" ? (
              <>
                <ToggleLeft className="h-4 w-4 text-slate-400" />
                Minhas
              </>
            ) : (
              <>
                <ToggleRight className="h-4 w-4 text-violet-500" />
                Todas do time
              </>
            )}
          </button>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-white/[0.08]">
        {(["pending", "in_progress", "completed", "all"] as StatusFilter[]).map(
          (s) => {
            const count =
              s === "all"
                ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
                : statusCounts[s] ?? 0
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={
                  "inline-flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium border-b-2 transition-colors " +
                  (status === s
                    ? "border-violet-500 text-violet-700 dark:text-violet-400"
                    : "border-transparent text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80")
                }
              >
                {STATUS_LABELS[s]}
                <span
                  className={
                    "tabular-nums text-[10.5px] " +
                    (status === s
                      ? "text-violet-500"
                      : "text-slate-400 dark:text-white/40")
                  }
                >
                  {count}
                </span>
              </button>
            )
          },
        )}
      </div>

      {/* Source filter chips */}
      {Object.keys(sourceCounts).length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSourceFilter(null)}
            className={
              "inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[5px] border transition-colors " +
              (sourceFilter === null
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                : "bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border-slate-200 dark:border-white/[0.10] hover:border-slate-300")
            }
          >
            Todos
            <span className="text-[10px] opacity-60 tabular-nums">
              {tasks.length}
            </span>
          </button>
          {SOURCE_ORDER.filter((k) => sourceCounts[k] > 0).map((key) => {
            const labelMap: Record<string, string> = {
              onboarding: "Onboarding",
              acompanhamento: "Acompanhamento",
              project: "Projetos",
              crm: "CRM",
              manual: "Manual",
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setSourceFilter(sourceFilter === key ? null : key)
                }
                className={
                  "inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[5px] border transition-colors " +
                  (sourceFilter === key
                    ? "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/40"
                    : "bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border-slate-200 dark:border-white/[0.10] hover:border-slate-300")
                }
              >
                {labelMap[key] ?? key}
                <span className="text-[10px] opacity-60 tabular-nums">
                  {sourceCounts[key]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Conteudo */}
      {isLoading ? (
        <TasksSkeleton />
      ) : tasks.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="space-y-1">
          {sourceFilter === null ? (
            // Agrupado por source_type
            groupedOrdered.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <TaskGroupHeader
                  sourceType={group.key}
                  count={group.items.length}
                />
                <div className="space-y-1.5">
                  {group.items.map((t) => (
                    <TaskRow key={t.id} task={t} onComplete={completeTask} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            // Lista plana quando filtro de source ativo
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} onComplete={completeTask} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TasksSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-3 py-2.5 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] animate-pulse"
        >
          <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-white/[0.08] mt-0.5" />
          <div className="h-8 w-8 rounded-[5px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 bg-slate-200 dark:bg-white/[0.08] rounded" />
            <div className="h-2.5 w-1/2 bg-slate-100 dark:bg-white/[0.06] rounded" />
            <div className="h-2.5 w-1/3 bg-slate-100 dark:bg-white/[0.06] rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ status }: { status: StatusFilter }) {
  if (status === "pending") {
    return (
      <div className="text-center py-16 rounded-[8px] bg-white dark:bg-[#0F1117] border border-dashed border-slate-300 dark:border-white/[0.10]">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 mb-3">
          <ListTodo className="h-6 w-6" />
        </div>
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white mb-1">
          Tudo limpo!
        </p>
        <p className="text-[12.5px] text-slate-500 dark:text-white/55 max-w-md mx-auto">
          Você está em dia. Que tal aproveitar pra revisar a semana ou planejar
          o que vem?
        </p>
      </div>
    )
  }
  return (
    <div className="text-center py-12 rounded-[8px] bg-white dark:bg-[#0F1117] border border-dashed border-slate-300 dark:border-white/[0.10]">
      <Loader2 className="h-10 w-10 text-slate-300 dark:text-white/20 mx-auto mb-3" />
      <p className="text-[13.5px] font-semibold text-slate-700 dark:text-white mb-1">
        Nada {STATUS_LABELS[status].toLowerCase()}
      </p>
      <p className="text-[12px] text-slate-500 dark:text-white/55">
        Tente outro filtro pra ver mais tarefas.
      </p>
    </div>
  )
}
