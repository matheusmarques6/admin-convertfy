"use client"

import { useState } from "react"
import { TaskCard } from "./task-card"
import { cn } from "@/lib/utils"
import { TASK_STATUS_CONFIG } from "@/lib/constants/board"
import type { Task, TaskStatus } from "@/types"

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

interface TaskColumnProps {
  id: TaskStatus
  title: string
  color: string
  tasks: TaskWithRelations[]
  isDragging: boolean
  onTaskClick: (task: TaskWithRelations) => void
  onDragStart: (e: React.DragEvent, task: TaskWithRelations) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent, status: TaskStatus) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onDeleteTask: (taskId: string) => void
}

export function TaskColumn({
  id,
  title,
  color,
  tasks,
  isDragging,
  onTaskClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onStatusChange,
  onDeleteTask,
}: TaskColumnProps) {
  const [isOver, setIsOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setIsOver(true)
  }

  const handleDragLeave = () => {
    setIsOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    setIsOver(false)
    onDrop(e, id)
  }

  return (
    <div
      className={cn(
        "flex flex-col min-w-[260px] max-w-[300px] w-[80vw] sm:w-auto sm:min-w-[280px] shrink-0",
        "rounded-[8px] bg-gray-50 dark:bg-[#0F1117]",
        "transition-colors duration-150",
        isOver && isDragging && "bg-[#4E62D8]/5 dark:bg-[#7B8CEA]/5",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="px-3 py-3 flex items-center gap-2">
        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />
        <h3 className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
          {title}
        </h3>
        <span className={cn(
          "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded ml-auto shrink-0",
          "text-[11px] font-mono font-semibold tabular-nums",
          "bg-gray-200 text-gray-500 dark:bg-[#242836] dark:text-[#5C6378]",
        )}>
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[120px]">
        {tasks.length === 0 ? (
          <p className={cn(
            "text-xs text-center py-8",
            isOver && isDragging
              ? "text-[#4E62D8] dark:text-[#7B8CEA]"
              : "text-gray-400 dark:text-[#5C6378]",
          )}>
            {isDragging ? "Solte aqui" : "Nenhuma tarefa"}
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              onDragStart={(e) => onDragStart(e, task)}
              onDragEnd={onDragEnd}
              onStatusChange={onStatusChange}
              onDelete={onDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  )
}
