"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { TASK_STATUSES, PRIORITY_LABELS } from "@/types/productivity"
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

        {/* Task Detail Panel */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => selectTask(null)}
            toggleSubtask={toggleSubtask}
          />
        )}
      </div>
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

function CommentItem({
  comment,
}: {
  comment: {
    id: string
    user_id?: string
    user_initials: string
    text: string
    created_at: string
  }
}) {
  const { apiAction, profile } = useProductivityStore()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(comment.text)

  // So o autor edita/exclui (backend valida por user_id)
  const userId =
    typeof window !== "undefined"
      ? (profile as { id?: string } | null)?.id
      : null
  const isOwn = !userId || comment.user_id === userId

  function save() {
    const next = value.trim()
    if (!next) {
      setValue(comment.text)
      setEditing(false)
      return
    }
    if (next !== comment.text) {
      apiAction("update_comment", { id: comment.id, text: next })
    }
    setEditing(false)
  }

  function del() {
    if (window.confirm("Excluir esse comentário?")) {
      apiAction("delete_comment", { id: comment.id })
    }
  }

  return (
    <div className="flex gap-2 mb-3 group/comment">
      <Avatar initials={comment.user_initials} size={24} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-gray-700 dark:text-white/90">
            {comment.user_initials}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-white/50">
            {new Date(comment.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isOwn && (
            <div className="ml-auto flex items-center gap-0.5">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/[0.06] opacity-60 hover:opacity-100"
                  aria-label="Editar comentário"
                  title="Editar"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
              <button
                type="button"
                onClick={del}
                className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 opacity-60 hover:opacity-100"
                aria-label="Excluir comentário"
                title="Excluir"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/></svg>
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="flex items-end gap-2">
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  save()
                }
                if (e.key === "Escape") {
                  setValue(comment.text)
                  setEditing(false)
                }
              }}
              rows={2}
              className="flex-1 px-2 py-1.5 text-[12px] rounded border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] resize-none focus:outline-none focus:border-brand-400"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={save}
                className="h-6 px-2 text-[10.5px] font-semibold bg-brand-400 hover:bg-brand text-white rounded"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue(comment.text)
                  setEditing(false)
                }}
                className="h-6 px-2 text-[10.5px] text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p
            onDoubleClick={() => isOwn && setEditing(true)}
            className="text-[12px] text-gray-600 dark:text-white/70 m-0 whitespace-pre-wrap cursor-text"
            title={isOwn ? "Duplo clique para editar" : undefined}
          >
            {comment.text}
          </p>
        )}
      </div>
    </div>
  )
}

function SubtaskRow({
  sub,
  onToggle,
}: {
  sub: { id: string; name: string; done: boolean }
  taskId: string
  onToggle: () => void
}) {
  const { apiAction } = useProductivityStore()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(sub.name)

  function save() {
    const next = value.trim()
    if (next && next !== sub.name) {
      apiAction("update_subtask", { id: sub.id, name: next })
    } else {
      setValue(sub.name)
    }
    setEditing(false)
  }

  function deleteSubtask() {
    if (window.confirm(`Excluir a subtarefa "${sub.name}"?`)) {
      apiAction("delete_subtask", { id: sub.id })
    }
  }

  return (
    <div className="flex items-center gap-2 py-1.5 group/sub">
      <Checkbox checked={sub.done} onChange={onToggle} />
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") {
              setValue(sub.name)
              setEditing(false)
            }
          }}
          className="flex-1 text-[13px] border-none outline-none bg-transparent text-gray-700 dark:text-white/90"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          title="Duplo clique para editar"
          className={cn(
            "text-[13px] flex-1 cursor-text",
            sub.done
              ? "text-gray-400 dark:text-white/50 line-through"
              : "text-gray-700 dark:text-white/90",
          )}
        >
          {sub.name}
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/[0.06] opacity-50 hover:opacity-100"
        aria-label="Editar"
        title="Editar (ou duplo-clique no texto)"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button
        type="button"
        onClick={deleteSubtask}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 opacity-50 hover:opacity-100"
        aria-label="Excluir subtarefa"
        title="Excluir subtarefa"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/></svg>
      </button>
    </div>
  )
}

// ============================================================================
// Editable Group Name
// ============================================================================

// ============================================================================
// Editable Task Name (inline na linha da tabela)
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

