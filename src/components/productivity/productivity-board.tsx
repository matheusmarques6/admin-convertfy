"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { TASK_STATUSES, PRIORITY_LABELS } from "@/types/productivity"
import type { ProductivityTask, TaskGroup } from "@/types/productivity"
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

  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskPriority, setNewTaskPriority] = useState(3)
  const [newTaskProject, setNewTaskProject] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Load data on mount
  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  const allTasks = groups.flatMap((g) => g.items)
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId) || null

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
            <h1 className="text-page-title text-gray-900 dark:text-white m-0">Projetos</h1>
            <span className="bg-gray-100 dark:bg-[#242836] text-gray-600 dark:text-white/70 text-[11px] font-semibold px-[7px] py-[1px] rounded-full font-mono">
              {allTasks.length}
            </span>
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border-none cursor-pointer text-[13px] font-medium bg-brand-400 text-white hover:bg-brand transition-colors duration-fast ease-out-expo"
          >
            <IconPlus size={14} /> Nova tarefa
          </button>
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

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {boardView === "table" && (
            <TableView
              groups={groups}
              collapsedGroups={collapsedGroups}
              toggleGroupCollapse={toggleGroupCollapse}
              expandedTasks={expandedTasks}
              toggleTaskExpand={toggleTaskExpand}
              selectedTaskId={selectedTaskId}
              selectTask={selectTask}
              hoveredTaskId={hoveredTaskId}
              setHoveredTask={setHoveredTask}
              toggleSubtask={toggleSubtask}
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
    </div>
  )
}

