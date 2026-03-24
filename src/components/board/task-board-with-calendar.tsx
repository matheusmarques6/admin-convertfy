"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LayoutGrid, List, Calendar, Video, Plus } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { TaskBoard } from "./task-board"
import { BoardMobileKanban } from "./board-mobile-kanban"
import { BoardListView } from "./board-list-view"
import { BoardCalendarView } from "./board-calendar-view"
import { MeetingsTab } from "./meetings-tab"
import { TaskDialog } from "./task-dialog"
import { useRealtimeBoard } from "@/hooks/use-realtime-board"
import { useMediaQuery } from "@/hooks/use-media-query"
import { toast } from "@/lib/hooks/use-toast"
import { TASK_STATUS_CONFIG } from "@/lib/constants/board"
import type { Task, TaskStatus, Meeting } from "@/types"

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
  stores?: string[]
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
  orgMemberId: string
}

type ViewMode = "kanban" | "list" | "meetings" | "calendar"

export function TaskBoardWithCalendar({
  tasks,
  members,
  clients,
  stores,
  meetings,
  orgMemberId,
}: TaskBoardWithCalendarProps) {
  const router = useRouter()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null)
  const [localTasks, setLocalTasks] = useState<TaskWithRelations[]>(tasks)
  const [localMeetings, setLocalMeetings] = useState<MeetingWithRelations[]>(meetings)

  // Sync server props → local state
  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  useEffect(() => {
    setLocalMeetings(meetings)
  }, [meetings])

  // Realtime subscription
  useRealtimeBoard({
    onDataUpdate: useCallback(() => {
      router.refresh()
    }, [router]),
    orgMemberId,
    enabled: !!orgMemberId,
  })

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
          return prev.map((t) => (t.id === newTask.id ? { ...t, ...newTask } : t))
        }
        return [newTask, ...prev]
      })
    }

    router.refresh()
  }, [handleDialogClose, editingTask, router])

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    // Optimistic update
    setLocalTasks((prev) =>
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
        description: `Movido para ${TASK_STATUS_CONFIG[newStatus].label}`,
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
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId))

    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed")
      toast({ title: "Tarefa excluída" })
    } catch {
      router.refresh()
      toast({ variant: "destructive", title: "Erro ao excluir" })
    }
  }, [router])

  return (
    <>
      {/* Toolbar: View switcher + New Task */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <SegmentedTabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SegmentedTabItem value="kanban">
            <Icon icon={LayoutGrid} size={16} className="mr-1.5 hidden sm:inline" />
            Tarefas
          </SegmentedTabItem>
          <SegmentedTabItem value="list">
            <Icon icon={List} size={16} className="mr-1.5 hidden sm:inline" />
            Lista
          </SegmentedTabItem>
          <SegmentedTabItem value="meetings">
            <Icon icon={Video} size={16} className="mr-1.5 hidden sm:inline" />
            Reuniões
          </SegmentedTabItem>
          <SegmentedTabItem value="calendar">
            <Icon icon={Calendar} size={16} className="mr-1.5 hidden sm:inline" />
            Calendário
          </SegmentedTabItem>
        </SegmentedTabs>

        {(viewMode === "kanban" || viewMode === "list") && (
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova Tarefa
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "kanban" && (
          isMobile ? (
            <BoardMobileKanban
              tasks={localTasks}
              onTaskClick={handleTaskClick}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <TaskBoard
              tasks={localTasks}
              members={members}
              clients={clients}
              stores={stores}
              externalDialogOpen={dialogOpen}
              externalEditingTask={editingTask}
              onExternalDialogClose={handleDialogClose}
            />
          )
        )}

        {viewMode === "list" && (
          <BoardListView
            tasks={localTasks}
            onTaskClick={handleTaskClick}
            onStatusChange={handleStatusChange}
            onDeleteTask={handleDeleteTask}
          />
        )}

        {viewMode === "meetings" && (
          <MeetingsTab
            meetings={localMeetings}
            onMeetingChange={setLocalMeetings}
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
            meetings={localMeetings}
            onTaskClick={handleTaskClick}
          />
        )}
      </div>

      {/* Dialog for task creation/editing */}
      {viewMode !== "kanban" && (
        <TaskDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
          task={editingTask ?? undefined}
          members={members}
          clients={clients}
          stores={stores}
        />
      )}
    </>
  )
}
