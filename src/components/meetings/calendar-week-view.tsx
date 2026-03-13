"use client"

import { useMemo } from "react"
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameDay,
  isToday,
  parseISO,
  set,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { Video, ExternalLink, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Meeting, MeetingStatus } from "@/types"

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: { id: string; name: string; company?: string }
  user?: { id: string; name: string; email?: string; avatar_url?: string }
}

interface CalendarWeekViewProps {
  meetings: MeetingWithRelations[]
  currentDate: Date
  onMeetingClick?: (meeting: MeetingWithRelations) => void
  onSlotClick?: (date: Date) => void
}

const HOUR_START = 7
const HOUR_END = 20
const SLOT_HEIGHT = 64 // px per hour

export function CalendarWeekView({
  meetings,
  currentDate,
  onMeetingClick,
  onSlotClick,
}: CalendarWeekViewProps) {
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { locale: ptBR })
    const weekEnd = endOfWeek(currentDate, { locale: ptBR })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }, [currentDate])

  const hours = useMemo(() => {
    return eachHourOfInterval({
      start: set(currentDate, { hours: HOUR_START, minutes: 0, seconds: 0 }),
      end: set(currentDate, { hours: HOUR_END, minutes: 0, seconds: 0 }),
    })
  }, [currentDate])

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingWithRelations[]>()
    days.forEach((day) => {
      const dayKey = format(day, "yyyy-MM-dd")
      const dayMeetings = meetings.filter((m) =>
        isSameDay(parseISO(m.scheduled_at), day)
      )
      map.set(dayKey, dayMeetings)
    })
    return map
  }, [meetings, days])

  function getMeetingPosition(meeting: MeetingWithRelations) {
    const date = parseISO(meeting.scheduled_at)
    const hour = date.getHours()
    const minutes = date.getMinutes()
    const top = (hour - HOUR_START + minutes / 60) * SLOT_HEIGHT
    const height = Math.max((meeting.duration_minutes / 60) * SLOT_HEIGHT, 24)
    return { top, height }
  }

  const statusColors: Record<MeetingStatus, string> = {
    scheduled: "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary",
    completed: "bg-success/10 border-success/30 text-success dark:bg-success/20 dark:border-success/30 dark:text-success",
    cancelled: "bg-muted border-border text-muted-foreground dark:bg-muted dark:border-border dark:text-muted-foreground",
    no_show: "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/20 dark:border-destructive/30 dark:text-destructive",
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b sticky top-0 bg-background z-10">
        <div className="w-16 flex-shrink-0" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "flex-1 text-center py-2 border-l",
              isToday(day) && "bg-primary/5"
            )}
          >
            <p className="text-xs text-muted-foreground">
              {format(day, "EEE", { locale: ptBR })}
            </p>
            <p
              className={cn(
                "text-sm font-semibold w-8 h-8 flex items-center justify-center mx-auto rounded-full",
                isToday(day) && "bg-primary text-primary-foreground"
              )}
            >
              {format(day, "d")}
            </p>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative" style={{ minHeight: (HOUR_END - HOUR_START + 1) * SLOT_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-16 flex-shrink-0">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="border-b text-xs text-muted-foreground pr-2 text-right"
                style={{ height: SLOT_HEIGHT }}
              >
                <span className="relative -top-2">{format(hour, "HH:mm")}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd")
            const dayMeetings = meetingsByDay.get(dayKey) || []

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex-1 border-l relative",
                  isToday(day) && "bg-primary/5"
                )}
              >
                {/* Hour slots (clickable) */}
                {hours.map((hour) => (
                  <div
                    key={hour.toISOString()}
                    className="border-b border-dashed hover:bg-accent/30 cursor-pointer transition-colors"
                    style={{ height: SLOT_HEIGHT }}
                    onClick={() => {
                      if (onSlotClick) {
                        const clickDate = set(day, {
                          hours: hour.getHours(),
                          minutes: 0,
                        })
                        onSlotClick(clickDate)
                      }
                    }}
                  />
                ))}

                {/* Meeting blocks */}
                {dayMeetings.map((meeting) => {
                  const { top, height } = getMeetingPosition(meeting)
                  const colorClass = statusColors[meeting.status]

                  if (top < 0 || top > (HOUR_END - HOUR_START + 1) * SLOT_HEIGHT) return null

                  return (
                    <button
                      key={meeting.id}
                      className={cn(
                        "absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 overflow-hidden text-left transition-opacity hover:opacity-90 z-10",
                        colorClass
                      )}
                      style={{ top, height: Math.max(height, 24) }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMeetingClick?.(meeting)
                      }}
                      title={`${meeting.title}${meeting.client ? ` - ${meeting.client.name}` : ""}`}
                    >
                      <div className="flex items-center gap-1">
                        <Video className="h-3 w-3 flex-shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {format(parseISO(meeting.scheduled_at), "HH:mm")}
                        </span>
                      </div>
                      {height >= 40 && (
                        <p className="text-xs truncate mt-0.5 font-medium">
                          {meeting.title}
                        </p>
                      )}
                      {height >= 56 && meeting.client && (
                        <p className="text-[10px] truncate opacity-70">
                          {meeting.client.name}
                        </p>
                      )}
                      {height >= 72 && meeting.meeting_url && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          <span className="text-[10px]">Link</span>
                          {meeting.google_sync_status === "synced" && (
                            <CheckCircle className="h-2.5 w-2.5 text-green-500" />
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
