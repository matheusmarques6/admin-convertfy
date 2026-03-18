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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Agenda</h2>
            <p className="text-sm text-muted-foreground">{todayEvents.total} {todayEvents.total === 1 ? "evento" : "eventos"} hoje</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-6">
        {weekDays.map((day, i) => {
          const dayIdx = day.getDay()
          const events = getEventsForDay(day)
          const isToday = isSameDay(day, now)

          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center py-2 rounded-xl transition-all duration-300 relative",
                isToday ? "bg-primary text-primary-foreground shadow-md" : "bg-background border border-border hover:bg-muted"
              )}
            >
              <span className={cn("text-[10px] font-medium uppercase tracking-wider mb-1", isToday ? "text-primary-foreground/90" : "text-muted-foreground")}>
                {DAY_LABELS[dayIdx]}
              </span>
              <span className={cn("text-base font-bold", isToday ? "text-primary-foreground" : "text-foreground")}>
                {day.getDate()}
              </span>
              <div className="flex gap-1 mt-1.5 h-1">
                {events.meetings.length > 0 && <div className={cn("w-1 h-1 rounded-full", isToday ? "bg-white" : "bg-primary")} />}
                {events.tasks.length > 0 && <div className={cn("w-1 h-1 rounded-full", isToday ? "bg-white/70" : "bg-warning")} />}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex-1 space-y-4 rounded-xl bg-background border border-border p-4 mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compromissos de Hoje</h3>

        {todayMeetingsSorted.length === 0 && todayEvents.tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CircleDot className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Agenda livre hoje</p>
          </div>
        )}

        <div className="space-y-3">
          {todayMeetingsSorted.slice(0, 3).map((m) => (
            <div key={m.id} className="flex items-start gap-3 text-sm">
              <div className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-medium">
                {new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <span className="flex-1 font-medium text-foreground">{m.title}</span>
            </div>
          ))}

          {todayEvents.tasks.length > 0 && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-warning/5 text-warning font-medium border border-warning/10">
              <CircleDot className="h-4 w-4" />
              <span>
                {todayEvents.tasks.length} {todayEvents.tasks.length === 1 ? "tarefa vence" : "tarefas vencem"} hoje
              </span>
            </div>
          )}
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full mt-auto" asChild>
        <Link href="/meetings?view=calendar">Ver Calendário Completo</Link>
      </Button>
    </div>
  )
}
