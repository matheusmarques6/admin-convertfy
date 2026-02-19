"use client"

import { useState, useMemo } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, WEEK_DAYS } from "@/lib/constants/board"
import type { Task, TaskStatus, TaskPriority, Meeting, MeetingStatus } from "@/types"

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

interface CalendarEvent {
  id: string
  title: string
  date: Date
  type: "task" | "meeting"
  status: TaskStatus | MeetingStatus
  priority?: TaskPriority
  assignee?: string
  client?: string
  original: TaskWithRelations | MeetingWithRelations
}

interface BoardCalendarViewProps {
  tasks: TaskWithRelations[]
  meetings: MeetingWithRelations[]
  onTaskClick: (task: TaskWithRelations) => void
  onMeetingClick?: (meeting: MeetingWithRelations) => void
}

const priorityColors: Record<TaskPriority, string> = Object.fromEntries(
  Object.entries(TASK_PRIORITY_CONFIG).map(([k, v]) => [k, v.calendarColor])
) as Record<TaskPriority, string>

export function BoardCalendarView({
  tasks,
  meetings,
  onTaskClick,
  onMeetingClick,
}: BoardCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Convert tasks and meetings to calendar events
  const events = useMemo(() => {
    const taskEvents: CalendarEvent[] = tasks
      .filter((task) => task.due_date)
      .map((task) => ({
        id: task.id,
        title: task.title,
        date: parseISO(task.due_date!),
        type: "task" as const,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee?.profile?.name,
        client: task.client?.name,
        original: task,
      }))

    const meetingEvents: CalendarEvent[] = meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      date: parseISO(meeting.scheduled_at),
      type: "meeting" as const,
      status: meeting.status,
      assignee: meeting.user?.name,
      client: meeting.client?.name,
      original: meeting,
    }))

    return [...taskEvents, ...meetingEvents].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    )
  }, [tasks, meetings])

  // Get events for a specific day
  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(event.date, day))
  }

  // Get events for selected date
  const selectedDateEvents = selectedDate ? getEventsForDay(selectedDate) : []

  // Calendar days
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { locale: ptBR })
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const weekDays = WEEK_DAYS

  return (
    <div className="flex gap-6 h-full">
      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentMonth(new Date())
                setSelectedDate(new Date())
              }}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1 flex-1">
          {days.map((day) => {
            const dayEvents = getEventsForDay(day)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const hasEvents = dayEvents.length > 0

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "min-h-[80px] p-1 rounded-lg border text-left transition-colors",
                  "hover:bg-accent/50",
                  !isCurrentMonth && "opacity-40",
                  isSelected && "border-primary bg-accent",
                  isToday(day) && !isSelected && "border-primary/50",
                  !isSelected && !isToday(day) && "border-transparent"
                )}
              >
                <div className="flex flex-col h-full">
                  <span
                    className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday(day) && "bg-primary text-primary-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {hasEvents && (
                    <div className="mt-1 space-y-0.5 flex-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            "text-xs truncate px-1 py-0.5 rounded",
                            event.type === "task"
                              ? priorityColors[event.priority || "medium"]
                              : "bg-primary/10 text-primary"
                          )}
                          title={event.title}
                        >
                          {event.type === "meeting" && (
                            <Video className="h-3 w-3 inline mr-0.5" />
                          )}
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground px-1">
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>
                  )}
                  {!hasEvents && isCurrentMonth && (
                    <div className="flex-1" />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <div className="w-3 h-3 rounded bg-info/10 border border-info/20" />
            Tarefa
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <div className="w-3 h-3 rounded bg-primary/10 border border-primary/20" />
            Reunião
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <div className="w-3 h-3 rounded bg-destructive/10 border border-destructive/20" />
            Urgente
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <div className="w-3 h-3 rounded bg-warning/10 border border-warning/20" />
            Alta prioridade
          </div>
        </div>
      </div>

      {/* Day Details Sidebar */}
      <Card className="w-80 flex-shrink-0">
        <CardContent className="p-4 h-full flex flex-col">
          <h3 className="font-semibold mb-4">
            {selectedDate
              ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })
              : "Selecione um dia"}
          </h3>

          {selectedDate && selectedDateEvents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Nenhum evento neste dia
            </div>
          ) : (
            <ScrollArea className="flex-1 -mx-2">
              <div className="px-2 space-y-3">
                {selectedDateEvents.map((event) => {
                  const statusConf = TASK_STATUS_CONFIG[event.status as TaskStatus]
                  const StatusIcon = statusConf?.icon || TASK_STATUS_CONFIG.pending.icon

                  return (
                    <button
                      key={event.id}
                      onClick={() => {
                        if (event.type === "task") {
                          onTaskClick(event.original as TaskWithRelations)
                        } else if (onMeetingClick) {
                          onMeetingClick(event.original as MeetingWithRelations)
                        }
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        "hover:bg-accent/50",
                        event.type === "task"
                          ? priorityColors[event.priority || "medium"]
                          : "bg-primary/5 border-primary/20"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {event.type === "meeting" ? (
                          <Video className="h-4 w-4 mt-0.5 text-primary" />
                        ) : (
                          <StatusIcon className="h-4 w-4 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {event.title}
                          </p>
                          {event.client && (
                            <p className="text-xs text-muted-foreground truncate">
                              {event.client}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-xs">
                              {event.type === "task" ? "Tarefa" : "Reunião"}
                            </Badge>
                            {event.type === "meeting" && (
                              <span className="text-xs text-muted-foreground">
                                {format(event.date, "HH:mm")}
                              </span>
                            )}
                            {event.priority && (
                              <Badge variant="outline" className="text-xs">
                                {TASK_PRIORITY_CONFIG[event.priority].label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          )}

          {/* Today's summary */}
          {!selectedDate && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-1">Hoje</p>
                <p className="text-2xl font-bold">
                  {getEventsForDay(new Date()).length}
                </p>
                <p className="text-xs text-muted-foreground">eventos</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-1">Esta semana</p>
                <p className="text-2xl font-bold">
                  {events.filter(
                    (e) =>
                      e.date >= startOfWeek(new Date(), { locale: ptBR }) &&
                      e.date <= endOfWeek(new Date(), { locale: ptBR })
                  ).length}
                </p>
                <p className="text-xs text-muted-foreground">eventos</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
