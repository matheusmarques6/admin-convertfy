"use client"

import Link from "next/link"
import { Calendar, Clock, CircleDot, ArrowRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

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
    <div className="rounded-[6px] border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon icon={Calendar} size={16} className="text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">Esta Semana</CardTitle>
          </div>
          <Badge variant="neutral" className="text-xs font-medium">
            {todayEvents.total} {todayEvents.total === 1 ? "evento" : "eventos"} hoje
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day, i) => {
            const dayIdx = day.getDay()
            const events = getEventsForDay(day)
            const isToday = isSameDay(day, now)

            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center py-2.5 rounded-[6px] transition-all duration-200",
                  isToday ? "bg-primary/10 ring-1 ring-primary/30 shadow-sm" : "hover:bg-muted/50"
                )}
              >
                <span className="text-[10px] text-muted-foreground font-medium">
                  {DAY_LABELS[dayIdx]}
                </span>
                <span className={cn(
                  "text-sm font-bold mt-0.5",
                  isToday ? "text-primary" : "text-foreground"
                )}>
                  {day.getDate()}
                </span>
                <div className="flex gap-0.5 mt-1.5 h-2">
                  {events.meetings.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {events.tasks.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-warning" />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Today's events */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hoje</p>

          {todayMeetingsSorted.length === 0 && todayEvents.tasks.length === 0 && (
            <div className="text-xs text-muted-foreground py-3 text-center rounded-lg bg-muted/20">
              Nenhum evento hoje
            </div>
          )}

          {todayMeetingsSorted.slice(0, 3).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <Icon icon={Clock} customSize={14} className="text-primary" />
              <span className="text-muted-foreground tabular-nums font-medium">
                {new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate text-foreground">{m.title}</span>
            </div>
          ))}

          {todayEvents.tasks.length > 0 && (
            <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-warning/5">
              <Icon icon={CircleDot} customSize={14} className="text-warning" />
              <span className="text-foreground">
                {todayEvents.tasks.length} {todayEvents.tasks.length === 1 ? "tarefa vence" : "tarefas vencem"} hoje
              </span>
            </div>
          )}
        </div>

        {/* Link */}
        <div className="mt-auto pt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs text-primary group" asChild>
            <Link href="/admin/meetings?view=calendar">
              Ver Calendario
              <Icon icon={ArrowRight} customSize={14} className="ml-1 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </div>
  )
}