// ============================================================================
// Editable Group Name
// ============================================================================

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
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className="text-sm font-semibold text-gray-800 dark:text-white cursor-text hover:bg-gray-100 dark:hover:bg-white/10 dark:bg-[#242836] rounded px-1 -mx-1 transition-colors"
      title="Duplo clique para editar"
    >
      {name}
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
}) {
  return (
    <div>
      {/* Table header */}
      <div className="flex items-center h-8 px-6 bg-gray-50 dark:bg-[#242836] border-b border-gray-200 dark:border-white/10 sticky top-0 z-[5]">
        <div className="w-12" />
        <div className="flex-1 text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Tarefa</div>
        <div className="w-[120px] text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Status</div>
        <div className="w-[50px] text-center text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Resp.</div>
        <div className="w-[60px] text-right text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Data</div>
        <div className="w-[40px] text-right text-[10px] font-semibold text-gray-500 dark:text-white/60 uppercase tracking-wider">Est.</div>
      </div>

      {/* Groups */}
      {groups.map((g) => {
        const isCollapsed = collapsedGroups.has(g.id)
        const doneCount = g.items.filter((i) => i.status === "done").length

        return (
          <div key={g.id}>
            {/* Group header */}
            <div
              onClick={() => toggleGroupCollapse(g.id)}
              className="flex items-center gap-2 h-10 px-6 bg-white dark:bg-[#1A1D27] border-b border-[rgba(0,0,0,0.08)] cursor-pointer hover:bg-gray-25 transition-colors duration-fast ease-out-expo"
            >
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
            </div>

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
                    <div className="w-7 flex justify-center">
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
                      <span className={cn(
                        "text-[13px] font-medium truncate",
                        isDone ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-800 dark:text-white"
                      )}>
                        {t.name}
                      </span>
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
        )
      })}

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
    <div className="w-[400px] bg-white dark:bg-[#1A1D27] border-l border-[rgba(0,0,0,0.08)] overflow-auto shrink-0 flex flex-col">
      {/* Header — editable title */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-start gap-2">
          {editingName ? (
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="text-[16px] font-semibold text-gray-900 dark:text-white flex-1 border-none outline-none bg-transparent p-0 m-0"
              autoFocus
            />
          ) : (
            <h2
              onClick={() => setEditingName(true)}
              className="text-[16px] font-semibold text-gray-900 dark:text-white m-0 flex-1 cursor-text hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] rounded px-1 -mx-1 transition-colors"
            >
              {task.name}
            </h2>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md border-none bg-gray-50 dark:bg-[#242836] cursor-pointer text-gray-400 dark:text-white/50 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 dark:bg-[#242836] transition-colors shrink-0"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Properties — clickable to edit */}
      <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)] flex flex-col gap-2">
        {/* Status */}
        <div className="flex items-center relative">
          <span className="w-[90px] text-[12px] font-medium text-gray-400 dark:text-white/50">Status</span>
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="inline-flex items-center gap-[6px] bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors"
          >
            <StatusDot color={statusConfig?.color || "#9CA3AF"} />
            <span className="text-[13px] text-gray-700 dark:text-white/90">{statusConfig?.label}</span>
          </button>
          {showStatusMenu && (
            <div className="absolute top-full left-[90px] z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-sm py-1 min-w-[140px]">
              {TASK_STATUSES.map((st) => (
                <button
                  key={st.id}
                  onClick={() => { updateTaskStatus(task.id, st.id); setShowStatusMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] border-none bg-transparent cursor-pointer flex items-center gap-2"
                >
                  <StatusDot color={st.color} /> {st.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="flex items-center relative">
          <span className="w-[90px] text-[12px] font-medium text-gray-400 dark:text-white/50">Prioridade</span>
          <button
            onClick={() => setShowPrioMenu(!showPrioMenu)}
            className="inline-flex items-center gap-[6px] bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors"
          >
            <PriorityDot priority={task.priority} />
            <span className="text-[13px] text-gray-700 dark:text-white/90">{PRIORITY_LABELS[task.priority]}</span>
          </button>
          {showPrioMenu && (
            <div className="absolute top-full left-[90px] z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-sm py-1 min-w-[140px]">
              {([1, 2, 3, 4] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { apiAction("update_task", { id: task.id, priority: p }); setShowPrioMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] border-none bg-transparent cursor-pointer flex items-center gap-2"
                >
                  <PriorityDot priority={p} /> {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Responsável — editable */}
        <div className="flex items-center relative">
          <span className="w-[90px] text-[12px] font-medium text-gray-400 dark:text-white/50">Responsavel</span>
          <button
            onClick={() => setShowAssigneeMenu(!showAssigneeMenu)}
            className="inline-flex items-center gap-[6px] bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] transition-colors"
          >
            {task.people[0] ? (
              <>
                <Avatar initials={task.people[0]} size={22} />
                <span className="text-[13px] text-gray-700 dark:text-white/90">{task.people[0]}</span>
              </>
            ) : (
              <span className="text-[13px] text-gray-400 dark:text-white/50">+ Atribuir</span>
            )}
          </button>
          {showAssigneeMenu && (
            <div className="absolute top-full left-[90px] z-20 bg-white dark:bg-[#1A1D27] border border-[rgba(0,0,0,0.08)] rounded-md shadow-sm py-1 min-w-[160px] max-h-[200px] overflow-auto">
              {members.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-white/50">Nenhum membro encontrado</div>
              ) : (
                members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      apiAction("update_assignee", { id: task.id, assigned_to: [m.initials] })
                      setShowAssigneeMenu(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-white/90 hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] border-none bg-transparent cursor-pointer flex items-center gap-2"
                  >
                    <Avatar initials={m.initials} size={20} /> {m.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Data */}
        <div className="flex items-center">
          <span className="w-[90px] text-[12px] font-medium text-gray-400 dark:text-white/50">Data</span>
          <span className="text-[13px] text-gray-700 dark:text-white/90 font-mono">{task.date || "—"}</span>
        </div>

        {/* Estimativa */}
        <div className="flex items-center">
          <span className="w-[90px] text-[12px] font-medium text-gray-400 dark:text-white/50">Estimativa</span>
          <span className="text-[13px] text-gray-700 dark:text-white/90 font-mono">{task.estimatedTime || "—"}</span>
        </div>
      </div>

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

      {/* Subtasks */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between mb-3">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase">Subtarefas</span>
          {hasSubs && (
            <span className="text-[11px] font-semibold text-positive-text font-mono">{subDone}/{task.subtasks.length}</span>
          )}
        </div>
        {task.subtasks.map((sub) => (
          <div key={sub.id} className="flex items-center gap-2 py-1.5">
            <Checkbox
              checked={sub.done}
              onChange={() => toggleSubtask(task.id, sub.id)}
            />
            <span className={cn(
              "text-[13px] flex-1",
              sub.done ? "text-gray-400 dark:text-white/50 line-through" : "text-gray-700 dark:text-white/90"
            )}>
              {sub.name}
            </span>
          </div>
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

      {/* Comments */}
      <div className="px-6 py-4 flex-1">
        <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 uppercase mb-3">Comentarios</div>

        {taskComments.length === 0 && (
          <div className="text-center py-4 text-[12px] text-gray-300">
            Nenhum comentario ainda
          </div>
        )}

        {taskComments.map((c) => (
          <div key={c.id} className="flex gap-2 mb-3">
            <Avatar initials={c.user_initials} size={24} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[12px] font-semibold text-gray-700 dark:text-white/90">{c.user_initials}</span>
                <span className="text-[10px] text-gray-400 dark:text-white/50">{new Date(c.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-[12px] text-gray-600 dark:text-white/70 m-0">{c.text}</p>
            </div>
          </div>
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