function InlineNewTask({ groupId, groupName, groupColor }: { groupId: string; groupName: string; groupColor: string }) {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const { apiAction } = useProductivityStore()

  const handleAdd = async () => {
    if (!name.trim()) return
    await apiAction("create_task", {
      name: name.trim(),
      status: "pending",
      priority: 3,
      group_id: groupId,
      group_name: groupName,
      group_color: groupColor,
    })
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
              <InlineNewTask groupId={g.id} groupName={g.name} groupColor={g.color} />
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

// ============================================================================
// Task Detail Panel — Rich panel with description, time tracking, comments, subtasks
// ============================================================================

function TaskDetailPanel({
  task, onClose, toggleSubtask,
}: {
  task: ProductivityTask
  onClose: () => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
}) {
  const { apiAction, updateTaskStatus, members, comments } = useProductivityStore()
  const statusConfig = TASK_STATUSES.find((x) => x.id === task.status)
  const hasSubs = task.subtasks.length > 0
  const subDone = task.subtasks.filter((s) => s.done).length
  const taskComments = comments.filter((c) => c.task_id === task.id)

  // Editable fields
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(task.name)
  const [description, setDescription] = useState("")
  const [editingDesc, setEditingDesc] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [newSubtask, setNewSubtask] = useState("")
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPrioMenu, setShowPrioMenu] = useState(false)
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setNameValue(task.name)
  }, [task.name])

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  const timerMin = Math.floor(timerSeconds / 60)
  const timerSec = timerSeconds % 60

  const saveName = () => {
    if (nameValue.trim() && nameValue !== task.name) {
      apiAction("update_task", { id: task.id, name: nameValue.trim() })
    }
    setEditingName(false)
  }

  const saveDescription = () => {
    apiAction("update_task", { id: task.id, description })
    setEditingDesc(false)
  }

  const addSubtask = () => {
    if (!newSubtask.trim()) return
    apiAction("create_subtask" as string, { task_id: task.id, name: newSubtask.trim() })
    setNewSubtask("")
  }

  const addComment = async () => {
    if (!newComment.trim()) return
    await apiAction("add_comment", { task_id: task.id, text: newComment.trim() })
    setNewComment("")
  }

  return (
    <div className="w-[640px] bg-white dark:bg-[#1A1D27] border-l border-[rgba(0,0,0,0.08)] overflow-auto shrink-0 flex flex-col">
      {/* Breadcrumb (so pra tasks de onboarding) */}
      <TaskBreadcrumb task={task} onClose={onClose} />

      {/* Header — editable title (close ja esta no breadcrumb acima) */}
      <div className="px-6 pt-4 pb-3 border-b border-[rgba(0,0,0,0.06)]">
        {editingName ? (
          <input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="text-[20px] font-semibold text-gray-900 dark:text-white w-full border-none outline-none bg-transparent p-0 m-0"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => setEditingName(true)}
            className="text-[20px] font-semibold text-gray-900 dark:text-white m-0 cursor-text hover:bg-gray-50 dark:hover:bg-white/5 rounded px-1 -mx-1 transition-colors leading-snug"
          >
            {task.name}
          </h2>
        )}
      </div>

      {/* Stepper guiado + botao de avanco — substitui o dropdown manual
          de Status. Pendente -> Em andamento -> Em revisao -> Concluido.
          Mantem dropdown como fallback discreto pra edits raros. */}
      <GuidedStatusActions task={task} />

      {/* Properties — clickable to edit (com icones, igual ao mockup) */}
      <TaskMetaRows
        task={task}
        statusConfig={statusConfig}
        showStatusMenu={showStatusMenu}
        setShowStatusMenu={setShowStatusMenu}
        showPrioMenu={showPrioMenu}
        setShowPrioMenu={setShowPrioMenu}
        showAssigneeMenu={showAssigneeMenu}
        setShowAssigneeMenu={setShowAssigneeMenu}
        members={members}
        apiAction={apiAction}
        updateTaskStatus={updateTaskStatus}
      />

      {/* Time tracking */}
      <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-white/50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="text-[12px] font-medium text-gray-600 dark:text-white/70">Time tracking</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold font-mono tabular-nums text-gray-900 dark:text-white">
              {String(timerMin).padStart(2, "0")}:{String(timerSec).padStart(2, "0")}
            </span>
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-colors",
                timerRunning ? "bg-gray-200 text-gray-600 dark:text-white/70" : "bg-brand-400 text-white"
              )}
            >
              {timerRunning ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-2">Descricao</div>
        {editingDesc ? (
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-20 rounded-md border border-[rgba(0,0,0,0.08)] p-2 text-[13px] text-gray-700 dark:text-white/90 resize-none focus:outline-none focus:border-brand-400"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={saveDescription} className="text-[11px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer">Salvar</button>
              <button onClick={() => setEditingDesc(false)} className="text-[11px] text-gray-400 dark:text-white/50 bg-transparent border-none cursor-pointer">Cancelar</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            className="text-[13px] text-gray-500 dark:text-white/60 cursor-text hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] rounded-md p-2 -mx-2 min-h-[40px] transition-colors"
          >
            {description || "Clique para adicionar descricao..."}
          </div>
        )}
      </div>

      {/* Briefing da Etapa — automatico, pra tasks de onboarding */}
      <StageBriefing task={task} />

      {/* Entregaveis — pra tasks de onboarding com task_deliverables */}
      <TaskDeliverables task={task} />

      {/* Checklist — task_checklists (substitui subtasks legacy quando onboarding) */}
      <TaskChecklist
        task={task}
        members={members}
        legacySubtasks={task.subtasks}
        toggleLegacySubtask={(sid) => toggleSubtask(task.id, sid)}
        hasLegacySubs={hasSubs}
        subDone={subDone}
      />

      {/* Anexos & Links — metadata.attachments + metadata.links */}
      <TaskAttachmentsLinks task={task} />

      {/* Legacy: adicao manual de subtask (so se nao for onboarding) */}
      {!(task as unknown as { source_type?: string }).source_type && (
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between mb-3">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase">Subtarefas</span>
          {hasSubs && (
            <span className="text-[11px] font-semibold text-positive-text font-mono">{subDone}/{task.subtasks.length}</span>
          )}
        </div>
        {task.subtasks.map((sub) => (
          <SubtaskRow
            key={sub.id}
            sub={sub}
            taskId={task.id}
            onToggle={() => toggleSubtask(task.id, sub.id)}
          />
        ))}
        {/* Add subtask inline */}
        <div className="flex items-center gap-2 mt-2">
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubtask()}
            placeholder="+ Adicionar subtarefa"
            className="flex-1 text-[12px] text-gray-600 dark:text-white/70 border-none outline-none bg-transparent placeholder:text-gray-300"
          />
        </div>
      </div>
      )}

      {/* Comments */}
      <div className="px-6 py-4 flex-1">
        <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-3">Comentarios</div>

        {taskComments.length === 0 && (
          <div className="text-center py-4 text-[12px] text-gray-300">
            Nenhum comentario ainda
          </div>
        )}

        {taskComments.map((c) => (
          <CommentItem key={c.id} comment={c} />
        ))}

        {/* New comment input */}
        <div className="flex items-start gap-2 mt-2">
          <Avatar initials={useProductivityStore.getState().profile.name?.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "?"} size={24} />
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Escrever comentario..."
            className="flex-1 h-8 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[12px] text-gray-700 dark:text-white/90 focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TaskBreadcrumb — header com path 'Projetos / Onboarding · Cliente / Stage'
// (so renderiza pra tasks de onboarding). Inclui botao de fechar.
// ============================================================================

function TaskBreadcrumb({
  task,
  onClose,
}: {
  task: ProductivityTask
  onClose: () => void
}) {
  const taskAny = task as unknown as {
    source_type?: string
    metadata?: Record<string, unknown>
  }
  const meta = taskAny.metadata ?? {}
  const stageName = (meta.column_name as string) ?? (meta.stage_name as string) ?? null
  const clientName = (meta.client_name as string) ?? null
  const storeName = (meta.store_name as string) ?? null
  const projectLabel = clientName ?? storeName

  return (
    <div className="px-6 py-2.5 border-b border-[rgba(0,0,0,0.06)] bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-1.5 text-[11.5px]">
      <svg
        className="h-3.5 w-3.5 text-gray-400 dark:text-white/40 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M3 7h6l2 2h10v10H3z" />
      </svg>
      <span className="text-gray-500 dark:text-white/55 font-medium">Projetos</span>
      {projectLabel && taskAny.source_type === "onboarding" && (
        <>
          <span className="text-gray-300 dark:text-white/20">/</span>
          <span className="text-gray-500 dark:text-white/55 truncate">
            Onboarding · {projectLabel}
          </span>
        </>
      )}
      {stageName && taskAny.source_type === "onboarding" && (
        <>
          <span className="text-gray-300 dark:text-white/20">/</span>
          <span className="text-gray-700 dark:text-white/80 font-semibold truncate">
            {stageName}
          </span>
        </>
      )}
      <button
        onClick={onClose}
        className="ml-auto h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
        aria-label="Fechar"
      >
        <IconClose size={14} />
      </button>
    </div>
  )
}

// ============================================================================
// GuidedStatusActions — stepper + botao de avanco do status (Pendente ->
// Em andamento -> Em revisao -> Concluido). Substitui o dropdown manual.
// ============================================================================

const GUIDED_STEPS = [
  { id: "pending", label: "Pendente" },
  { id: "progress", label: "Em andamento" },
  { id: "review", label: "Em revisao" },
  { id: "done", label: "Concluida" },
] as const

function GuidedStatusActions({ task }: { task: ProductivityTask }) {
  const { apiAction, updateTaskStatus } = useProductivityStore()
  const currentIdx = GUIDED_STEPS.findIndex((s) => s.id === task.status)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Auto-dismiss toast em 4s
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 4000)
    return () => clearTimeout(t)
  }, [toastMsg])

  const handleAdvance = async () => {
    const next = GUIDED_STEPS[currentIdx + 1]
    if (next) {
      await updateTaskStatus(task.id, next.id as ProductivityTask["status"])
      // Se source_type='onboarding', sincroniza via /api/tasks/[id]/complete
      // quando vai pra 'done' (cria evento + checa stage_ready_to_advance).
      const meta = (task as unknown as { source_type?: string }).source_type
      if (next.id === "done" && meta === "onboarding") {
        try {
          await fetch(`/api/tasks/${task.id}/complete`, { method: "POST" })
        } catch {
          // best-effort; ja foi marcada local
        }
        setToastMsg(
          "Tarefa concluida! Proxima tarefa do fluxo foi liberada automaticamente.",
        )
      } else if (next.id === "done") {
        setToastMsg("Tarefa concluida!")
      }
    }
  }

  const handleReopen = async () => {
    await updateTaskStatus(task.id, "progress")
  }

  const actionConfig =
    currentIdx === 0
      ? { label: "Iniciar tarefa", color: "#4E62D8", icon: "▶", hint: "Próximo passo: iniciar tarefa" }
      : currentIdx === 1
        ? { label: "Marcar pronta pra revisao", color: "#7C3AED", icon: "👁", hint: "Próximo passo: enviar pra revisão" }
        : currentIdx === 2
          ? { label: "Entregar e concluir", color: "#10B981", icon: "🚀", hint: "Próximo passo: entregar a tarefa" }
          : { label: "Reabrir tarefa", color: "#6B7280", icon: "↺", hint: "Tarefa concluída — pode reabrir se precisar" }

  const isLast = currentIdx === GUIDED_STEPS.length - 1
  const onClick = isLast ? handleReopen : handleAdvance

  return (
    <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
      {/* Stepper visual de 4 etapas */}
      <div className="flex items-center justify-between mb-3">
        {GUIDED_STEPS.map((s, i) => {
          const done = i < currentIdx
          const active = i === currentIdx
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all",
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-brand-500 text-white ring-4 ring-brand-500/15"
                        : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-white/40",
                  )}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium text-center",
                    active
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-400 dark:text-white/40",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < GUIDED_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 mx-1 -mt-3",
                    i < currentIdx
                      ? "bg-emerald-500"
                      : "bg-gray-200 dark:bg-white/10",
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Hint card + Botao de acao */}
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-gray-50/60 dark:bg-white/[0.02] p-3 flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white leading-tight">
            {actionConfig.hint}
          </p>
          {!isLast && (
            <p className="text-[11px] text-gray-500 dark:text-white/55 mt-0.5">
              Quando voce comecar a trabalhar, marque pra comecar a contar o tempo.
            </p>
          )}
        </div>
        <button
          onClick={onClick}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[8px] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
          style={{ background: actionConfig.color }}
        >
          <span>{actionConfig.icon}</span>
          {actionConfig.label}
        </button>
      </div>

      {/* Toast de sucesso ao concluir */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 dark:bg-gray-800 text-white px-4 py-2.5 rounded-[10px] shadow-lg flex items-center gap-2 text-[13px] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="text-emerald-400 text-[16px]">✓</span>
          {toastMsg}
        </div>
      )}

      {/* Dropdown discreto pra edits raros (volta manualmente) */}
      <details className="mt-2">
        <summary className="text-[11px] text-gray-400 dark:text-white/40 cursor-pointer hover:text-gray-600">
          Trocar status manualmente
        </summary>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          {TASK_STATUSES.map((st) => (
            <button
              key={st.id}
              onClick={() => apiAction("update_task", { id: task.id, status: st.id })}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] border transition-colors",
                task.status === st.id
                  ? "border-brand-500 bg-brand-500/10 text-brand-600"
                  : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-50",
              )}
            >
              {st.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}

