"use client"

import { useState, useCallback } from "react"
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
  } = useProductivityStore()

  const allTasks = groups.flatMap((g) => g.items)
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId) || null

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
          <button className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border-none cursor-pointer text-[13px] font-medium bg-brand-400 text-white hover:bg-brand transition-colors duration-fast ease-out-expo">
            <IconPlus size={14} /> Nova tarefa
          </button>
        </div>

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

            {/* Add task button */}
            {!isCollapsed && (
              <div className="h-9 pl-[72px] flex items-center border-b border-gray-100">
                <button className="border-none bg-transparent cursor-pointer text-[13px] text-gray-400 p-0 flex items-center gap-1 hover:text-gray-600 transition-colors duration-fast ease-out-expo">
                  <IconPlus size={14} /> Nova tarefa
                </button>
              </div>
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
// Task Detail Panel
// ============================================================================

function TaskDetailPanel({
  task, onClose, toggleSubtask,
}: {
  task: ProductivityTask
  onClose: () => void
  toggleSubtask: (taskId: string, subtaskId: string) => void
}) {
  const statusConfig = TASK_STATUSES.find((x) => x.id === task.status)
  const hasSubs = task.subtasks.length > 0
  const subDone = task.subtasks.filter((s) => s.done).length

  return (
    <div className="w-[320px] bg-white border-l border-[rgba(0,0,0,0.08)] overflow-auto shrink-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between">
          <h2 className="text-[16px] font-semibold text-gray-900 m-0 flex-1">{task.name}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-sm border-none bg-gray-50 cursor-pointer text-gray-400 flex items-center justify-center hover:bg-gray-100 transition-colors duration-fast ease-out-expo"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Properties */}
      <div className="px-6 py-3 border-b border-[rgba(0,0,0,0.08)] flex flex-col gap-2">
        {[
          {
            label: "Status",
            value: (
              <span className="inline-flex items-center gap-[6px]">
                <StatusDot color={statusConfig?.color || "#9CA3AF"} />
                <span className="text-[13px] text-gray-600">{statusConfig?.label}</span>
              </span>
            ),
          },
          {
            label: "Prio",
            value: (
              <span className="inline-flex items-center gap-[6px]">
                <PriorityDot priority={task.priority} />
                <span className="text-[13px] text-gray-600">{PRIORITY_LABELS[task.priority]}</span>
              </span>
            ),
          },
          {
            label: "Data",
            value: <span className="text-[13px] text-gray-600 font-mono">{task.date}</span>,
          },
        ].map((prop) => (
          <div key={prop.label} className="flex items-center">
            <span className="w-[70px] text-[12px] font-medium text-gray-400">{prop.label}</span>
            {prop.value}
          </div>
        ))}
      </div>

      {/* Subtasks */}
      {hasSubs && (
        <div className="px-6 py-4">
          <div className="flex justify-between mb-3">
            <span className="text-[12px] font-medium text-gray-400 uppercase">Subtarefas</span>
            <span className="text-[11px] font-semibold text-positive-text font-mono">{subDone}/{task.subtasks.length}</span>
          </div>
          {task.subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 py-1">
              <Checkbox
                checked={sub.done}
                onChange={() => toggleSubtask(task.id, sub.id)}
              />
              <span className={cn(
                "text-[13px]",
                sub.done ? "text-gray-400 line-through" : "text-gray-700"
              )}>
                {sub.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
