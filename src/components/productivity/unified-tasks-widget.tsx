"use client"

/**
 * Widget de Tarefas Unificadas pro dashboard /admin/productivity.
 *
 * Consome /api/me/tasks (mesma fonte de /admin/me e Onboarding detail).
 * Mostra tasks pendentes de TODAS as fontes (onboarding, CRM, etc.) com
 * filtros simples: Hoje | Esta semana | Atrasadas. Click numa task abre
 * a origem.
 *
 * Sincronizado com /admin/me — quando marca concluida aqui, some dos dois.
 */

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ListTodo, ArrowRight } from "lucide-react"
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

type DateFilter = "today" | "week" | "overdue"

const LABELS: Record<DateFilter, string> = {
  today: "Hoje",
  week: "Esta semana",
  overdue: "Atrasadas",
}

export function UnifiedTasksWidget() {
  const [filter, setFilter] = useState<DateFilter>("today")
  const url = useMemo(
    () => `/api/me/tasks?status=pending&date_filter=${filter}`,
    [filter],
  )
  const { data, mutate, isLoading } = useSWR<{
    tasks: TaskRowData[]
    counts: { total: number }
  }>(url, fetcher, { refreshInterval: 30000 })

  const tasks = (data?.tasks ?? []).slice(0, 6) // top 6
  const total = data?.counts?.total ?? 0

  async function completeTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? "Falha")
    }
    mutate()
  }

  return (
    <div className="rounded-[8px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <ListTodo className="h-3 w-3" />
          </span>
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
            Tarefas do time
          </h3>
          <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-white/40">
            {total}
          </span>
        </div>
        <Link
          href="/admin/me"
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700"
        >
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 dark:border-white/[0.06] flex items-center gap-1">
        {(["today", "week", "overdue"] as DateFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "h-7 px-2.5 text-[11.5px] font-medium rounded-[5px] transition-colors " +
              (filter === f
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                : "text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/[0.06]")
            }
          >
            {LABELS[f]}
          </button>
        ))}
      </div>

      <div className="p-3">
        {isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] animate-pulse"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[13px] font-semibold text-slate-700 dark:text-white/80">
              Nada {LABELS[filter].toLowerCase()}
            </p>
            <p className="text-[11.5px] text-slate-500 dark:text-white/55 mt-1">
              {filter === "today"
                ? "Você está com o dia leve. Aproveita pra adiantar coisas."
                : filter === "week"
                  ? "Sem tarefas pendentes essa semana."
                  : "Nenhuma tarefa atrasada — manda bem."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onComplete={completeTask} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