// ============================================================================
// StageBriefing — bloco "Briefing da etapa" automatico pra tasks de
// onboarding. Mostra a etapa de origem + descricao da task (que ja vem
// do checklist_template da coluna) com selo AUTOMATICO.
// ============================================================================

function StageBriefing({ task }: { task: ProductivityTask }) {
  const taskAny = task as unknown as {
    source_type?: string
    description?: string
    onboarding_id?: string
    metadata?: Record<string, unknown>
  }
  if (taskAny.source_type !== "onboarding") return null

  const meta = taskAny.metadata ?? {}
  const stageName = (meta.column_name as string) ?? (meta.stage_name as string) ?? "Etapa"
  const stageColor = (meta.stage_color as string) ?? "#4E62D8"
  const storeName = (meta.store_name as string) ?? null
  const clientName = (meta.client_name as string) ?? null

  return (
    <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)]">
      <div
        className="rounded-[10px] p-3 border-l-[3px]"
        style={{
          borderLeftColor: stageColor,
          background: `${stageColor}10`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-gray-700 dark:text-white/85">
            Briefing da etapa
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono"
            style={{ background: stageColor, color: "white" }}
          >
            ⚡ Automatico
          </span>
        </div>
        <p className="text-[12px] text-gray-700 dark:text-white/75 mb-2">
          <span className="font-semibold" style={{ color: stageColor }}>
            {stageName}
          </span>
          {(storeName || clientName) && (
            <span className="text-gray-500 dark:text-white/55">
              {" · "}Onboarding de {storeName ?? clientName}
            </span>
          )}
        </p>
        {taskAny.description && (
          <div className="text-[12.5px] text-gray-700 dark:text-white/80 leading-relaxed whitespace-pre-line">
            {taskAny.description}
          </div>
        )}
        {!taskAny.description && (
          <p className="text-[11.5px] italic text-gray-400 dark:text-white/40">
            Tarefa do checklist da etapa {stageName}. Conclua junto com as
            outras pra avancar o onboarding.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TaskMetaRows — bloco de propriedades com icones (Status, Prioridade,
// Responsavel, Cliente, Data, Estimativa) — igual ao Print 2.
// ============================================================================

type StatusConfigType = { id: string; label: string; color: string } | undefined

function MetaIcon({ kind, color }: { kind: string; color?: string }) {
  const stroke = color ?? "#9CA3AF"
  const common = {
    width: 14,
    height: 14,
    fill: "none",
    stroke,
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }
  switch (kind) {
    case "status":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      )
    case "priority":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4 21V4M4 4l8 4-8 4M4 4l14 6-14 5" />
        </svg>
      )
    case "user":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        </svg>
      )
    case "building":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 8h.01M9 12h.01M9 16h.01M15 8h.01M15 12h.01M15 16h.01" />
        </svg>
      )
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      )
    case "hourglass":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M6 3h12M6 21h12M7 3l5 9 5-9M7 21l5-9 5 9" />
        </svg>
      )
    default:
      return null
  }
}

