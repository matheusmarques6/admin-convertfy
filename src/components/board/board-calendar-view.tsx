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
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaQuery } from "@/hooks/use-media-query"
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

// DS v3.0 explicit priority colors for calendar events
const priorityCalendarColors: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
}

export function BoardCalendarView({
  tasks,
  meetings,
  onTaskClick,
  onMeetingClick,
}: BoardCalendarViewProps) {
  const isMobile = useMediaQuery("(max-width: 767px)")
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

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(event.date, day))
  }

  const selectedDateEvents = selectedDate ? getEventsForDay(selectedDate) : []

  // Calendar days
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { locale: ptBR })
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR })
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "task") {
      onTaskClick(event.original as TaskWithRelations)
    } else if (onMeetingClick) {
      onMeetingClick(event.original as MeetingWithRelations)
    }
  }

  // Mobile: agenda view grouped by day
  if (isMobile) {
    // Get all days in current month that have events
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const daysWithEvents = daysInMonth.filter((day) => getEventsForDay(day).length > 0)

    return (
      <div className="mt-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836] transition-colors"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </h3>
            <span className="text-xs text-gray-500 dark:text-[#8B92A5]">
              {events.filter((e) => isSameMonth(e.date, currentMonth)).length} eventos
            </span>
          </div>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-[6px] min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836] transition-colors"
          >
            <ChevronRight size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Today button */}
        <div className="flex justify-center mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
          >
            Hoje
          </Button>
        </div>

        {/* Agenda list by day */}
        <div className="space-y-4 px-1">
          {daysWithEvents.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
              Nenhum evento este mês
            </p>
          ) : (
            daysWithEvents.map((day) => {
              const dayEvents = getEventsForDay(day)
              return (
                <div key={day.toISOString()}>
                  {/* Day header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isToday(day)
                          ? "text-[#4E62D8] dark:text-[#7B8CEA]"
                          : "text-gray-900 dark:text-[#EAEDF3]"
                      )}
                    >
                      {format(day, "EEEE, d", { locale: ptBR })}
                    </span>
                    {isToday(day) && (
                      <Badge variant="info" className="text-[10px]">Hoje</Badge>
                    )}
                  </div>

                  {/* Day events */}
                  <div className="space-y-2">
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className={cn(
                          "w-full text-left rounded-[8px] border p-3",
                          "border-[rgba(0,0,0,0.08)] bg-white",
                          "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
                          "active:bg-gray-50 dark:active:bg-[#242836]",
                          "transition-colors duration-150"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {event.type === "meeting" && (
                            <Icon icon={Video} size={16} className="mt-0.5 text-[#4E62D8] dark:text-[#7B8CEA]" />
                          )}
                          {event.type === "task" && event.priority && (
                            <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", TASK_PRIORITY_CONFIG[event.priority].color)} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                              {event.title}
                            </p>
                            {event.client && (
                              <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate mt-0.5">
                                {event.client}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge variant="neutral" showDot={false} className="text-[10px]">
                                {event.type === "task" ? "Tarefa" : "Reunião"}
                              </Badge>
                              {event.type === "meeting" && (
                                <span className="text-xs font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                                  {format(event.date, "HH:mm")}
                                </span>
                              )}
                              {event.priority && (
                                <Badge variant="neutral" showDot={false} className="text-[10px]">
                                  {TASK_PRIORITY_CONFIG[event.priority].label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Desktop: monthly calendar grid + sidebar
  return (
    <div className="flex gap-6 h-full">
      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#EAEDF3] capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <Icon icon={ChevronLeft} size={16} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCurrentMonth(new Date())
                setSelectedDate(new Date())
              }}
            >
              Hoje
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <Icon icon={ChevronRight} size={16} />
            </Button>
          </div>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEK_DAYS.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-gray-500 dark:text-[#8B92A5] py-2"
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
                  "min-h-[80px] p-1 rounded-[8px] border text-left transition-colors",
                  "hover:bg-gray-50 dark:hover:bg-[#242836]",
                  !isCurrentMonth && "opacity-40",
                  isSelected
                    ? "border-[#4E62D8] dark:border-[#7B8CEA] bg-[#4E62D8]/5 dark:bg-[#7B8CEA]/5"
                    : isToday(day)
                      ? "border-[#4E62D8]/30 dark:border-[#7B8CEA]/30"
                      : "border-transparent"
                )}
              >
                <div className="flex flex-col h-full">
                  <span
                    className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full font-mono tabular-nums",
                      isToday(day) && "bg-[#4E62D8] dark:bg-[#7B8CEA] text-white"
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
                              ? priorityCalendarColors[event.priority || "medium"]
                              : "bg-[#4E62D8]/10 text-[#4E62D8] dark:bg-[#7B8CEA]/15 dark:text-[#7B8CEA]"
                          )}
                          title={event.title}
                        >
                          {event.type === "meeting" && (
                            <Icon icon={Video} customSize={12} className="inline mr-0.5" />
                          )}
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-gray-400 dark:text-[#5C6378] px-1 font-mono tabular-nums">
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
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8B92A5]">
            <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800" />
            Tarefa
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8B92A5]">
            <div className="w-3 h-3 rounded bg-[#4E62D8]/10 dark:bg-[#7B8CEA]/15 border border-[#4E62D8]/20 dark:border-[#7B8CEA]/20" />
            Reunião
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8B92A5]">
            <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800" />
            Urgente
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8B92A5]">
            <div className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800" />
            Alta prioridade
          </div>
        </div>
      </div>

      {/* Day Details Sidebar */}
      <div className="w-80 flex-shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27]">
        <div className="p-4 h-full flex flex-col">
          <h3 className="font-semibold text-gray-900 dark:text-[#EAEDF3] mb-4">
            {selectedDate
              ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })
              : "Selecione um dia"}
          </h3>

          {selectedDate && selectedDateEvents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-[#5C6378] text-sm">
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
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        "w-full text-left p-3 rounded-[8px] border transition-colors",
                        "hover:bg-gray-50 dark:hover:bg-[#242836]",
                        event.type === "task"
                          ? priorityCalendarColors[event.priority || "medium"]
                          : "bg-[#4E62D8]/5 dark:bg-[#7B8CEA]/5 border-[#4E62D8]/20 dark:border-[#7B8CEA]/20"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {event.type === "meeting" ? (
                          <Icon icon={Video} size={16} className="mt-0.5 text-[#4E62D8] dark:text-[#7B8CEA]" />
                        ) : (
                          <Icon icon={StatusIcon} size={16} className="mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {event.title}
                          </p>
                          {event.client && (
                            <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
                              {event.client}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="neutral" showDot={false} className="text-xs">
                              {event.type === "task" ? "Tarefa" : "Reunião"}
                            </Badge>
                            {event.type === "meeting" && (
                              <span className="text-xs font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                                {format(event.date, "HH:mm")}
                              </span>
                            )}
                            {event.priority && (
                              <Badge variant="neutral" showDot={false} className="text-xs">
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
              <div className="p-3 rounded-[8px] bg-gray-50 dark:bg-[#0F1117]">
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] mb-1">Hoje</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                  {getEventsForDay(new Date()).length}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#5C6378]">eventos</p>
              </div>
              <div className="p-3 rounded-[8px] bg-gray-50 dark:bg-[#0F1117]">
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] mb-1">Esta semana</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                  {events.filter(
                    (e) =>
                      e.date >= startOfWeek(new Date(), { locale: ptBR }) &&
                      e.date <= endOfWeek(new Date(), { locale: ptBR })
                  ).length}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#5C6378]">eventos</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
