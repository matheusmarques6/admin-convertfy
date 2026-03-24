"use client"

import { useState, useRef } from "react"
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn, getInitials } from "@/lib/utils"
import { KANBAN_COLUMNS, TASK_PRIORITY_CONFIG, TASK_TYPE_CONFIG, TASK_STATUS_OPTIONS } from "@/lib/constants/board"
import type { Task, TaskStatus } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface MemberWithProfile {
  id: string
  role: string
  profile?: UserProfile
}

interface ClientInfo {
  id: string
  name: string
  company?: string
}

interface StoreWithClient {
  id: string
  store_name: string
  platform?: string
  client?: { id: string; name: string }
}

interface TaskWithRelations extends Omit<Task, "assignee" | "client" | "store" | "creator"> {
  assignee?: MemberWithProfile
  creator?: UserProfile
  client?: ClientInfo
  store?: StoreWithClient
}

interface BoardMobileKanbanProps {
  tasks: TaskWithRelations[]
  onTaskClick: (task: TaskWithRelations) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}

// ─── MobileTaskCard ───────────────────────────────────────

function MobileTaskCard({
  task,
  onClick,
  onStatusChange,
}: {
  task: TaskWithRelations
  onClick: () => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}) {
  const priority = TASK_PRIORITY_CONFIG[task.priority]
  const type = TASK_TYPE_CONFIG[task.type]
  const isOverdue = task.due_date && new Date(task.due_date) < new Date()

  const formatDueDate = (date: string) => {
    const d = new Date(date)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === today.toDateString()) return "Hoje"
    if (d.toDateString() === tomorrow.toDateString()) return "Amanhã"
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  return (
    <div
      className={cn(
        "rounded-[8px] border p-4",
        "border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
        "active:bg-gray-50 dark:active:bg-[#242836]",
        "transition-colors duration-150",
        isOverdue && "border-[#991B1B]/30 dark:border-[#FCA5A5]/20",
      )}
      onClick={onClick}
    >
      {/* Header: badges + priority */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge variant={type.variant} className="text-[10px]">
          {type.label}
        </Badge>
        <div
          className={cn("w-2 h-2 rounded-full shrink-0", priority.color)}
          title={priority.label}
        />
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] mb-1">
        {task.title}
      </h4>

      {/* Context */}
      {(task.client || task.store) && (
        <p className="text-xs text-gray-500 dark:text-[#8B92A5] truncate mb-2">
          {task.store?.store_name || task.client?.name}
        </p>
      )}

      {/* Footer: due date + assignee */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className={cn(
              "text-[11px] font-mono tabular-nums",
              isOverdue
                ? "text-[#991B1B] dark:text-[#FCA5A5] font-semibold"
                : "text-gray-400 dark:text-[#5C6378]",
            )}>
              {formatDueDate(task.due_date)}
              {isOverdue && " ⚠"}
            </span>
          )}
        </div>
        {task.assignee?.profile && (
          <Avatar className="h-6 w-6">
            <AvatarImage src={task.assignee.profile.avatar_url} />
            <AvatarFallback className="text-[10px] bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA]">
              {getInitials(task.assignee.profile.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* "Mover para..." action — replaces drag on mobile */}
      <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)] dark:border-[rgba(255,255,255,0.05)]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center justify-center gap-2",
                "text-xs font-medium text-gray-400 dark:text-[#5C6378]",
                "hover:text-gray-600 dark:hover:text-[#8B92A5]",
                "min-h-[36px] transition-colors duration-150",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon icon={ArrowRight} customSize={14} />
              Mover para...
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48">
            {TASK_STATUS_OPTIONS
              .filter((s) => s.value !== task.status)
              .map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStatusChange(task.id, status.value)
                  }}
                >
                  {status.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ─── BoardMobileKanban ────────────────────────────────────

export function BoardMobileKanban({
  tasks,
  onTaskClick,
  onStatusChange,
}: BoardMobileKanbanProps) {
  const columns = KANBAN_COLUMNS
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef(0)

  const activeColumn = columns[activeIndex]
  const columnTasks = tasks
    .filter((t) => t.status === activeColumn.id)
    .sort((a, b) => a.position - b.position)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 50 && activeIndex < columns.length - 1) {
      setActiveIndex((prev) => prev + 1)
    } else if (diff < -50 && activeIndex > 0) {
      setActiveIndex((prev) => prev - 1)
    }
  }

  return (
    <div className="mt-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
          disabled={activeIndex === 0}
          className={cn(
            "p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors",
            activeIndex === 0
              ? "text-gray-200 dark:text-[#242836]"
              : "text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836]",
          )}
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", activeColumn.color)} />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {activeColumn.title}
            </h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-[#8B92A5]">
            {columnTasks.length} tarefa{columnTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        <button
          onClick={() => setActiveIndex((prev) => Math.min(columns.length - 1, prev + 1))}
          disabled={activeIndex === columns.length - 1}
          className={cn(
            "p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors",
            activeIndex === columns.length - 1
              ? "text-gray-200 dark:text-[#242836]"
              : "text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836]",
          )}
        >
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Dots indicator */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {columns.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "rounded-full transition-all duration-150",
              i === activeIndex
                ? "w-6 h-2 bg-[#4E62D8] dark:bg-[#7B8CEA]"
                : "w-2 h-2 bg-gray-200 dark:bg-[#242836]",
            )}
          />
        ))}
      </div>

      {/* Cards */}
      <div
        className="space-y-3 px-1"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {columnTasks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
            Nenhuma tarefa nesta coluna
          </p>
        ) : (
          columnTasks.map((task) => (
            <MobileTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              onStatusChange={onStatusChange}
            />
          ))
        )}
      </div>
    </div>
  )
}
