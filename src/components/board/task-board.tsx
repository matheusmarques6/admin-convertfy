"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { TaskColumn } from "./task-column"
import { TaskDialog } from "./task-dialog"
import { toast } from "@/lib/hooks/use-toast"
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

interface TaskBoardProps {
  tasks: TaskWithRelations[]
  members: MemberWithProfile[]
  clients: Client[]
  stores: StoreWithClient[]
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: "pending", title: "Pendente", color: "bg-slate-500" },
  { id: "in_progress", title: "Em Andamento", color: "bg-blue-500" },
  { id: "blocked", title: "Bloqueado", color: "bg-red-500" },
  { id: "review", title: "Em Revisão", color: "bg-amber-500" },
]

export function TaskBoard({ tasks: initialTasks, members, clients, stores }: TaskBoardProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskWithRelations[]>(initialTasks)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Listen for add task button click
  useEffect(() => {
    const addButton = document.getElementById("add-task-trigger")
    if (addButton) {
      const handleClick = () => {
        setEditingTask(null)
        setDialogOpen(true)
      }
      addButton.addEventListener("click", handleClick)
      return () => addButton.removeEventListener("click", handleClick)
    }
  }, [])

  // Group tasks by status
  const tasksByStatus = columns.reduce((acc, column) => {
    acc[column.id] = tasks
      .filter((task) => task.status === column.id)
      .sort((a, b) => a.position - b.position)
    return acc
  }, {} as Record<TaskStatus, TaskWithRelations[]>)

  const handleTaskClick = useCallback((task: TaskWithRelations) => {
    setEditingTask(task)
    setDialogOpen(true)
  }, [])

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false)
    setEditingTask(null)
  }, [])

  const handleDialogSuccess = useCallback(() => {
    handleDialogClose()
    router.refresh()
  }, [handleDialogClose, router])

  const handleDragStart = useCallback((e: React.DragEvent, task: TaskWithRelations) => {
    setIsDragging(true)
    e.dataTransfer.setData("taskId", task.id)
    e.dataTransfer.setData("sourceStatus", task.status)
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault()
    setIsDragging(false)

    const taskId = e.dataTransfer.getData("taskId")
    const sourceStatus = e.dataTransfer.getData("sourceStatus") as TaskStatus

    if (sourceStatus === targetStatus) return

    // Optimistic update
    setTasks((prev) => {
      const taskIndex = prev.findIndex((t) => t.id === taskId)
      if (taskIndex === -1) return prev

      const updatedTasks = [...prev]
      const task = { ...updatedTasks[taskIndex], status: targetStatus }

      // Get new position (at the end of target column)
      const targetTasks = prev.filter((t) => t.status === targetStatus)
      task.position = targetTasks.length > 0
        ? Math.max(...targetTasks.map((t) => t.position)) + 1
        : 0

      updatedTasks[taskIndex] = task
      return updatedTasks
    })

    // Update on server
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      })

      if (!response.ok) {
        throw new Error("Failed to update")
      }

      toast({
        title: "Tarefa movida",
        description: `Status alterado para ${columns.find((c) => c.id === targetStatus)?.title}`,
      })
    } catch {
      // Revert on error
      router.refresh()
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível mover a tarefa",
      })
    }
  }, [router])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    )

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) throw new Error("Failed")

      toast({
        title: "Status atualizado",
      })
    } catch {
      router.refresh()
      toast({
        variant: "destructive",
        title: "Erro ao atualizar",
      })
    }
  }, [router])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    // Optimistic update
    setTasks((prev) => prev.filter((t) => t.id !== taskId))

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed")

      toast({
        title: "Tarefa excluída",
      })
    } catch {
      router.refresh()
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
      })
    }
  }, [router])

  return (
    <>
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {columns.map((column) => (
          <TaskColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            tasks={tasksByStatus[column.id] || []}
            isDragging={isDragging}
            onTaskClick={handleTaskClick}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onStatusChange={handleStatusChange}
            onDeleteTask={handleDeleteTask}
          />
        ))}
      </div>

      <TaskDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        task={editingTask}
        members={members}
        clients={clients}
        stores={stores}
      />
    </>
  )
}
