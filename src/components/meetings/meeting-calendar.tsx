"use client"

import { useState, useMemo } from "react"
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { MEETING_STATUS_CONFIG, WEEK_DAYS } from "@/lib/constants/board"
import { CalendarWeekView } from "./calendar-week-view"
import { CalendarDayView } from "./calendar-day-view"
import type { Meeting, MeetingStatus, MeetingParticipant, CalendarViewMode } from "@/types"

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: { id: string; name: string; company?: string }
  user?: { id: string; name: string; email?: string; avatar_url?: string }
  participants?: MeetingParticipant[]
}

interface MeetingCalendarProps {
  meetings: MeetingWithRelations[]
  onMeetingClick?: (meeting: MeetingWithRelations) => void
  onSlotClick?: (date: Date) => void
  onStatusChange?: (meetingId: string, status: MeetingStatus) => void
  defaultView?: CalendarViewMode
}

export function MeetingCalendar({
  meetings,
  onMeetingClick,
  onSlotClick,
  onStatusChange,
  defaultView = "month",
}: MeetingCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>(defaultView)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Navigation
  const navigate = (direction: "prev" | "next") => {
    switch (viewMode) {
      case "month":
        setCurrentDate((d) => (direction === "prev" ? subMonths(d, 1) : addMonths(d, 1)))
        break
      case "week":
        setCurrentDate((d) => (direction === "prev" ? subWeeks(d, 1) : addWeeks(d, 1)))
        break
      case "day":
        setCurrentDate((d) => (direction === "prev" ? subDays(d, 1) : addDays(d, 1)))
        break
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  // Title
  const title = useMemo(() => {
    switch (viewMode) {
      case "month":
        return format(currentDate, "MMMM yyyy", { locale: ptBR })
      case "week": {
        const ws = startOfWeek(currentDate, { locale: ptBR })
        const we = endOfWeek(currentDate, { locale: ptBR })
        return `${format(ws, "d MMM", { locale: ptBR })} - ${format(we, "d MMM yyyy", { locale: ptBR })}`
      }
      case "day":
        return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: ptBR })
    }
  }, [viewMode, currentDate])

  // Month view helpers
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart, { locale: ptBR })
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR })
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentDate])

  const getMeetingsForDay = (day: Date) =>
    meetings.filter((m) => isSameDay(parseISO(m.scheduled_at), day))

  const selectedDateMeetings = selectedDate ? getMeetingsForDay(selectedDate) : []

  const statusColors: Record<MeetingStatus, string> = {
    scheduled: "bg-primary/10 text-primary",
    completed: "bg-success/10 text-success",
    cancelled: "bg-muted text-muted-foreground",
    no_show: "bg-destructive/10 text-destructive",
  }

  const handleSlotClick = (date: Date) => {
    onSlotClick?.(date)
  }

  const handleDayClick = (day: Date) => {
    setSelectedDate(day)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold capitalize">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={goToToday}>
              Hoje
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as CalendarViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs h-7 px-3">Mês</TabsTrigger>
              <TabsTrigger value="week" className="text-xs h-7 px-3">Semana</TabsTrigger>
              <TabsTrigger value="day" className="text-xs h-7 px-3">Dia</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Views */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "month" && (
          <div className="flex gap-6 h-full">
            {/* Month Grid */}
            <div className="flex-1 flex flex-col">
              {/* Week days header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1 flex-1">
                {monthDays.map((day) => {
                  const dayMeetings = getMeetingsForDay(day)
                  const isCurrentMonth = isSameMonth(day, currentDate)
                  const isSelected = selectedDate && isSameDay(day, selectedDate)

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDayClick(day)}
                      onDoubleClick={() => {
                        setViewMode("day")
                        setCurrentDate(day)
                      }}
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
                        {dayMeetings.length > 0 && (
                          <div className="mt-1 space-y-0.5 flex-1">
                            {dayMeetings.slice(0, 3).map((meeting) => (
                              <div
                                key={meeting.id}
                                className={cn(
                                  "text-xs truncate px-1 py-0.5 rounded",
                                  statusColors[meeting.status]
                                )}
                                title={meeting.title}
                              >
                                <Video className="h-3 w-3 inline mr-0.5" />
                                {meeting.title}
                              </div>
                            ))}
                            {dayMeetings.length > 3 && (
                              <div className="text-xs text-muted-foreground px-1">
                                +{dayMeetings.length - 3} mais
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Day details sidebar */}
            <Card className="w-80 flex-shrink-0 hidden lg:block">
              <CardContent className="p-4 h-full flex flex-col">
                <h3 className="font-semibold mb-4">
                  {selectedDate
                    ? format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })
                    : "Selecione um dia"}
                </h3>

                {selectedDate && selectedDateMeetings.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm">
                    <Video className="h-8 w-8 mb-2 opacity-30" />
                    <p>Nenhuma reunião</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1"
                      onClick={() => handleSlotClick(selectedDate)}
                    >
                      Agendar aqui
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="flex-1 -mx-2">
                    <div className="px-2 space-y-3">
                      {selectedDateMeetings.map((meeting) => {
                        const config = MEETING_STATUS_CONFIG[meeting.status]
                        return (
                          <button
                            key={meeting.id}
                            onClick={() => onMeetingClick?.(meeting)}
                            className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors bg-primary/5 border-primary/20 dark:bg-primary/10 dark:border-primary/20"
                          >
                            <div className="flex items-start gap-2">
                              <Video className="h-4 w-4 mt-0.5 text-primary dark:text-primary" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{meeting.title}</p>
                                {meeting.client && (
                                  <p className="text-xs text-muted-foreground truncate">{meeting.client.name}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-xs text-muted-foreground">
                                    {format(parseISO(meeting.scheduled_at), "HH:mm")}
                                  </span>
                                  <Badge variant={config.variant} className="text-[10px]">
                                    {config.label}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}

                {/* Summary when no date selected */}
                {!selectedDate && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-sm font-medium mb-1">Hoje</p>
                      <p className="text-2xl font-bold">{getMeetingsForDay(new Date()).length}</p>
                      <p className="text-xs text-muted-foreground">reuniões</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-sm font-medium mb-1">Este mês</p>
                      <p className="text-2xl font-bold">{meetings.length}</p>
                      <p className="text-xs text-muted-foreground">reuniões</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {viewMode === "week" && (
          <CalendarWeekView
            meetings={meetings}
            currentDate={currentDate}
            onMeetingClick={onMeetingClick}
            onSlotClick={handleSlotClick}
          />
        )}

        {viewMode === "day" && (
          <CalendarDayView
            meetings={meetings}
            currentDate={currentDate}
            onMeetingClick={onMeetingClick}
            onSlotClick={handleSlotClick}
            onStatusChange={onStatusChange}
          />
        )}
      </div>
    </div>
  )
}
