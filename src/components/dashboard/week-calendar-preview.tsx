"use client"

import Link from "next/link"
import { Calendar, Clock, CircleDot } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WeekMeeting {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number | null
  meeting_url: string | null
}

interface WeekTask {
  id: string
  title: string
  due_date: string
  status: string
  priority: string
  type: string
}

interface WeekCalendarPreviewProps {
  meetings: WeekMeeting[]
  tasks: WeekTask[]
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function getWeekDays(now: Date) {
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function WeekCalendarPreview({ meetings, tasks }: WeekCalendarPreviewProps) {
  const now = new Date()
  const weekDays = getWeekDays(now)

  function getEventsForDay(day: Date) {
    const dayMeetings = meetings.filter((m) => isSameDay(new Date(m.scheduled_at), day))
    const dayTasks = tasks.filter((t) => isSameDay(new Date(t.due_date), day))
    return { meetings: dayMeetings, tasks: dayTasks, total: dayMeetings.length + dayTasks.length }
  }

  const todayEvents = getEventsForDay(now)

  const todayMeetingsSorted = [...todayEvents.meetings].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )

  return (
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Esta Semana</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {todayEvents.total} {todayEvents.total === 1 ? "evento" : "eventos"} hoje
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const dayIdx = day.getDay()
            const events = getEventsForDay(day)
            const isToday = isSameDay(day, now)

            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center py-2 rounded-lg transition-colors",
                  isToday ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                )}
              >
                <span className="text-[10px] text-muted-foreground font-medium">
                  {DAY_LABELS[dayIdx]}
                </span>
                <span className={cn(
                  "text-sm font-semibold mt-0.5",
                  isToday ? "text-primary" : "text-foreground"
                )}>
                  {day.getDate()}
                </span>
                <div className="flex gap-0.5 mt-1 h-2">
                  {events.meetings.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {events.tasks.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-warning" />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Today's events */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hoje</p>

          {todayMeetingsSorted.length === 0 && todayEvents.tasks.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Nenhum evento hoje</p>
          )}

          {todayMeetingsSorted.slice(0, 3).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <Clock className="h-3 w-3 text-primary shrink-0" />
              <span className="text-muted-foreground tabular-nums">
                {new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate text-foreground">{m.title}</span>
            </div>
          ))}

          {todayEvents.tasks.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <CircleDot className="h-3 w-3 text-warning shrink-0" />
              <span className="text-foreground">
                {todayEvents.tasks.length} {todayEvents.tasks.length === 1 ? "tarefa vence" : "tarefas vencem"} hoje
              </span>
            </div>
          )}
        </div>

        {/* Link */}
        <Button variant="ghost" size="sm" className="w-full text-xs text-primary" asChild>
          <Link href="/meetings?view=calendar">Ver Calendário</Link>
        </Button>
      </CardContent>
    </div>
  )
}
