"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import type { Meeting } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface TaskItem {
  id: string
  title: string
  status: string
  due_date: string | null
}

interface DashboardQuickSectionsProps {
  meetings: Meeting[]
  tasks: TaskItem[]
  loading?: boolean
}

// ─── Skeleton ─────────────────────────────────────────────

function QuickSectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-4 bg-gray-100 dark:bg-[#242836] rounded" />
          <div className="flex-1 h-4 bg-gray-100 dark:bg-[#242836] rounded" />
          <div className="w-16 h-4 bg-gray-100 dark:bg-[#242836] rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Upcoming Meetings ────────────────────────────────────

function UpcomingMeetings({ meetings, loading }: { meetings: Meeting[]; loading?: boolean }) {
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  }

  const formatRelativeDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const meetDay = new Date(d)
    meetDay.setHours(0, 0, 0, 0)
    const diff = Math.floor((meetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return "Hoje"
    if (diff === 1) return "Amanhã"
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Próximas reuniões
          </CardTitle>
          <Link
            href="/admin/meetings"
            className="text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
          >
            Ver tudo →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <QuickSectionSkeleton rows={3} />
        ) : meetings.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-[#5C6378] py-4 text-center">
            Nenhuma reunião agendada
          </p>
        ) : (
          meetings.slice(0, 3).map((meeting) => (
            <div
              key={meeting.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-[6px]",
                "hover:bg-gray-50 dark:hover:bg-[#242836]",
                "transition-colors duration-150",
              )}
            >
              {/* Time */}
              <div className="shrink-0 text-center w-14">
                <span className="text-sm font-mono tabular-nums font-semibold text-gray-900 dark:text-[#EAEDF3]">
                  {formatTime(meeting.scheduled_at)}
                </span>
              </div>

              {/* Divider */}
              <div className="w-px h-8 bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.08)]" />

              {/* Details */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700 dark:text-[#EAEDF3] truncate">
                  {meeting.title}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#5C6378]">
                  {formatRelativeDate(meeting.scheduled_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ─── Pending Tasks ────────────────────────────────────────

function PendingTasks({ tasks, loading }: { tasks: TaskItem[]; loading?: boolean }) {
  const now = new Date()

  const sortedTasks = tasks
    .filter((t) => t.status !== "completed" && t.status !== "cancelled")
    .sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
    .slice(0, 5)

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Tarefas pendentes
          </CardTitle>
          <Link
            href="/admin/board"
            className="text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
          >
            Ver tudo →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <QuickSectionSkeleton rows={5} />
        ) : sortedTasks.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-[#5C6378] py-4 text-center">
            Nenhuma tarefa pendente
          </p>
        ) : (
          sortedTasks.map((task) => {
            const isOverdue = task.due_date ? new Date(task.due_date) < now : false

            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-[6px]",
                  "hover:bg-gray-50 dark:hover:bg-[#242836]",
                  "transition-colors duration-150 group",
                )}
              >
                {/* Checkbox visual */}
                <div
                  className={cn(
                    "w-4 h-4 rounded border shrink-0",
                    "border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.15)]",
                    "group-hover:border-[#4E62D8] dark:group-hover:border-[#7B8CEA]",
                    "transition-colors duration-150",
                  )}
                />

                {/* Task title */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 dark:text-[#EAEDF3] truncate">
                    {task.title}
                  </p>
                </div>

                {/* Due date */}
                {task.due_date && (
                  <span
                    className={cn(
                      "text-[11px] font-mono tabular-nums shrink-0",
                      isOverdue
                        ? "text-[#991B1B] dark:text-[#FCA5A5]"
                        : "text-gray-400 dark:text-[#5C6378]",
                    )}
                  >
                    {formatDueDate(task.due_date)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// ─── DashboardQuickSections (exported) ────────────────────

export function DashboardQuickSections({
  meetings,
  tasks,
  loading = false,
}: DashboardQuickSectionsProps) {
  return (
    <div className={cn("mt-6", "grid gap-4", "grid-cols-1 md:grid-cols-2")}>
      <UpcomingMeetings meetings={meetings} loading={loading} />
      <PendingTasks tasks={tasks} loading={loading} />
    </div>
  )
}
