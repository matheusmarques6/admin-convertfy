"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { TASK_STATUSES } from "@/types/productivity"
import type { ProductivityTask, TaskGroup } from "@/types/productivity"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  PriorityDot, StatusDot, Avatar, Checkbox,
  IconPlus, IconClose, IconChevronRight,
} from "./ds-atoms"
import { TaskDetailDrawer } from "./task-detail-drawer"

// ============================================================================
// Board Page — Table + Kanban + Task Detail Panel
// ============================================================================

export function ProductivityBoard() {
  const {
    groups, boardView, setBoardView, selectedTaskId, selectTask,
    expandedTasks, toggleTaskExpand, collapsedGroups, toggleGroupCollapse,
    hoveredTaskId, setHoveredTask, toggleSubtask,
    isLoaded, fetchData, apiAction,
  } = useProductivityStore()
  const searchParams = useSearchParams()
  const viewMode = searchParams.get("view") === "mine" ? "mine" : "all"

  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskPriority, setNewTaskPriority] = useState(3)
  const [newTaskProject, setNewTaskProject] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Filtros e bulk selection (lifted state)
  const [priorityFilter, setPriorityFilter] = useState<Set<number>>(new Set())
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  // Load data on mount
  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  const allTasks = groups.flatMap((g) => g.items)
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId) || null

  // Aplicar filtros
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((t) => {
        if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false
        if (statusFilter.size > 0 && !statusFilter.has(t.status)) return false
        if (assigneeFilter.size > 0) {
          const taskPeople = (t.people ?? []) as string[]
          if (!taskPeople.some((p) => assigneeFilter.has(p))) return false
        }
        return true
      }),
    }))
    // Remove grupos vazios apos filtro (so se algum filtro ativo)
    .filter((g) =>
      priorityFilter.size === 0 && assigneeFilter.size === 0 && statusFilter.size === 0
        ? true
        : g.items.length > 0,
    )

  const hasFilters =
    priorityFilter.size > 0 || assigneeFilter.size > 0 || statusFilter.size > 0
  const filteredTaskIds = new Set(
    filteredGroups.flatMap((g) => g.items.map((t) => t.id)),
  )
  // Lista unica de responsaveis vistos no board
  const availableAssignees = Array.from(
    new Set(allTasks.flatMap((t) => (t.people ?? []) as string[])),
  ).filter(Boolean)

  const handleCreateTask = useCallback(async () => {
    if (!newTaskName.trim()) return
    setIsCreating(true)
    const success = await apiAction("create_task", {
      name: newTaskName.trim(),
      priority: newTaskPriority,
      project: newTaskProject || undefined,
      status: "pending",
      group_id: groups[0]?.id || "default",
      group_name: groups[0]?.name || "Backlog",
      group_color: groups[0]?.color || "#9CA3AF",
    })
    if (success) {
      setNewTaskName("")
      setNewTaskProject("")
      setNewTaskPriority(3)
      setShowNewTask(false)
    }
    setIsCreating(false)
  }, [newTaskName, newTaskPriority, newTaskProject, apiAction, groups])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-gray-900 dark:text-white m-0">
              {viewMode === "mine" ? "Minhas tarefas" : "Projetos"}
            </h1>
            <span className="bg-gray-100 dark:bg-[#242836] text-gray-600 dark:text-white/70 text-[11px] font-semibold px-[7px] py-[1px] rounded-full font-mono">
              {allTasks.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NewGroupButton />
            <button
              onClick={() => setShowNewTask(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border-none cursor-pointer text-[13px] font-medium bg-brand-400 text-white hover:bg-brand transition-colors duration-fast ease-out-expo"
            >
              <IconPlus size={14} /> Nova tarefa
            </button>
          </div>
        </div>

        {/* New task inline form */}
        {showNewTask && (
          <div className="mx-6 mb-2 p-4 bg-gray-50 dark:bg-[#242836] rounded-md border border-[rgba(0,0,0,0.08)]">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase block mb-1">Nome da tarefa</label>
                <input
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
                  placeholder="Ex: Criar wireframe da pagina de precos"
                  className="w-full h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400 bg-white dark:bg-[#1A1D27]"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <label className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase block mb-1">Projeto</label>
                <input
                  value={newTaskProject}
                  onChange={(e) => setNewTaskProject(e.target.value)}
                  placeholder="Projeto"
                  className="w-full h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400 bg-white dark:bg-[#1A1D27]"
                />
              </div>
              <div className="w-20">
                <label className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase block mb-1">Prioridade</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400 bg-white dark:bg-[#1A1D27]"
                >
                  <option value={1}>P1</option>
                  <option value={2}>P2</option>
                  <option value={3}>P3</option>
                  <option value={4}>P4</option>
                </select>
              </div>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskName.trim() || isCreating}
                className="h-9 px-4 rounded-sm border-none cursor-pointer text-[12px] font-semibold bg-brand-400 text-white hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-fast ease-out-expo"
              >
                {isCreating ? "Criando..." : "Criar"}
              </button>
              <button
                onClick={() => setShowNewTask(false)}
                className="h-9 w-9 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] flex items-center justify-center cursor-pointer text-gray-400 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors duration-fast ease-out-expo"
              >
                <IconClose size={14} />
              </button>
            </div>
          </div>
        )}

        {/* View tabs — underline style */}
        <div className="flex gap-6 px-6">
          {(["table", "kanban"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setBoardView(v)}
              className={cn(
                "pb-2 text-[13px] font-medium border-none bg-transparent cursor-pointer -mb-px transition-colors duration-fast ease-out-expo",
                boardView === v
                  ? "text-gray-900 dark:text-white border-b-2 border-brand-400"
                  : "text-gray-400 dark:text-white/50 border-b-2 border-transparent hover:text-gray-600 dark:text-white/70"
              )}
            >
              {v === "table" ? "Tabela" : "Kanban"}
            </button>
          ))}
        </div>
      </header>

      {/* Filter bar - so em modo "todos os projetos" */}
      {viewMode !== "mine" && (
        <FilterBar
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          availableAssignees={availableAssignees}
          hasFilters={hasFilters}
        />
      )}

      {/* Bulk actions bar */}
      {selectedTaskIds.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(selectedTaskIds)}
          allGroups={groups}
          onClear={() => setSelectedTaskIds(new Set())}
          apiAction={apiAction}
        />
      )}

      {/* Content - kanban so em modo "todos os projetos" */}
      {viewMode !== "mine" && (
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {boardView === "table" && (
            <TableView
              groups={filteredGroups}
              collapsedGroups={collapsedGroups}
              toggleGroupCollapse={toggleGroupCollapse}
              expandedTasks={expandedTasks}
              toggleTaskExpand={toggleTaskExpand}
              selectedTaskId={selectedTaskId}
              selectTask={selectTask}
              hoveredTaskId={hoveredTaskId}
              setHoveredTask={setHoveredTask}
              toggleSubtask={toggleSubtask}
              selectedTaskIds={selectedTaskIds}
              setSelectedTaskIds={setSelectedTaskIds}
              filteredTaskIds={filteredTaskIds}
            />
          )}
          {boardView === "kanban" && (
            <KanbanView
              tasks={allTasks}
              selectedTaskId={selectedTaskId}
              selectTask={selectTask}
            />
          )}
        </div>

      </div>
      )}

      {/* Task Detail Drawer (overlay fixed fullscreen) */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          onClose={() => selectTask(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// FilterBar (prioridade, status, responsavel)
// ============================================================================

const PRIORITY_OPTS: Array<{ value: number; label: string; color: string }> = [
  { value: 1, label: "P1", color: "#EF4444" },
  { value: 2, label: "P2", color: "#F59E0B" },
  { value: 3, label: "P3", color: "#3B82F6" },
  { value: 4, label: "P4", color: "#94A3B8" },
]

const STATUS_OPTS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pendentes" },
  { value: "in_progress", label: "Em andamento" },
  { value: "review", label: "Em revisão" },
  { value: "done", label: "Concluídas" },
]

function FilterBar({
  priorityFilter,
  setPriorityFilter,
  statusFilter,
  setStatusFilter,
  assigneeFilter,
  setAssigneeFilter,
  availableAssignees,
  hasFilters,
}: {
  priorityFilter: Set<number>
  setPriorityFilter: (s: Set<number>) => void
  statusFilter: Set<string>
  setStatusFilter: (s: Set<string>) => void
  assigneeFilter: Set<string>
  setAssigneeFilter: (s: Set<string>) => void
  availableAssignees: string[]
  hasFilters: boolean
}) {
  function togglePriority(p: number) {
    const next = new Set(priorityFilter)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setPriorityFilter(next)
  }
  function toggleStatus(s: string) {
    const next = new Set(statusFilter)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    setStatusFilter(next)
  }
  function toggleAssignee(a: string) {
    const next = new Set(assigneeFilter)
    if (next.has(a)) next.delete(a)
    else next.add(a)
    setAssigneeFilter(next)
  }
  function clearAll() {
    setPriorityFilter(new Set())
    setStatusFilter(new Set())
    setAssigneeFilter(new Set())
  }

  return (
    <div className="px-6 py-2 bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)] flex items-center gap-3 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
        Filtros
      </span>

      {/* Prioridade */}
      <div className="flex items-center gap-1">
        {PRIORITY_OPTS.map((p) => {
          const active = priorityFilter.has(p.value)
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePriority(p.value)}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[11.5px] font-medium border transition-colors",
                active
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                  : "bg-white dark:bg-white/[0.04] text-gray-700 dark:text-white/70 border-gray-200 dark:border-white/[0.10] hover:border-gray-300",
              )}
              title={`Prioridade ${p.label}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1">
        {STATUS_OPTS.map((s) => {
          const active = statusFilter.has(s.value)
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggleStatus(s.value)}
              className={cn(
                "h-7 px-2 rounded-sm text-[11.5px] font-medium border transition-colors",
                active
                  ? "bg-brand-400 text-white border-brand-400"
                  : "bg-white dark:bg-white/[0.04] text-gray-700 dark:text-white/70 border-gray-200 dark:border-white/[0.10] hover:border-gray-300",
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Responsaveis */}
      {availableAssignees.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 mr-1">
            Resp.
          </span>
          {availableAssignees.slice(0, 6).map((a) => {
            const active = assigneeFilter.has(a)
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAssignee(a)}
                className={cn(
                  "h-7 w-7 inline-flex items-center justify-center rounded-full text-[10px] font-bold border transition-all",
                  active
                    ? "ring-2 ring-brand-500 ring-offset-1 border-transparent"
                    : "border-gray-200 dark:border-white/[0.10] hover:scale-110",
                )}
                title={`Filtrar por ${a}`}
              >
                <Avatar initials={a} size={20} />
              </button>
            )
          })}
        </div>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto h-7 px-2 text-[11.5px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-sm"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}

// ============================================================================
// BulkActionsBar (selecao multipla)
// ============================================================================

function BulkActionsBar({
  selectedIds,
  allGroups,
  onClear,
  apiAction,
}: {
  selectedIds: string[]
  allGroups: TaskGroup[]
  onClear: () => void
  apiAction: (action: string, data?: Record<string, unknown>) => Promise<boolean>
}) {
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [prioMenuOpen, setPrioMenuOpen] = useState(false)

  async function bulkComplete() {
    await apiAction("bulk_update_tasks", {
      ids: selectedIds,
      updates: { status: "done" },
    })
    onClear()
  }

  async function bulkDelete() {
    if (
      !window.confirm(
        `Excluir ${selectedIds.length} tarefa(s)?\n\nEssa acao nao pode ser desfeita.`,
      )
    )
      return
    await apiAction("bulk_delete_tasks", { ids: selectedIds })
    onClear()
  }

  async function bulkMoveTo(g: TaskGroup) {
    await apiAction("bulk_update_tasks", {
      ids: selectedIds,
      updates: {
        group_id: g.id,
        group_name: g.name,
        group_color: g.color,
      },
    })
    setMoveMenuOpen(false)
    onClear()
  }

  async function bulkPriority(p: number) {
    await apiAction("bulk_update_tasks", {
      ids: selectedIds,
      updates: { priority: p },
    })
    setPrioMenuOpen(false)
    onClear()
  }

  return (
    <div className="px-6 py-2 bg-brand-50 dark:bg-brand-500/10 border-b border-brand-200 dark:border-brand-500/20 flex items-center gap-2 flex-wrap">
      <span className="text-[12px] font-semibold text-brand-500 dark:text-brand-300">
        {selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"}
      </span>
      <div className="h-4 w-px bg-brand-300 dark:bg-brand-500/30 mx-1" />
      <button
        type="button"
        onClick={bulkComplete}
        className="inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10 rounded-sm"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Marcar concluídas
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setPrioMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium text-gray-700 dark:text-white/80 hover:bg-white dark:hover:bg-white/[0.06] rounded-sm"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Prioridade
        </button>
        {prioMenuOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.10] rounded-md shadow-lg py-1 min-w-[120px]"
            onMouseLeave={() => setPrioMenuOpen(false)}
          >
            {PRIORITY_OPTS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => bulkPriority(p.value)}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 dark:hover:bg-white/[0.04] flex items-center gap-2"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMoveMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium text-gray-700 dark:text-white/80 hover:bg-white dark:hover:bg-white/[0.06] rounded-sm"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          Mover para
        </button>
        {moveMenuOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#1A1D27] border border-black/[0.08] dark:border-white/[0.10] rounded-md shadow-lg py-1 min-w-[200px] max-h-[280px] overflow-y-auto"
            onMouseLeave={() => setMoveMenuOpen(false)}
          >
            {allGroups.length === 0 && (
              <p className="px-3 py-2 text-[11.5px] text-gray-400">Sem projetos</p>
            )}
            {allGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => bulkMoveTo(g)}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 dark:hover:bg-white/[0.04] flex items-center gap-2"
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: g.color }}
                />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={bulkDelete}
        className="inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-sm"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/></svg>
        Excluir
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-7 w-7 inline-flex items-center justify-center text-gray-500 hover:bg-white dark:hover:bg-white/[0.06] rounded-sm"
        aria-label="Cancelar selecao"
        title="Cancelar selecao (Esc)"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}

// ============================================================================
// Group Actions Menu (cor, excluir)
// ============================================================================

const GROUP_COLORS = [
  { id: "#94A3B8", label: "Cinza" },
  { id: "#3B82F6", label: "Azul" },
  { id: "#8B5CF6", label: "Roxo" },
  { id: "#EC4899", label: "Rosa" },
  { id: "#EF4444", label: "Vermelho" },
  { id: "#F59E0B", label: "Amarelo" },
  { id: "#10B981", label: "Verde" },
  { id: "#06B6D4", label: "Ciano" },
] as const

function GroupActionsMenu({
  groupId,
  groupName,
  itemsCount,
}: {
  groupId: string
  groupName: string
  itemsCount: number
}) {
  const { apiAction } = useProductivityStore()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  function setColor(color: string) {
    apiAction("update_group", { group_id: groupId, group_color: color })
    setOpen(false)
  }

  function deleteGroup() {
    const confirmText =
      itemsCount > 0
        ? `Excluir o projeto "${groupName}"?\n\nIsso vai REMOVER as ${itemsCount} tarefa(s) deste grupo definitivamente.`
        : `Excluir o projeto "${groupName}"?`
    if (window.confirm(confirmText)) {
      apiAction("delete_group", { group_id: groupId })
    }
    setOpen(false)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-white/80 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
        aria-label="Ações do projeto"
        title="Ações do projeto"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] shadow-lg py-2"
        >
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Cor do projeto
          </p>
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {GROUP_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className="h-5 w-5 rounded-full border border-black/[0.1] hover:scale-110 transition-transform"
                style={{ background: c.id }}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-white/[0.06] mt-1 pt-1">
            <button
              type="button"
              onClick={deleteGroup}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Excluir projeto
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// New Group Dialog
// ============================================================================

function NewGroupButton() {
  const { apiAction } = useProductivityStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(GROUP_COLORS[1].id)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await apiAction("create_group", {
        group_id: groupId,
        group_name: name.trim(),
        group_color: color,
      })
      setName("")
      setColor(GROUP_COLORS[1].id)
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-sm text-[12px] font-medium text-gray-700 dark:text-white/80 bg-white dark:bg-[#242836] border border-[rgba(0,0,0,0.08)] hover:border-gray-300 dark:hover:border-white/[0.14]"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo projeto
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md bg-white dark:bg-[#1A1D27] rounded-lg shadow-xl border border-black/[0.08] overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.06]">
              <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                Novo projeto
              </h3>
              <p className="mt-0.5 text-[12px] text-gray-500 dark:text-white/55">
                Agrupe tarefas relacionadas. Você pode mudar nome e cor depois.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-white/80 uppercase tracking-wide mb-1">
                  Nome do projeto
                </label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit()
                    if (e.key === "Escape") setOpen(false)
                  }}
                  placeholder="Ex: Lancamento Black Friday 2026"
                  className="w-full h-10 px-3 text-[13px] rounded-sm border border-[rgba(0,0,0,0.10)] bg-white dark:bg-[#242836] focus:outline-none focus:border-brand-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-white/80 uppercase tracking-wide mb-2">
                  Cor
                </label>
                <div className="flex flex-wrap gap-2">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 transition-transform",
                        color === c.id
                          ? "border-gray-900 dark:border-white scale-110"
                          : "border-transparent hover:scale-105",
                      )}
                      style={{ background: c.id }}
                      title={c.label}
                      aria-label={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] bg-gray-50/60 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 px-3 text-[12px] font-medium text-gray-700 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !name.trim()}
                className="h-9 px-4 text-[12px] font-semibold bg-brand-400 hover:bg-brand text-white rounded-sm disabled:opacity-50"
              >
                {submitting ? "Criando..." : "Criar projeto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// Subtask Row (editavel + deletavel inline)
// ============================================================================

// ============================================================================
// CommentItem (edit + delete inline)
// ============================================================================

function EditableTaskName({
  taskId,
  name,
  isDone,
  apiAction,
}: {
  taskId: string
  name: string
  isDone: boolean
  apiAction: (action: string, data?: Record<string, unknown>) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  function save() {
    const next = value.trim()
    if (next && next !== name) {
      apiAction("update_task", { id: taskId, name: next })
    } else {
      setValue(name)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") save()
          if (e.key === "Escape") {
            setValue(name)
            setEditing(false)
          }
        }}
        className="flex-1 text-[13px] font-medium border border-brand-400 outline-none bg-white dark:bg-[#242836] px-1.5 py-0.5 rounded-sm text-gray-800 dark:text-white"
      />
    )
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className={cn(
        "text-[13px] font-medium truncate cursor-text hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded-sm -mx-1 px-1",
        isDone
          ? "text-gray-400 dark:text-white/50 line-through"
          : "text-gray-800 dark:text-white",
      )}
      title="Duplo clique para editar"
    >
      {name}
    </span>
  )
}

function EditableGroupName({ groupId, name }: { groupId: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const { apiAction } = useProductivityStore()

  if (editing) {
    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim() && value !== name) {
            apiAction("update_group", { group_id: groupId, group_name: value.trim() })
          }
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (value.trim() && value !== name) {
              apiAction("update_group", { group_id: groupId, group_name: value.trim() })
            }
            setEditing(false)
          }
          if (e.key === "Escape") { setValue(name); setEditing(false) }
        }}
        onClick={(e) => e.stopPropagation()}
        className="text-sm font-semibold text-gray-800 dark:text-white border-none outline-none bg-transparent p-0"
        autoFocus
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 group/groupname">
      <span
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="text-sm font-semibold text-gray-800 dark:text-white cursor-text hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 -mx-1 transition-colors"
        title="Duplo clique para editar"
      >
        {name}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/[0.06] opacity-50 hover:opacity-100"
        aria-label="Renomear projeto"
        title="Renomear projeto"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </span>
  )
}

// ============================================================================
// Inline New Task — add task within a group
// ============================================================================

function InlineNewTask({ groupId, groupName, groupColor, onboardingId, operationalColumnId }: {
  groupId: string
  groupName: string
  groupColor: string
  /** Quando presente, cria task em `tasks` table com features completas
   *  (checklist, deliverables, anexos, comentarios). */
  onboardingId?: string
  operationalColumnId?: string
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const { apiAction, fetchData } = useProductivityStore()

  const handleAdd = async () => {
    if (!name.trim()) return
    if (onboardingId) {
      // Task de projeto/onboarding: cria em `tasks` table pra ganhar
      // checklist, deliverables, attachments, comments automaticamente
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: name.trim(),
            type: "onboarding",
            status: "pending",
            priority: "medium",
            onboarding_id: onboardingId,
            operational_column_id: operationalColumnId,
            source_type: "manual",
          }),
        })
        if (res.ok) fetchData()
      } catch (e) {
        console.error("[InlineNewTask] create failed", e)
      }
    } else {
      // Task legacy/livre: vai pra productivity_tasks
      await apiAction("create_task", {
        name: name.trim(),
        status: "pending",
        priority: 3,
        group_id: groupId,
        group_name: groupName,
        group_color: groupColor,
      })
    }
    setName("")
    setIsAdding(false)
  }

  if (!isAdding) {
    return (
      <div className="h-9 pl-[72px] flex items-center border-b border-gray-100 dark:border-white/10">
        <button
          onClick={() => setIsAdding(true)}
          className="border-none bg-transparent cursor-pointer text-[13px] text-gray-400 dark:text-white/50 p-0 flex items-center gap-1 hover:text-gray-600 dark:text-white/70 transition-colors duration-fast ease-out-expo"
        >
          <IconPlus size={14} /> Nova tarefa
        </button>
      </div>
    )
  }

  return (
    <div className="h-10 pl-[72px] pr-6 flex items-center border-b border-gray-100 dark:border-white/10 gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setIsAdding(false) }}
        placeholder="Nome da tarefa..."
        className="flex-1 text-[13px] text-gray-700 dark:text-white/90 border-none outline-none bg-transparent placeholder:text-gray-300"
        autoFocus
      />
      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className="text-[11px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer disabled:opacity-40"
      >
        Criar
      </button>
      <button onClick={() => setIsAdding(false)} className="text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer text-[11px]">Cancelar</button>
    </div>
  )
}

// ============================================================================
// Table View
// ============================================================================

function TableView({
  groups, collapsedGroups, toggleGroupCollapse,
  expandedTasks, toggleTaskExpand,
  selectedTaskId, selectTask,
  hoveredTaskId, setHoveredTask, toggleSubtask,
  selectedTaskIds, setSelectedTaskIds, filteredTaskIds,
}: {
  groups: TaskGroup[]
  collapsedGroups: Set<string>
  toggleGroupCollapse: (id: string) => void
  expandedTasks: Set<string>
  toggleTaskExpand: (id: string) => void
  selectedTaskId: string | null
  selectTask: (id: string | null) => void
  hoveredTaskId: string | null
  setHoveredTask: (id: string | null) => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
  selectedTaskIds: Set<string>
  setSelectedTaskIds: (s: Set<string>) => void
  filteredTaskIds: Set<string>
}) {
  const { apiAction } = useProductivityStore()

  function toggleSelectAllVisible() {
    if (selectedTaskIds.size === filteredTaskIds.size && filteredTaskIds.size > 0) {
      setSelectedTaskIds(new Set())
    } else {
      setSelectedTaskIds(new Set(filteredTaskIds))
    }
  }

  function toggleSelectTaskId(id: string) {
    const next = new Set(selectedTaskIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedTaskIds(next)
  }
  const allVisibleSelected =
    filteredTaskIds.size > 0 && selectedTaskIds.size === filteredTaskIds.size

  function handleGroupReorder(result: DropResult) {
    if (!result.destination) return
    if (result.source.index === result.destination.index) return
    const reordered = [...groups]
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    const positions = reordered.map((g, idx) => ({ group_id: g.id, position: idx }))
    apiAction("reorder_groups", { positions })
  }

  return (
    <div>
      {/* Table header */}
      <div className="flex items-center h-8 px-6 bg-gray-50 dark:bg-[#242836] border-b border-gray-200 dark:border-white/10 sticky top-0 z-[5]">
        <div className="w-7 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            className="h-3.5 w-3.5 rounded border-slate-300 cursor-pointer"
            title={allVisibleSelected ? "Desmarcar todas" : "Selecionar todas visiveis"}
          />
        </div>
        <div className="w-5" />
        <div className="flex-1 text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Tarefa</div>
        <div className="w-[120px] text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Status</div>
        <div className="w-[50px] text-center text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Resp.</div>
        <div className="w-[60px] text-right text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Data</div>
        <div className="w-[40px] text-right text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Est.</div>
      </div>

      {/* Groups (com drag-and-drop pra reordenar) */}
      <DragDropContext onDragEnd={handleGroupReorder}>
        <Droppable droppableId="groups-list" type="GROUP">
          {(prov) => (
            <div ref={prov.innerRef} {...prov.droppableProps}>
      {groups.map((g, gIdx) => {
        const isCollapsed = collapsedGroups.has(g.id)
        const doneCount = g.items.filter((i) => i.status === "done").length
        // Detecta grupos de onboarding (source_type adicionado no GET).
        const gAny = g as unknown as {
          source_type?: string
          stage_name?: string
          stage_color?: string
          stage_role?: string
          plan?: string
          mrr_value?: number | string | null
          client_name?: string
        }
        const isOnboardingGroup = gAny.source_type === "onboarding"
        const plan = gAny.plan
        const mrr = gAny.mrr_value
        const mrrLabel =
          mrr && Number(mrr) > 0
            ? `R$ ${(Number(mrr) / 1000).toFixed(1).replace(".", ",")}k/mês`
            : null

        return (
          <Draggable key={g.id} draggableId={g.id} index={gIdx}>
            {(dp, ds) => (
              <div
                ref={dp.innerRef}
                {...dp.draggableProps}
                className={ds.isDragging ? "shadow-xl bg-white dark:bg-[#1A1D27]" : ""}
              >
            {/* Group header — projeto (onboarding) ou grupo legado */}
            {isOnboardingGroup ? (
              <>
                {/* Nivel 1: Projeto */}
                <div
                  onClick={() => toggleGroupCollapse(g.id)}
                  className="flex items-center gap-2.5 h-11 px-6 bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)] cursor-pointer hover:bg-gray-25 transition-colors"
                >
                  <span
                    {...dp.dragHandleProps}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/70 -ml-2"
                    aria-label="Arrastar"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                  </span>
                  <svg
                    width="10" height="10" viewBox="0 0 10 10"
                    className={cn("transition-transform shrink-0", !isCollapsed && "rotate-90")}
                  >
                    <path d="M3 1l4 4-4 4" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-[13.5px] font-semibold text-gray-900 dark:text-white truncate">
                    {g.name}
                  </span>
                  {/* Chip da stage */}
                  {gAny.stage_name && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-semibold"
                      style={{
                        background: `${gAny.stage_color}1a`,
                        color: gAny.stage_color,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: gAny.stage_color }}
                      />
                      {gAny.stage_name}
                    </span>
                  )}
                  {/* Progress bar + count */}
                  <div className="w-16 h-[3px] bg-gray-200 dark:bg-white/[0.08] rounded-[2px] overflow-hidden">
                    <div
                      className="h-full rounded-[2px] transition-all"
                      style={{
                        width: `${g.items.length > 0 ? (doneCount / g.items.length) * 100 : 0}%`,
                        background: doneCount === g.items.length && g.items.length > 0 ? "#10B981" : "#4E62D8",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-gray-500 dark:text-white/55">
                    {doneCount}/{g.items.length}
                  </span>
                  {/* Meta: plano + MRR */}
                  <div className="ml-auto flex items-center gap-3">
                    {plan && (
                      <span className="text-[11.5px] text-gray-400 dark:text-white/45">
                        {plan}
                      </span>
                    )}
                    {mrrLabel && (
                      <span className="text-[11.5px] font-mono tabular-nums text-gray-400 dark:text-white/45">
                        {mrrLabel}
                      </span>
                    )}
                    <GroupActionsMenu
                      groupId={g.id}
                      groupName={g.name}
                      itemsCount={g.items.length}
                    />
                  </div>
                </div>

                {/* Nivel 2: Stage sub-header (so renderiza quando expandido) */}
                {!isCollapsed && gAny.stage_name && (
                  <div
                    className="flex items-center gap-2 h-9 pl-12 pr-6 border-b border-[rgba(0,0,0,0.05)]"
                    style={{ background: `${gAny.stage_color}08` }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: gAny.stage_color }}
                    />
                    <span className="text-[12.5px] font-medium text-gray-700 dark:text-white/80">
                      {gAny.stage_name}
                    </span>
                    <span className="text-[10.5px] font-mono tabular-nums text-gray-500 dark:text-white/55">
                      {doneCount}/{g.items.length}
                    </span>
                    {gAny.stage_role && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/40 ml-1">
                        {gAny.stage_role}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div
                onClick={() => toggleGroupCollapse(g.id)}
                className="flex items-center gap-2 h-10 px-6 bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)] cursor-pointer hover:bg-gray-25 transition-colors duration-fast ease-out-expo"
              >
                <span
                  {...dp.dragHandleProps}
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/70 -ml-2"
                  title="Arrastar para reordenar"
                  aria-label="Arrastar para reordenar"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                </span>
                <div className="w-[3px] h-[18px] rounded-[2px]" style={{ background: g.color }} />
                <svg
                  width="10" height="10" viewBox="0 0 10 10"
                  className={cn("transition-transform duration-fast ease-out-expo", !isCollapsed && "rotate-90")}
                >
                  <path d="M3 1l4 4-4 4" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <EditableGroupName groupId={g.id} name={g.name} />
                <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 font-mono">{g.items.length}</span>
                {doneCount > 0 && (
                  <>
                    <div className="w-9 h-[3px] bg-gray-200 rounded-[2px] overflow-hidden">
                      <div
                        className="h-full bg-positive-text rounded-[2px]"
                        style={{ width: `${(doneCount / g.items.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-positive-text font-mono">{doneCount}/{g.items.length}</span>
                  </>
                )}
                <div className="ml-auto">
                  <GroupActionsMenu
                    groupId={g.id}
                    groupName={g.name}
                    itemsCount={g.items.length}
                  />
                </div>
              </div>
            )}

            {/* Task rows */}
            {!isCollapsed && g.items.map((t) => {
              const isDone = t.status === "done"
              const hasSubs = t.subtasks.length > 0
              const isExpanded = expandedTasks.has(t.id)
              const subDone = t.subtasks.filter((s) => s.done).length
              const isSelected = selectedTaskId === t.id
              const isHovered = hoveredTaskId === t.id
              const statusConfig = TASK_STATUSES.find((x) => x.id === t.status)

              return (
                <div key={t.id}>
                  <div
                    onClick={() => selectTask(t.id)}
                    onMouseEnter={() => setHoveredTask(t.id)}
                    onMouseLeave={() => setHoveredTask(null)}
                    className={cn(
                      "flex items-center h-10 px-6 border-b border-gray-100 dark:border-white/10 cursor-pointer transition-colors duration-fast ease-out-expo",
                      isSelected ? "bg-brand-50" : isHovered ? "bg-[rgba(0,0,0,0.015)]" : "bg-transparent"
                    )}
                  >
                    <div className="w-7 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(t.id)}
                        onChange={() => toggleSelectTaskId(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded border-slate-300 cursor-pointer"
                        aria-label="Selecionar tarefa"
                      />
                    </div>
                    <div className="w-5 flex justify-center">
                      <PriorityDot priority={t.priority} />
                    </div>
                    <div className="w-5 flex justify-center">
                      {hasSubs && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskExpand(t.id) }}
                          className={cn(
                            "w-4 h-4 border-none bg-transparent cursor-pointer text-gray-400 dark:text-white/50 p-0 transition-transform duration-fast ease-out-expo",
                            isExpanded && "rotate-90"
                          )}
                        >
                          <IconChevronRight size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <EditableTaskName
                        taskId={t.id}
                        name={t.name}
                        isDone={isDone}
                        apiAction={apiAction}
                      />
                      {hasSubs && (
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-white/50 font-mono bg-gray-100 dark:bg-[#242836] px-[5px] py-[1px] rounded-sm">
                          {subDone}/{t.subtasks.length}
                        </span>
                      )}
                    </div>
                    <div className="w-[120px] flex items-center gap-[6px]">
                      <StatusDot color={statusConfig?.color || "#9CA3AF"} />
                      <span className="text-[13px] text-gray-600 dark:text-white/70">{statusConfig?.label}</span>
                    </div>
                    <div className="w-[50px] flex justify-center">
                      <Avatar initials={t.people[0]} size={24} />
                    </div>
                    <div className="w-[60px] text-right text-[12px] text-gray-500 dark:text-white/60 font-mono">
                      {t.date}
                    </div>
                    <div className="w-[40px] text-right text-[11px] text-gray-400 dark:text-white/50 font-mono">
                      {t.estimatedTime || "—"}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`Excluir a tarefa "${t.name}"?\n\nEssa acao nao pode ser desfeita.`)) {
                          apiAction("delete_task", { id: t.id })
                        }
                      }}
                      className="ml-2 h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 opacity-50 hover:opacity-100"
                      aria-label="Excluir tarefa"
                      title="Excluir tarefa"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>

                  {/* Subtask rows */}
                  {hasSubs && isExpanded && t.subtasks.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center h-8 pl-[72px] border-b border-gray-50 bg-gray-25"
                    >
                      <div className="mr-3">
                        <Checkbox
                          checked={sub.done}
                          onChange={() => toggleSubtask(t.id, sub.id)}
                        />
                      </div>
                      <span className={cn(
                        "text-[12px]",
                        sub.done ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-600 dark:text-white/70"
                      )}>
                        {sub.name}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Add task inline */}
            {!isCollapsed && (
              <InlineNewTask
                groupId={g.id}
                groupName={g.name}
                groupColor={g.color}
                onboardingId={(g as unknown as { onboarding_id?: string }).onboarding_id}
                operationalColumnId={(g as unknown as { stage_id?: string }).stage_id}
              />
            )}
              </div>
            )}
          </Draggable>
        )
      })}
              {prov.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new group */}
      <NewGroupInline />
    </div>
  )
}

