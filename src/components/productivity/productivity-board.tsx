"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  KanbanSquare,
  List,
  Plus,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  canAccessOnboardingStage,
  getOnboardingStageAccess,
  isOnboardingBypass,
} from "@/lib/permissions/onboarding-stage-access"
import { useProductivityStore } from "@/stores/productivity-store"
import type { ProductivityTask, TaskGroup } from "@/types/productivity"
import { TaskDetailDrawer } from "./task-detail-drawer"

type ProjectGroup = TaskGroup & {
  source_type?: string
  onboarding_id?: string
  stage_slug?: string
  stage_name?: string
  stage_color?: string
  stage_role?: string
  plan?: string | null
  mrr_value?: number | string | null
}

type SharedSubItem = {
  slug: string
  label: string
  completed?: boolean
  completed_at?: string | null
  completed_by?: string | null
}

type ProjectTask = ProductivityTask & {
  onboarding_id?: string
  source_type?: string
  metadata?: Record<string, unknown> & { sub_items?: SharedSubItem[] }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  progress: "Em andamento",
  review: "Em revisao",
  done: "Concluida",
}

export function ProductivityBoard() {
  const {
    groups,
    members,
    selectedTaskId,
    selectTask,
    isLoaded,
    isLoading,
    fetchData,
    apiAction,
  } = useProductivityStore()
  const [roles, setRoles] = useState<string[]>([])
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [view, setView] = useState<"list" | "kanban">("list")
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) void fetchData()
  }, [fetchData, isLoaded])

  useEffect(() => {
    let cancelled = false
    void fetch("/api/me/permissions")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return
        const nextRoles = payload?.permissions?.roles
        setRoles(Array.isArray(nextRoles) ? nextRoles : [])
      })
      .finally(() => {
        if (!cancelled) setPermissionsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const refresh = () => void fetchData()
    const interval = window.setInterval(refresh, 15000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetchData])

  const canAdmin = isOnboardingBypass(roles)
  const visibleGroups = useMemo(
    () =>
      (groups as ProjectGroup[]).filter((group) => {
        if (group.source_type !== "onboarding") return true
        return (
          permissionsLoaded &&
          canAccessOnboardingStage(roles, group.stage_slug)
        )
      }),
    [groups, permissionsLoaded, roles],
  )
  const tasks = visibleGroups.flatMap((group) => group.items as ProjectTask[])
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? null
  const selectedGroup = selectedTask
    ? visibleGroups.find((group) =>
        group.items.some((task) => task.id === selectedTask.id),
      )
    : null
  const selectedAccess = getOnboardingStageAccess(
    roles,
    selectedGroup?.stage_slug,
  )

  const toggleSubItem = async (
    task: ProjectTask,
    subItem: SharedSubItem,
  ) => {
    const key = `${task.id}:${subItem.slug}`
    setToggling(key)
    try {
      const response = await fetch(
        `/api/tasks/${task.id}/sub-items/${encodeURIComponent(subItem.slug)}/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: subItem.completed !== true }),
        },
      )
      if (response.ok) await fetchData()
    } finally {
      setToggling(null)
    }
  }

  const createTask = async () => {
    const name = window.prompt("Nome da nova tarefa")
    if (!name?.trim()) return
    await apiAction("create_task", {
      name: name.trim(),
      status: "pending",
      priority: 3,
      group_id: "backlog",
      group_name: "Backlog",
      group_color: "#64748B",
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-[#11131A]">
      <header className="flex items-center justify-between border-b border-black/[0.08] bg-white px-6 py-4 dark:border-white/[0.08] dark:bg-[#1A1D27]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-slate-950 dark:text-white">
              Projetos
            </h1>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-white/[0.08] dark:text-white/70">
              {tasks.length}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/50">
            Onboardings ativos sob responsabilidade das suas funcoes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-slate-200 bg-slate-50 p-0.5 dark:border-white/[0.1] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-sm",
                view === "list"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.1] dark:text-white"
                  : "text-slate-400",
              )}
              title="Lista"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-sm",
                view === "kanban"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.1] dark:text-white"
                  : "text-slate-400",
              )}
              title="Kanban"
            >
              <KanbanSquare className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.04]"
            title="Atualizar"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </button>
          {canAdmin && (
            <button
              type="button"
              onClick={createTask}
              className="inline-flex h-9 items-center gap-2 rounded bg-brand-400 px-3 text-[12px] font-semibold text-white hover:bg-brand"
            >
              <Plus className="h-4 w-4" />
              Nova tarefa
            </button>
          )}
        </div>
      </header>

      <main
        className={cn(
          "min-h-0 flex-1 overflow-auto p-5",
          view === "kanban" &&
            "grid auto-cols-[minmax(300px,1fr)] grid-flow-col gap-4",
        )}
      >
        {!permissionsLoaded || (!isLoaded && isLoading) ? (
          <div className="p-10 text-center text-[13px] text-slate-500">
            Carregando projetos...
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-slate-500">
            Nenhum projeto ativo para suas funcoes.
          </div>
        ) : (
          visibleGroups.map((group) => {
            const isCollapsed = collapsed.has(group.id)
            const access = getOnboardingStageAccess(roles, group.stage_slug)
            const done = group.items.filter(
              (task) => task.status === "done",
            ).length
            return (
              <section
                key={group.id}
                className={cn(
                  "mb-4 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#1A1D27]",
                  view === "kanban" && "mb-0 self-start",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current)
                      if (next.has(group.id)) next.delete(group.id)
                      else next.add(group.id)
                      return next
                    })
                  }
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left dark:border-white/[0.06]"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span
                    className="h-5 w-1 rounded-sm"
                    style={{ background: group.stage_color ?? group.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                      {group.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                      <span>{group.stage_name ?? "Projeto"}</span>
                      {group.stage_role && <span>{group.stage_role}</span>}
                      <span className="font-mono">
                        {done}/{group.items.length}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    {access.responsibleRole}
                  </span>
                </button>

                {!isCollapsed &&
                  (group.items as ProjectTask[]).map((task) => {
                    const subItems = Array.isArray(task.metadata?.sub_items)
                      ? task.metadata.sub_items
                      : []
                    const expanded = expandedTasks.has(task.id)
                    const completedSubItems = subItems.filter(
                      (item) => item.completed,
                    ).length
                    return (
                      <div
                        key={task.id}
                        className="border-b border-slate-100 last:border-b-0 dark:border-white/[0.06]"
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          {subItems.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTasks((current) => {
                                  const next = new Set(current)
                                  if (next.has(task.id)) next.delete(task.id)
                                  else next.add(task.id)
                                  return next
                                })
                              }
                              className="flex h-6 w-6 items-center justify-center text-slate-400"
                              title="Mostrar subitens"
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="h-6 w-6" />
                          )}
                          <button
                            type="button"
                            onClick={() => selectTask(task.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div
                              className={cn(
                                "truncate text-[13px] font-medium text-slate-800 dark:text-white/90",
                                task.status === "done" &&
                                  "text-slate-400 line-through",
                              )}
                            >
                              {task.name}
                            </div>
                            {subItems.length > 0 && (
                              <div className="mt-1 text-[10.5px] text-slate-500">
                                {completedSubItems}/{subItems.length} subitens
                              </div>
                            )}
                          </button>
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10.5px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-white/60">
                            {STATUS_LABELS[task.status] ?? task.status}
                          </span>
                          <span className="w-14 text-right font-mono text-[10.5px] text-slate-400">
                            {task.date}
                          </span>
                        </div>

                        {expanded && subItems.length > 0 && (
                          <div className="bg-slate-50/70 px-14 py-2 dark:bg-white/[0.02]">
                            {subItems.map((subItem) => {
                              const member = members.find(
                                (item) => item.id === subItem.completed_by,
                              )
                              const toggleKey = `${task.id}:${subItem.slug}`
                              return (
                                <label
                                  key={subItem.slug}
                                  className="flex min-h-9 items-center gap-2 border-b border-slate-100 py-1.5 last:border-b-0 dark:border-white/[0.05]"
                                >
                                  <button
                                    type="button"
                                    disabled={
                                      !access.canWork || toggling === toggleKey
                                    }
                                    onClick={() =>
                                      void toggleSubItem(task, subItem)
                                    }
                                    className={cn(
                                      "flex h-4 w-4 items-center justify-center rounded border",
                                      subItem.completed
                                        ? "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-slate-300 bg-white",
                                      !access.canWork && "cursor-not-allowed opacity-50",
                                    )}
                                  >
                                    {subItem.completed && (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </button>
                                  <span
                                    className={cn(
                                      "flex-1 text-[12px] text-slate-700 dark:text-white/75",
                                      subItem.completed &&
                                        "text-slate-400 line-through",
                                    )}
                                  >
                                    {subItem.label}
                                  </span>
                                  {subItem.completed_at && (
                                    <span className="text-[10px] text-slate-400">
                                      {member?.name ?? "Time"} -{" "}
                                      {new Date(
                                        subItem.completed_at,
                                      ).toLocaleString("pt-BR", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </section>
            )
          })
        )}
      </main>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          canWork={selectedAccess.canWork}
          canAdmin={canAdmin}
          onClose={() => selectTask(null)}
        />
      )}
    </div>
  )
}
