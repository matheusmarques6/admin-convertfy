"use client"

import { useMemo } from "react"
import {
  format,
  isSameDay,
  parseISO,
  set,
  eachHourOfInterval,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { Video, ExternalLink, CheckCircle, XCircle, AlertCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { Meeting, MeetingStatus, MeetingParticipant } from "@/types"
import { MEETING_STATUS_CONFIG } from "@/lib/constants/board"

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: { id: string; name: string; company?: string }
  user?: { id: string; name: string; email?: string; avatar_url?: string }
  participants?: MeetingParticipant[]
}

interface CalendarDayViewProps {
  meetings: MeetingWithRelations[]
  currentDate: Date
  onMeetingClick?: (meeting: MeetingWithRelations) => void
  onSlotClick?: (date: Date) => void
  onStatusChange?: (meetingId: string, status: MeetingStatus) => void
}

const HOUR_START = 7
const HOUR_END = 20
const SLOT_HEIGHT = 80 // px per hour — taller for day view

export function CalendarDayView({
  meetings,
  currentDate,
  onMeetingClick,
  onSlotClick,
  onStatusChange,
}: CalendarDayViewProps) {
  const hours = eachHourOfInterval({
    start: set(currentDate, { hours: HOUR_START, minutes: 0, seconds: 0 }),
    end: set(currentDate, { hours: HOUR_END, minutes: 0, seconds: 0 }),
  })

  const dayMeetings = useMemo(
    () =>
      meetings
        .filter((m) => isSameDay(parseISO(m.scheduled_at), currentDate))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [meetings, currentDate]
  )

  function getMeetingPosition(meeting: MeetingWithRelations) {
    const date = parseISO(meeting.scheduled_at)
    const hour = date.getHours()
    const minutes = date.getMinutes()
    const top = (hour - HOUR_START + minutes / 60) * SLOT_HEIGHT
    const height = Math.max((meeting.duration_minutes / 60) * SLOT_HEIGHT, 48)
    return { top, height }
  }

  const statusColors: Record<MeetingStatus, string> = {
    scheduled: "bg-purple-50 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700",
    completed: "bg-emerald-50 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700",
    cancelled: "bg-gray-50 border-gray-300 dark:bg-gray-800/30 dark:border-gray-600",
    no_show: "bg-red-50 border-red-300 dark:bg-red-900/30 dark:border-red-700",
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Time grid — main area */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative" style={{ minHeight: (HOUR_END - HOUR_START + 1) * SLOT_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-20 flex-shrink-0">
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="border-b text-sm text-muted-foreground pr-3 text-right"
                style={{ height: SLOT_HEIGHT }}
              >
                <span className="relative -top-2.5">{format(hour, "HH:mm")}</span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="flex-1 relative border-l">
            {/* Hour slots */}
            {hours.map((hour) => (
              <div
                key={hour.toISOString()}
                className="border-b border-dashed hover:bg-accent/30 cursor-pointer transition-colors"
                style={{ height: SLOT_HEIGHT }}
                onClick={() => {
                  if (onSlotClick) {
                    onSlotClick(
                      set(currentDate, { hours: hour.getHours(), minutes: 0 })
                    )
                  }
                }}
              />
            ))}

            {/* Meeting blocks */}
            {dayMeetings.map((meeting) => {
              const { top, height } = getMeetingPosition(meeting)
              const config = MEETING_STATUS_CONFIG[meeting.status]
              const colorClass = statusColors[meeting.status]

              if (top < 0 || top > (HOUR_END - HOUR_START + 1) * SLOT_HEIGHT) return null

              return (
                <div
                  key={meeting.id}
                  className={cn(
                    "absolute left-1 right-1 rounded-lg border-2 p-3 overflow-hidden cursor-pointer transition-shadow hover:shadow-md z-10",
                    colorClass
                  )}
                  style={{ top, height: Math.max(height, 48) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onMeetingClick?.(meeting)
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 flex-shrink-0 text-primary dark:text-primary" />
                        <span className="font-semibold text-sm truncate">
                          {meeting.title}
                        </span>
                        <Badge variant={config.variant} className="text-[10px] shrink-0">
                          {config.label}
                        </Badge>
                      </div>
                      {height >= 60 && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{format(parseISO(meeting.scheduled_at), "HH:mm")} - {
                            format(
                              new Date(new Date(meeting.scheduled_at).getTime() + meeting.duration_minutes * 60000),
                              "HH:mm"
                            )
                          }</span>
                          <span>{meeting.duration_minutes}min</span>
                          {meeting.client && (
                            <>
                              <span>•</span>
                              <span className="truncate">{meeting.client.name}</span>
                            </>
                          )}
                        </div>
                      )}
                      {/* Participants */}
                      {height >= 90 && meeting.participants && meeting.participants.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <div className="flex -space-x-1.5">
                            {meeting.participants.slice(0, 5).map((p) => {
                              const name = p.profile?.name || p.org_member?.profile?.name || "?"
                              const avatar = p.profile?.avatar_url || p.org_member?.profile?.avatar_url
                              return (
                                <Avatar key={p.id} className="h-5 w-5 border-2 border-background">
                                  <AvatarImage src={avatar} />
                                  <AvatarFallback className="text-[8px]">
                                    {name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              )
                            })}
                            {meeting.participants.length > 5 && (
                              <span className="text-[10px] text-muted-foreground ml-1">
                                +{meeting.participants.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Inline actions */}
                    {height >= 60 && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {meeting.meeting_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1 h-3 w-3" />
                              Entrar
                            </a>
                          </Button>
                        )}
                        {meeting.status === "scheduled" && onStatusChange && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              onStatusChange(meeting.id, "completed")
                            }}
                            title="Marcar como realizada"
                          >
                            <CheckCircle className="h-4 w-4 text-success" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day summary sidebar */}
      <div className="w-72 flex-shrink-0 border-l p-4 overflow-y-auto hidden xl:block">
        <h3 className="font-semibold mb-3">
          {format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {dayMeetings.length === 0
            ? "Nenhuma reunião neste dia"
            : `${dayMeetings.length} reunião(ões)`}
        </p>

        <div className="space-y-3">
          {dayMeetings.map((meeting) => {
            const config = MEETING_STATUS_CONFIG[meeting.status]
            return (
              <div
                key={meeting.id}
                className="p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => onMeetingClick?.(meeting)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <config.icon className="h-3.5 w-3.5" />
                  <span className="text-sm font-medium truncate">{meeting.title}</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>{format(parseISO(meeting.scheduled_at), "HH:mm")} - {meeting.duration_minutes}min</p>
                  {meeting.client && <p>{meeting.client.name}</p>}
                </div>
                <Badge variant={config.variant} className="mt-1.5 text-[10px]">
                  {config.label}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