function NewGroupInline() {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const { apiAction } = useProductivityStore()

  if (!isAdding) {
    return (
      <div className="h-10 px-6 flex items-center">
        <button
          onClick={() => setIsAdding(true)}
          className="border-none bg-transparent cursor-pointer text-[13px] text-gray-400 dark:text-white/50 p-0 flex items-center gap-1 hover:text-gray-600 dark:text-white/70 transition-colors"
        >
          <IconPlus size={14} /> Novo grupo
        </button>
      </div>
    )
  }

  return (
    <div className="h-12 px-6 flex items-center gap-2 border-b border-gray-100 dark:border-white/10">
      <div className="w-[3px] h-[18px] rounded-[2px] bg-brand-400" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && name.trim()) {
            // Create a task with the new group to establish the group
            await apiAction("create_task", {
              name: "Nova tarefa",
              status: "pending",
              priority: 4,
              group_id: name.trim().toLowerCase().replace(/\s+/g, "-"),
              group_name: name.trim(),
              group_color: "#4E62D8",
            })
            setName("")
            setIsAdding(false)
          }
          if (e.key === "Escape") setIsAdding(false)
        }}
        placeholder="Nome do grupo..."
        className="text-sm font-semibold text-gray-800 dark:text-white border-none outline-none bg-transparent flex-1"
        autoFocus
      />
      <button onClick={() => setIsAdding(false)} className="text-[10px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer">Cancelar</button>
    </div>
  )
}

