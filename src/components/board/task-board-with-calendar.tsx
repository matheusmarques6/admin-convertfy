"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, LayoutGrid, Calendar, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskBoard } from "./task-board"
import { BoardCalendarView } from "./board-calendar-view"
import { MeetingsTab } from "./meetings-tab"
import { TaskDialog } from "./task-dialog"
import type { Task, Meeting } from "@/types"

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

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: ClientInfo
  user?: UserProfile
}

interface TaskBoardWithCalendarProps {
  tasks: TaskWithRelations[]
  members: MemberWithProfile[]
  clients: ClientInfo[]
  stores: StoreWithClient[]
  meetings: MeetingWithRelations[]
}

type ViewMode = "kanban" | "meetings" | "calendar"

export function TaskBoardWithCalendar({
  tasks,
  members,
  clients,
  stores,
  meetings,
}: TaskBoardWithCalendarProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null)
  const [localTasks, setLocalTasks] = useState<TaskWithRelations[]>(tasks)

  // Sync server props → local state (for router.refresh() or initial load changes)
  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const handleTaskClick = useCallback((task: TaskWithRelations) => {
    setEditingTask(task)
    setDialogOpen(true)
  }, [])

  const handleNewTask = useCallback(() => {
    setEditingTask(null)
    setDialogOpen(true)
  }, [])

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false)
    setEditingTask(null)
  }, [])

  const handleDialogSuccess = useCallback((newTask?: TaskWithRelations) => {
    const wasEditing = !!editingTask
    handleDialogClose()

    if (newTask) {
      setLocalTasks((prev) => {
        if (wasEditing) {
          // Update existing task in state
          return prev.map((t) => (t.id === newTask.id ? { ...t, ...newTask } : t))
        }
        // Add new task to state
        return [newTask, ...prev]
      })
    }

    // Also refresh server data in the background
    router.refresh()
  }, [handleDialogClose, editingTask, router])

  // Count upcoming items
  const today = new Date()
  const upcomingTasks = localTasks.filter(t => t.due_date && new Date(t.due_date) >= today).length
  const upcomingMeetings = meetings.filter(m => m.status === "scheduled" && new Date(m.scheduled_at) >= today).length

  const getSubtitle = () => {
    switch (viewMode) {
      case "kanban":
        return "Gerencie suas tarefas no estilo Kanban"
      case "meetings":
        return `${upcomingMeetings} reuniões agendadas`
      case "calendar":
        return `${upcomingTasks} tarefas e ${upcomingMeetings} reuniões agendadas`
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Board</h1>
          <p className="text-muted-foreground">{getSubtitle()}</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="kanban" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Tarefas
              </TabsTrigger>
              <TabsTrigger value="meetings" className="gap-2">
                <Video className="h-4 w-4" />
                Reuniões
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <Calendar className="h-4 w-4" />
                Calendário
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "kanban" && (
            <Button onClick={handleNewTask}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "kanban" && (
          <TaskBoard
            tasks={localTasks}
            members={members}
            clients={clients}
            stores={stores}
            externalDialogOpen={dialogOpen}
            externalEditingTask={editingTask}
            onExternalDialogClose={handleDialogClose}
          />
        )}
        {viewMode === "meetings" && (
          <MeetingsTab
            meetings={meetings}
            clients={clients}
            members={members.map(m => ({
              id: m.id,
              name: m.profile?.name || "Membro",
              email: m.profile?.email,
              avatar_url: m.profile?.avatar_url,
              type: "org_member" as const,
              role: m.role,
            }))}
          />
        )}
        {viewMode === "calendar" && (
          <BoardCalendarView
            tasks={localTasks}
            meetings={meetings}
            onTaskClick={handleTaskClick}
          />
        )}
      </div>

      {/* Dialog for task creation/editing */}
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
