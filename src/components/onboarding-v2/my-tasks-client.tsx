"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ListTodo,
  Loader2,
  Calendar,
  AlertCircle,
  ExternalLink,
} from "lucide-react"
import { ROUTES } from "@/lib/routes"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return j
}

interface MyTask {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  type: string
  assignee_role: string | null
  assignee_id: string | null
  onboarding_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  client?: { id: string; name: string; company: string | null } | null
  store?: { id: string; store_name: string; platform: string | null } | null
  column?: { id: string; name: string; slug: string; color: string } | null
}

type Filter = "all" | "pending" | "in_progress" | "completed"

export function MyTasksClient() {
  const [filter, setFilter] = useState<Filter>("pending")
  const url =
    filter === "all" ? "/api/me/tasks" : `/api/me/tasks?status=${filter}`
  const { data, isLoading, mutate } = useSWR<{
    tasks: MyTask[]
    member: { id: string; role: string }
  }>(url, fetcher)

  const tasks = data?.tasks ?? []
  const role = data?.member?.role ?? "—"

  return (
    <div className="space-y-5">
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
        </div>
        <p className="text-[13px] text-slate-500 dark:text-white/55">
          Inclui tarefas atribuídas a você diretamente OU pendentes na sua
          função.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-white/[0.08]">
        {[
          { id: "pending", label: "Pendentes" },
          { id: "in_progress", label: "Em progresso" },
          { id: "completed", label: "Concluídas" },
          { id: "all", label: "Todas" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id as Filter)}
            className={
              "h-9 px-3 text-[12px] font-medium border-b-2 transition-colors " +
              (filter === f.id
                ? "border-violet-500 text-violet-700 dark:text-violet-400"
                : "border-transparent text-slate-500 dark:text-white/55 hover:text-slate-700")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 rounded-[8px] bg-white dark:bg-[#0F1117] border border-dashed border-slate-300 dark:border-white/[0.10]">
          <ListTodo className="h-10 w-10 text-slate-300 dark:text-white/20 mx-auto mb-3" />
          <p className="text-[13.5px] font-semibold text-slate-700 dark:text-white mb-1">
            Tudo limpo!
          </p>
          <p className="text-[12px] text-slate-500 dark:text-white/55">
            Nenhuma tarefa no filtro selecionado.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onUpdate={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onUpdate,
}: {
  task: MyTask
  onUpdate: () => void
}) {
  const overdue =
    task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed"
  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null

  async function setStatus(newStatus: string) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    onUpdate()
  }

  const href = task.onboarding_id
    ? ROUTES.ADMIN.ONBOARDING_V2.DETAIL(task.onboarding_id)
    : null

  return (
    <div className="flex items-start gap-3 p-3 rounded-[6px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300">
      <input
        type="checkbox"
        checked={task.status === "completed"}
        onChange={() =>
          setStatus(task.status === "completed" ? "pending" : "completed")
        }
        className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3
            className={
              "text-[13px] font-semibold " +
              (task.status === "completed"
                ? "text-slate-400 line-through"
                : "text-slate-900 dark:text-white")
            }
          >
            {task.title}
          </h3>
          {task.priority === "urgent" && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-500/15 px-1.5 py-0.5 rounded">
              Urgente
            </span>
          )}
          {task.priority === "high" && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-500/15 px-1.5 py-0.5 rounded">
              Alta
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-white/55">
          {task.client && <span>{task.client.name}</span>}
          {task.store && <span>· {task.store.store_name}</span>}
          {task.column && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium"
              style={{
                background: `${task.column.color}15`,
                color: task.column.color,
              }}
            >
              {task.column.name}
            </span>
          )}
          {dueLabel && (
            <span
              className={
                "inline-flex items-center gap-1 " +
                (overdue ? "text-red-600 font-semibold" : "")
              }
            >
              {overdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              {dueLabel}
            </span>
          )}
          {!task.assignee_id && task.assignee_role && (
            <span className="inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400 font-medium">
              · disponível pra {task.assignee_role}
            </span>
          )}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-[5px]"
        >
          Abrir
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