// ============================================================================
// Kanban View
// ============================================================================

function KanbanView({
  tasks, selectedTaskId, selectTask,
}: {
  tasks: ProductivityTask[]
  selectedTaskId: string | null
  selectTask: (id: string | null) => void
}) {
  // Kanban has 5 columns: pending, progress, review, blocked, done
  const KANBAN_STATUSES = [
    { id: "pending" as const, label: "Pendente", color: "#9CA3AF" },
    { id: "progress" as const, label: "Em progresso", color: "#4E62D8" },
    { id: "review" as const, label: "Em revisao", color: "#92400E" },
    { id: "done" as const, label: "Concluido", color: "#065F46" },
  ]

  return (
    <div className="flex gap-4 p-6 overflow-auto items-start">
      {KANBAN_STATUSES.map((st) => {
        const items = tasks.filter((t) => t.status === st.id)
        return (
          <div key={st.id} className="min-w-[220px] flex-1 max-w-[280px]">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <StatusDot color={st.color} />
              <span className="text-[13px] font-semibold text-gray-700 dark:text-white/90">{st.label}</span>
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 font-mono">{items.length}</span>
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[60px]">
              {items.length === 0 && (
                <div className="p-6 text-center text-[12px] text-gray-300 bg-gray-50 dark:bg-[#242836] rounded-md border border-dashed border-gray-200 dark:border-white/10">Vazio</div>
              )}
              {items.map((t) => {
                const hasSubs = t.subtasks.length > 0
                const subDone = t.subtasks.filter((s) => s.done).length
                const subPct = hasSubs ? Math.round((subDone / t.subtasks.length) * 100) : 0

                return (
                  <div
                    key={t.id}
                    onClick={() => selectTask(t.id)}
                    className={cn(
                      "bg-white dark:bg-[#1A1D27] border rounded-md p-3 cursor-pointer transition-all hover:shadow-sm",
                      selectedTaskId === t.id ? "border-brand-400 shadow-sm" : "border-[rgba(0,0,0,0.08)]"
                    )}
                  >
                    <div className="text-[13px] font-medium text-gray-800 dark:text-white mb-2">{t.name}</div>

                    {/* Subtask progress bar */}
                    {hasSubs && (
                      <div className="mb-2">
                        <div className="text-[9px] text-gray-400 dark:text-white/50 font-mono mb-0.5">{subDone}/{t.subtasks.length}</div>
                        <div className="h-[3px] bg-gray-100 dark:bg-[#242836] rounded-full overflow-hidden">
                          <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${subPct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Bottom row: priority, date, comments, avatar */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PriorityDot priority={t.priority} />
                        <span className="text-[11px] text-gray-400 dark:text-white/50 font-mono">{t.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.subtasks.length > 0 && (
                          <span className="text-[10px] text-gray-400 dark:text-white/50 flex items-center gap-0.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                            {t.subtasks.length}
                          </span>
                        )}
                        {t.people.length > 0 && (
                          <div className="flex -space-x-1">
                            {t.people.slice(0, 2).map((p, i) => (
                              <Avatar key={i} initials={p} size={20} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* + Adicionar */}
              <KanbanAddTask status={st.id} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanAddTask({ status }: { status: string }) {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const { apiAction } = useProductivityStore()

  const handleAdd = async () => {
    if (!name.trim()) return
    await apiAction("create_task", { name: name.trim(), status, priority: 3 })
    setName("")
    setIsAdding(false)
  }

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="w-full text-left px-3 py-2 text-[12px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer hover:text-gray-600 dark:text-white/70 transition-colors flex items-center gap-1"
      >
        <IconPlus size={12} /> Adicionar
      </button>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setIsAdding(false) }}
        placeholder="Nome da tarefa..."
        className="w-full text-[12px] text-gray-700 dark:text-white/90 border-none outline-none bg-transparent mb-2 placeholder:text-gray-300"
        autoFocus
      />
      <div className="flex gap-1">
        <button onClick={handleAdd} disabled={!name.trim()} className="text-[10px] font-semibold bg-brand-400 text-white px-2 py-1 rounded border-none cursor-pointer disabled:opacity-40">Criar</button>
        <button onClick={() => setIsAdding(false)} className="text-[10px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer">Cancelar</button>
      </div>
    </div>
  )
}

