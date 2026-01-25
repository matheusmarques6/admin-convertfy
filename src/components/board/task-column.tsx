"use client"

import { useState } from "react"
import { TaskCard } from "./task-card"
import { cn } from "@/lib/utils"
import type { Task, OrgMember, Client, ClientStore, User, TaskStatus } from "@/types"

interface MemberWithProfile extends OrgMember {
  profile?: User
}

interface StoreWithClient extends ClientStore {
  client?: { id: string; name: string }
}

interface TaskWithRelations extends Task {
  assignee?: MemberWithProfile
  creator?: User
  client?: Client
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
        "flex flex-col min-w-[300px] max-w-[300px] bg-muted/30 rounded-lg transition-colors",
        isOver && isDragging && "bg-muted/60 ring-2 ring-primary/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className={cn("w-3 h-3 rounded-full", color)} />
        <h3 className="font-medium text-sm">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 ? (
          <div
            className={cn(
              "flex items-center justify-center h-24 border-2 border-dashed rounded-lg text-muted-foreground text-sm",
              isOver && isDragging && "border-primary bg-primary/5"
            )}
          >
            {isDragging ? "Solte aqui" : "Nenhuma tarefa"}
          </div>
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