function TaskMetaRows({
  task,
  statusConfig,
  showStatusMenu,
  setShowStatusMenu,
  showPrioMenu,
  setShowPrioMenu,
  showAssigneeMenu,
  setShowAssigneeMenu,
  members,
  apiAction,
  updateTaskStatus,
}: {
  task: ProductivityTask
  statusConfig: StatusConfigType
  showStatusMenu: boolean
  setShowStatusMenu: (v: boolean) => void
  showPrioMenu: boolean
  setShowPrioMenu: (v: boolean) => void
  showAssigneeMenu: boolean
  setShowAssigneeMenu: (v: boolean) => void
  members: Array<{ id: string; name: string; avatar_url: string | null; initials: string }>
  apiAction: (action: string, data?: Record<string, unknown>) => Promise<boolean>
  updateTaskStatus: (id: string, status: ProductivityTask["status"]) => void
}) {
  const taskAny = task as unknown as { metadata?: Record<string, unknown> }
  const clientName = (taskAny.metadata?.client_name as string) ?? null
  const storeName = (taskAny.metadata?.store_name as string) ?? null
  const clientLabel = clientName ?? storeName

  return (
    <div className="px-6 py-3.5 border-b border-[rgba(0,0,0,0.06)] grid grid-cols-[140px_1fr] gap-y-2.5 items-center">
      <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
        <MetaIcon kind="status" />
        <span>Status</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <StatusDot color={statusConfig?.color || "#9CA3AF"} />
          <span className="text-[13px] text-gray-700 dark:text-white/90">{statusConfig?.label}</span>
        </button>
        {showStatusMenu && (
          <div className="absolute top-full left-0 z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-lg py-1 min-w-[160px] mt-1">
            {TASK_STATUSES.map((st) => (
              <button
                key={st.id}
                onClick={() => { updateTaskStatus(task.id, st.id as ProductivityTask["status"]); setShowStatusMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer flex items-center gap-2"
              >
                <StatusDot color={st.color} /> {st.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
        <MetaIcon kind="priority" />
        <span>Prioridade</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setShowPrioMenu(!showPrioMenu)}
          className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <PriorityDot priority={task.priority} />
          <span className="text-[13px] text-gray-700 dark:text-white/90">{PRIORITY_LABELS[task.priority]}</span>
        </button>
        {showPrioMenu && (
          <div className="absolute top-full left-0 z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-lg py-1 min-w-[140px] mt-1">
            {([1, 2, 3, 4] as const).map((p) => (
              <button
                key={p}
                onClick={() => { apiAction("update_task", { id: task.id, priority: p }); setShowPrioMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer flex items-center gap-2"
              >
                <PriorityDot priority={p} /> {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
        <MetaIcon kind="user" />
        <span>Responsavel</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setShowAssigneeMenu(!showAssigneeMenu)}
          className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-white/5"
        >
          {task.people[0] ? (
            <>
              <Avatar initials={task.people[0]} size={20} />
              <span className="text-[13px] text-gray-700 dark:text-white/90">{task.people[0]}</span>
            </>
          ) : (
            <span className="text-[13px] text-gray-400 dark:text-white/50">+ Atribuir</span>
          )}
        </button>
        {showAssigneeMenu && (
          <div className="absolute top-full left-0 z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-lg py-1 min-w-[180px] max-h-[200px] overflow-auto mt-1">
            {members.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-white/50">Nenhum membro</div>
            ) : (
              members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { apiAction("update_assignee", { id: task.id, assigned_to: [m.initials] }); setShowAssigneeMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 border-none bg-transparent cursor-pointer flex items-center gap-2"
                >
                  <Avatar initials={m.initials} size={18} /> {m.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {clientLabel && (
        <>
          <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
            <MetaIcon kind="building" />
            <span>Cliente</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-white/[0.04]">
              <span className="h-4 w-4 rounded-sm bg-gradient-to-br from-brand-400 to-brand-600 text-white text-[9px] font-bold flex items-center justify-center">
                {clientLabel.substring(0, 2).toUpperCase()}
              </span>
              <span className="text-[13px] text-gray-700 dark:text-white/90">{clientLabel}</span>
            </span>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
        <MetaIcon kind="calendar" />
        <span>Data</span>
      </div>
      <span className="text-[13px] text-gray-700 dark:text-white/90 font-mono">{task.date || "—"}</span>

      <div className="flex items-center gap-2 text-[12.5px] text-gray-500 dark:text-white/55">
        <MetaIcon kind="hourglass" />
        <span>Estimativa</span>
      </div>
      <span className="text-[13px] text-gray-700 dark:text-white/90 font-mono">{task.estimatedTime || "—"}</span>
    </div>
  )
}

// ============================================================================
// TaskDeliverables — ENTREGAVEIS X/Y (so quando task_deliverables existem).
// ============================================================================

type Deliverable = {
  id: string
  field_label: string
  field_slug: string
  field_type: string
  required: boolean
  value: string | null
  file_url: string | null
  file_name: string | null
  filled_at: string | null
  metadata: Record<string, unknown> | null
}

function deliverableStatus(d: Deliverable): {
  label: string
  color: string
  bg: string
} {
  const metaStatus = (d.metadata?.status as string) ?? null
  const status = metaStatus ?? (d.filled_at ? "done" : "todo")
  if (status === "done" || status === "ready" || status === "pronto") {
    return { label: "Pronto", color: "#059669", bg: "#10B98119" }
  }
  if (status === "in_progress" || status === "em_producao" || status === "producao") {
    return { label: "Em produção", color: "#7C3AED", bg: "#7C3AED19" }
  }
  return { label: "A fazer", color: "#6B7280", bg: "#9CA3AF14" }
}

function TaskDeliverables({ task }: { task: ProductivityTask }) {
  const taskAny = task as unknown as { deliverables?: Deliverable[] }
  const deliverables = taskAny.deliverables ?? []
  if (deliverables.length === 0) return null
  const done = deliverables.filter(
    (d) => deliverableStatus(d).label === "Pronto",
  ).length

  const cycleStatus = async (d: Deliverable) => {
    const cur = deliverableStatus(d).label
    const next = cur === "A fazer" ? "in_progress" : cur === "Em produção" ? "done" : "todo"
    try {
      await fetch(`/api/tasks/${task.id}/deliverables/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { ...(d.metadata ?? {}), status: next },
          filled_at: next === "done" ? new Date().toISOString() : null,
        }),
      })
    } catch {
      /* noop */
    }
  }

  return (
    <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-3">
        <svg className="h-3.5 w-3.5 text-gray-400 dark:text-white/40" viewBox="0 0 10 10" fill="none">
          <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700 dark:text-white/85">
          Entregáveis
        </span>
        <span className="text-[11px] text-gray-400 dark:text-white/40 font-mono">
          · {done}/{deliverables.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {deliverables.map((d) => {
          const st = deliverableStatus(d)
          return (
            <button
              key={d.id}
              onClick={() => cycleStatus(d)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-white dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
              title="Clique pra alternar status"
            >
              <span className="inline-flex items-center gap-2 text-[13px] text-gray-800 dark:text-white/90">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: st.color }}
                />
                {d.field_label}
              </span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{ background: st.bg, color: st.color }}
              >
                {st.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// TaskChecklist — substitui Subtarefas pra onboarding. Usa task_checklists.
// ============================================================================

type ChecklistItem = {
  id: string
  title: string
  is_completed: boolean
  completed_by: string | null
  position: number
}

function TaskChecklist({
  task,
  members,
  legacySubtasks,
  toggleLegacySubtask,
  hasLegacySubs,
  subDone,
}: {
  task: ProductivityTask
  members: Array<{ id: string; name: string; avatar_url: string | null; initials: string }>
  legacySubtasks: ProductivityTask["subtasks"]
  toggleLegacySubtask: (subId: string) => void
  hasLegacySubs: boolean
  subDone: number
}) {
  const taskAny = task as unknown as {
    source_type?: string
    checklist?: ChecklistItem[]
  }
  const isOnb = taskAny.source_type === "onboarding"
  const items = taskAny.checklist ?? []

  if (!isOnb) {
    if (!hasLegacySubs) return null
    return (
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div className="flex justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700 dark:text-white/85">
            Subtarefas · {subDone}/{legacySubtasks.length}
          </span>
        </div>
        {legacySubtasks.map((sub) => (
          <SubtaskRow
            key={sub.id}
            sub={sub}
            taskId={task.id}
            onToggle={() => toggleLegacySubtask(sub.id)}
          />
        ))}
      </div>
    )
  }

  if (items.length === 0) return null
  const done = items.filter((i) => i.is_completed).length

  const toggle = async (item: ChecklistItem) => {
    try {
      await fetch(`/api/tasks/${task.id}/checklists`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: item.id,
          is_completed: !item.is_completed,
        }),
      })
    } catch {
      /* noop */
    }
  }

  return (
    <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 text-gray-400 dark:text-white/40" viewBox="0 0 10 10" fill="none">
            <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700 dark:text-white/85">
            Checklist
          </span>
          <span className="text-[11px] text-gray-400 dark:text-white/40 font-mono">
            · {done}/{items.length}
          </span>
        </div>
        <button className="text-[11px] text-gray-400 dark:text-white/40 hover:text-gray-700">
          + Subtarefa
        </button>
      </div>
      {items.length > 0 && (
        <div className="h-1 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const member = item.completed_by
            ? members.find((m) => m.id === item.completed_by)
            : null
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group"
            >
              <Checkbox
                checked={item.is_completed}
                onChange={() => toggle(item)}
              />
              <span
                className={cn(
                  "flex-1 text-[13px]",
                  item.is_completed
                    ? "text-gray-400 dark:text-white/35 line-through"
                    : "text-gray-700 dark:text-white/85",
                )}
              >
                {item.title}
              </span>
              {member && (
                <Avatar initials={member.initials} size={20} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// TaskAttachmentsLinks — bloco de Anexos & Links.
// ============================================================================

type Attachment = {
  url?: string
  file_url?: string
  name?: string
  file_name?: string
  size?: number
  file_size_bytes?: number
  kind?: string
}

function getFileIcon(name: string): { emoji: string; color: string } {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) return { emoji: "📄", color: "#DC2626" }
  if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp)$/.test(lower))
    return { emoji: "🖼️", color: "#7C3AED" }
  if (lower.includes("figma")) return { emoji: "🎨", color: "#F24E1E" }
  return { emoji: "📎", color: "#6B7280" }
}

function formatBytes(b?: number): string {
  if (!b) return ""
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function TaskAttachmentsLinks({ task }: { task: ProductivityTask }) {
  const taskAny = task as unknown as {
    source_type?: string
    attachments?: Attachment[]
    links?: Array<{ url: string; label?: string; favicon?: string }>
  }
  if (taskAny.source_type !== "onboarding") return null
  const attachments = taskAny.attachments ?? []
  const links = taskAny.links ?? []
  if (attachments.length === 0 && links.length === 0) {
    return (
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700 dark:text-white/85">
            Anexos &amp; Links
          </span>
          <button className="text-[11.5px] text-brand-600 hover:underline inline-flex items-center gap-1">
            📎 Anexar
          </button>
        </div>
        <p className="text-[11.5px] text-gray-400 dark:text-white/40 mt-2 italic">
          Nenhum anexo ou link adicionado ainda.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-700 dark:text-white/85">
          Anexos &amp; Links
        </span>
        <button className="text-[11.5px] text-brand-600 hover:underline inline-flex items-center gap-1">
          📎 Anexar
        </button>
      </div>
      <div className="space-y-1.5">
        {attachments.map((a, i) => {
          const name = a.name ?? a.file_name ?? "arquivo"
          const url = a.url ?? a.file_url
          const size = formatBytes(a.size ?? a.file_size_bytes)
          const ic = getFileIcon(name)
          return (
            <a
              key={`att-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-white dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[14px]"
                  style={{ background: `${ic.color}14` }}
                >
                  {ic.emoji}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] text-gray-800 dark:text-white/90 truncate">
                    {name}
                  </div>
                  {size && (
                    <div className="text-[10.5px] text-gray-400 dark:text-white/40 font-mono">
                      {size}
                    </div>
                  )}
                </div>
              </div>
              <svg
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 3v12M6 9l6 6 6-6" />
              </svg>
            </a>
          )
        })}
        {links.map((l, i) => {
          const ic = getFileIcon(l.url)
          const host = (() => {
            try {
              return new URL(l.url).hostname.replace("www.", "")
            } catch {
              return l.url
            }
          })()
          return (
            <a
              key={`link-${i}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-white dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[14px]"
                  style={{ background: `${ic.color}14` }}
                >
                  {ic.emoji}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] text-gray-800 dark:text-white/90 truncate">
                    {l.label ?? host}
                  </div>
                  <div className="text-[10.5px] text-gray-400 dark:text-white/40 font-mono truncate">
                    {host}
                  </div>
                </div>
              </div>
              <svg
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M15 3h6v6M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
              </svg>
            </a>
          )
        })}
      </div>
    </div>
  )
}
