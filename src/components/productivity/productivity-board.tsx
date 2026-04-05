"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { TASK_STATUSES, PRIORITY_COLORS, PRIORITY_LABELS } from "@/types/productivity"
import type { ProductivityTask, TaskGroup } from "@/types/productivity"
import {
  PriorityDot, StatusDot, Avatar, Checkbox, ProgressBar,
  Card, CardHeader, DSBadge,
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
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-gray-900 m-0">Projetos</h1>
            <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-[7px] py-[1px] rounded-full font-mono">
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
          <div className="mx-6 mb-2 p-4 bg-gray-50 rounded-md border border-[rgba(0,0,0,0.08)]">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Nome da tarefa</label>
                <input
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
                  placeholder="Ex: Criar wireframe da pagina de precos"
                  className="w-full h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 bg-white"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <label className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Projeto</label>
                <input
                  value={newTaskProject}
                  onChange={(e) => setNewTaskProject(e.target.value)}
                  placeholder="Projeto"
                  className="w-full h-9 px-3 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 bg-white"
                />
              </div>
              <div className="w-20">
                <label className="text-[10px] font-semibold text-gray-400 uppercase block mb-1">Prioridade</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(Number(e.target.value))}
                  className="w-full h-9 px-2 rounded-sm border border-[rgba(0,0,0,0.08)] text-[13px] text-gray-700 focus:outline-none focus:border-brand-400 bg-white"
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
                className="h-9 w-9 rounded-sm border border-[rgba(0,0,0,0.08)] bg-white flex items-center justify-center cursor-pointer text-gray-400 hover:bg-gray-50 transition-colors duration-fast ease-out-expo"
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
                  ? "text-gray-900 border-b-2 border-brand-400"
                  : "text-gray-400 border-b-2 border-transparent hover:text-gray-600"
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
      <div className="h-9 pl-[72px] flex items-center border-b border-gray-100">
        <button
          onClick={() => setIsAdding(true)}
          className="border-none bg-transparent cursor-pointer text-[13px] text-gray-400 p-0 flex items-center gap-1 hover:text-gray-600 transition-colors duration-fast ease-out-expo"
        >
          <IconPlus size={14} /> Nova tarefa
        </button>
      </div>
    )
  }

  return (
    <div className="h-10 pl-[72px] pr-6 flex items-center border-b border-gray-100 gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setIsAdding(false) }}
        placeholder="Nome da tarefa..."
        className="flex-1 text-[13px] text-gray-700 border-none outline-none bg-transparent placeholder:text-gray-300"
        autoFocus
      />
      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className="text-[11px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer disabled:opacity-40"
      >
        Criar
      </button>
      <button onClick={() => setIsAdding(false)} className="text-gray-400 bg-transparent border-none cursor-pointer text-[11px]">Cancelar</button>
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
      <div className="flex items-center h-8 px-6 bg-gray-50 border-b border-gray-200 sticky top-0 z-[5]">
        <div className="w-12" />
        <div className="flex-1 text-table-header text-gray-500 uppercase">Tarefa</div>
        <div className="w-[120px] text-table-header text-gray-500 uppercase">Status</div>
        <div className="w-[50px] text-center text-table-header text-gray-500 uppercase">Resp</div>
        <div className="w-[56px] text-right text-table-header text-gray-500 uppercase">Data</div>
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
              className="flex items-center gap-2 h-10 px-6 bg-white border-b border-[rgba(0,0,0,0.08)] cursor-pointer hover:bg-gray-25 transition-colors duration-fast ease-out-expo"
            >
              <div className="w-[3px] h-[18px] rounded-[2px]" style={{ background: g.color }} />
              <svg
                width="10" height="10" viewBox="0 0 10 10"
                className={cn("transition-transform duration-fast ease-out-expo", !isCollapsed && "rotate-90")}
              >
                <path d="M3 1l4 4-4 4" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-semibold text-gray-800">{g.name}</span>
              <span className="text-[11px] font-semibold text-gray-400 font-mono">{g.items.length}</span>
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
                      "flex items-center h-10 px-6 border-b border-gray-100 cursor-pointer transition-colors duration-fast ease-out-expo",
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
                            "w-4 h-4 border-none bg-transparent cursor-pointer text-gray-400 p-0 transition-transform duration-fast ease-out-expo",
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
                        isDone ? "text-gray-400 line-through" : "text-gray-800"
                      )}>
                        {t.name}
                      </span>
                      {hasSubs && (
                        <span className="text-[10px] font-semibold text-gray-400 font-mono bg-gray-100 px-[5px] py-[1px] rounded-sm">
                          {subDone}/{t.subtasks.length}
                        </span>
                      )}
                    </div>
                    <div className="w-[120px] flex items-center gap-[6px]">
                      <StatusDot color={statusConfig?.color || "#9CA3AF"} />
                      <span className="text-[13px] text-gray-600">{statusConfig?.label}</span>
                    </div>
                    <div className="w-[50px] flex justify-center">
                      <Avatar initials={t.people[0]} size={24} />
                    </div>
                    <div className="w-[56px] text-right text-[12px] text-gray-500 font-mono">
                      {t.date}
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
                        sub.done ? "text-gray-400 line-through" : "text-gray-600"
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
  return (
    <div className="flex gap-3 p-6 overflow-auto items-start">
      {TASK_STATUSES.map((st) => {
        const items = tasks.filter((t) => t.status === st.id)
        return (
          <div key={st.id} className="min-w-[200px] flex-1">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <StatusDot color={st.color} />
              <span className="text-[13px] font-semibold text-gray-700">{st.label}</span>
              <span className="text-[11px] font-semibold text-gray-400 font-mono">{items.length}</span>
            </div>

            {/* Cards container */}
            <div className="bg-gray-50 rounded-md p-2 min-h-[50px]">
              {items.length === 0 && (
                <div className="p-4 text-center text-[12px] text-gray-300">Vazio</div>
              )}
              {items.map((t) => (
                <div
                  key={t.id}
                  onClick={() => selectTask(t.id)}
                  className={cn(
                    "bg-white border rounded-md p-3 mb-2 cursor-grab transition-all duration-fast ease-out-expo hover:shadow-sm",
                    selectedTaskId === t.id
                      ? "border-brand-400"
                      : "border-[rgba(0,0,0,0.08)]"
                  )}
                >
                  <div className="text-[13px] font-medium text-gray-800 mb-2">{t.name}</div>
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2">
                      <PriorityDot priority={t.priority} />
                      <span className="text-[11px] text-gray-400 font-mono">{t.date}</span>
                    </div>
                    <Avatar initials={t.people[0]} size={22} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
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
  const { apiAction, updateTaskStatus } = useProductivityStore()
  const statusConfig = TASK_STATUSES.find((x) => x.id === task.status)
  const hasSubs = task.subtasks.length > 0
  const subDone = task.subtasks.filter((s) => s.done).length

  // Editable fields
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(task.name)
  const [description, setDescription] = useState("")
  const [editingDesc, setEditingDesc] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [newSubtask, setNewSubtask] = useState("")
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPrioMenu, setShowPrioMenu] = useState(false)

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

  const addComment = () => {
    if (!newComment.trim()) return
    // Would call apiAction for comments
    setNewComment("")
  }

  return (
    <div className="w-[400px] bg-white border-l border-[rgba(0,0,0,0.08)] overflow-auto shrink-0 flex flex-col">
      {/* Header — editable title */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-start gap-2">
          {editingName ? (
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="text-[16px] font-semibold text-gray-900 flex-1 border-none outline-none bg-transparent p-0 m-0"
              autoFocus
            />
          ) : (
            <h2
              onClick={() => setEditingName(true)}
              className="text-[16px] font-semibold text-gray-900 m-0 flex-1 cursor-text hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
            >
              {task.name}
            </h2>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md border-none bg-gray-50 cursor-pointer text-gray-400 flex items-center justify-center hover:bg-gray-100 transition-colors shrink-0"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Properties — clickable to edit */}
      <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)] flex flex-col gap-2">
        {/* Status */}
        <div className="flex items-center relative">
          <span className="w-[90px] text-[12px] font-medium text-gray-400">Status</span>
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="inline-flex items-center gap-[6px] bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-50 transition-colors"
          >
            <StatusDot color={statusConfig?.color || "#9CA3AF"} />
            <span className="text-[13px] text-gray-700">{statusConfig?.label}</span>
          </button>
          {showStatusMenu && (
            <div className="absolute top-full left-[90px] z-20 bg-white border border-[rgba(0,0,0,0.08)] rounded-md shadow-sm py-1 min-w-[140px]">
              {TASK_STATUSES.map((st) => (
                <button
                  key={st.id}
                  onClick={() => { updateTaskStatus(task.id, st.id); setShowStatusMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 border-none bg-transparent cursor-pointer flex items-center gap-2"
                >
                  <StatusDot color={st.color} /> {st.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="flex items-center relative">
          <span className="w-[90px] text-[12px] font-medium text-gray-400">Prioridade</span>
          <button
            onClick={() => setShowPrioMenu(!showPrioMenu)}
            className="inline-flex items-center gap-[6px] bg-transparent border-none cursor-pointer p-1 rounded hover:bg-gray-50 transition-colors"
          >
            <PriorityDot priority={task.priority} />
            <span className="text-[13px] text-gray-700">{PRIORITY_LABELS[task.priority]}</span>
          </button>
          {showPrioMenu && (
            <div className="absolute top-full left-[90px] z-20 bg-white border border-[rgba(0,0,0,0.08)] rounded-md shadow-sm py-1 min-w-[140px]">
              {([1, 2, 3, 4] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { apiAction("update_task", { id: task.id, priority: p }); setShowPrioMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50 border-none bg-transparent cursor-pointer flex items-center gap-2"
                >
                  <PriorityDot priority={p} /> {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Responsável */}
        <div className="flex items-center">
          <span className="w-[90px] text-[12px] font-medium text-gray-400">Responsavel</span>
          <span className="inline-flex items-center gap-[6px]">
            <Avatar initials={task.people[0] || "?"} size={22} />
            <span className="text-[13px] text-gray-700">{task.people[0] || "—"}</span>
          </span>
        </div>

        {/* Data */}
        <div className="flex items-center">
          <span className="w-[90px] text-[12px] font-medium text-gray-400">Data</span>
          <span className="text-[13px] text-gray-700 font-mono">{task.date || "—"}</span>
        </div>

        {/* Estimativa */}
        <div className="flex items-center">
          <span className="w-[90px] text-[12px] font-medium text-gray-400">Estimativa</span>
          <span className="text-[13px] text-gray-700 font-mono">{task.estimatedTime || "—"}</span>
        </div>
      </div>

      {/* Time tracking */}
      <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="text-[12px] font-medium text-gray-600">Time tracking</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold font-mono tabular-nums text-gray-900">
              {String(timerMin).padStart(2, "0")}:{String(timerSec).padStart(2, "0")}
            </span>
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-colors",
                timerRunning ? "bg-gray-200 text-gray-600" : "bg-brand-400 text-white"
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
        <div className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Descricao</div>
        {editingDesc ? (
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-20 rounded-md border border-[rgba(0,0,0,0.08)] p-2 text-[13px] text-gray-700 resize-none focus:outline-none focus:border-brand-400"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={saveDescription} className="text-[11px] font-semibold bg-brand-400 text-white px-3 py-1 rounded-md border-none cursor-pointer">Salvar</button>
              <button onClick={() => setEditingDesc(false)} className="text-[11px] text-gray-400 bg-transparent border-none cursor-pointer">Cancelar</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            className="text-[13px] text-gray-500 cursor-text hover:bg-gray-50 rounded-md p-2 -mx-2 min-h-[40px] transition-colors"
          >
            {description || "Clique para adicionar descricao..."}
          </div>
        )}
      </div>

      {/* Subtasks */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between mb-3">
          <span className="text-[11px] font-semibold text-gray-400 uppercase">Subtarefas</span>
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
              sub.done ? "text-gray-400 line-through" : "text-gray-700"
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
            className="flex-1 text-[12px] text-gray-600 border-none outline-none bg-transparent placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* Comments */}
      <div className="px-6 py-4 flex-1">
        <div className="text-[11px] font-semibold text-gray-400 uppercase mb-3">Comentarios</div>

        <div className="text-center py-4 text-[12px] text-gray-300">
          Nenhum comentario ainda
        </div>

        {/* New comment input */}
        <div className="flex items-start gap-2 mt-2">
          <Avatar initials="?" size={24} />
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Escrever comentario..."
            className="flex-1 h-8 px-3 rounded-md border border-[rgba(0,0,0,0.08)] text-[12px] text-gray-700 focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>
    </div>
  )
}
