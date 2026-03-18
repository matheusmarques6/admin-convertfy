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
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground text-primary transition-colors">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Agenda</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{todayEvents.total} {todayEvents.total === 1 ? "evento" : "eventos"} hoje</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 flex-1 px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col relative z-10">
        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekDays.map((day, i) => {
            const dayIdx = day.getDay()
            const events = getEventsForDay(day)
            const isToday = isSameDay(day, now)

            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center py-3 rounded-[12px] transition-all duration-300 relative overflow-hidden group/day",
                  isToday ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10" : "bg-background border border-border/40 hover:border-border hover:bg-muted/30 text-foreground"
                )}
              >
                {isToday && <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/day:opacity-100 transition-opacity" />}
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", isToday ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {DAY_LABELS[dayIdx]}
                </span>
                <span className="text-lg font-black mt-1">
                  {day.getDate()}
                </span>
                <div className="flex gap-1 mt-2 h-1.5">
                  {events.meetings.length > 0 && <div className={cn("w-1.5 h-1.5 rounded-full", isToday ? "bg-white" : "bg-primary")} />}
                  {events.tasks.length > 0 && <div className={cn("w-1.5 h-1.5 rounded-full", isToday ? "bg-white/70" : "bg-warning")} />}
                </div>
              </div>
            )
          })}
        </div>

        {/* Today's events */}
        <div className="flex-1 space-y-3 bg-background border border-border/40 rounded-[16px] p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Compromissos de Hoje</p>

          {todayMeetingsSorted.length === 0 && todayEvents.tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 opacity-50">
              <CircleDot className="h-6 w-6 mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Agenda livre hoje</p>
            </div>
          )}

          <div className="space-y-3">
            {todayMeetingsSorted.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-start gap-3 text-sm">
                <div className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-bold tracking-tight">
                  {new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <span className="flex-1 font-medium leading-snug pt-0.5">{m.title}</span>
              </div>
            ))}

            {todayEvents.tasks.length > 0 && (
              <div className="flex items-center gap-3 text-sm p-3 rounded-xl bg-warning/10 border border-warning/20">
                <CircleDot className="h-4 w-4 text-warning shrink-0" />
                <span className="font-semibold text-warning">
                  {todayEvents.tasks.length} {todayEvents.tasks.length === 1 ? "tarefa vence" : "tarefas vencem"} hoje
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Link */}
        <Button variant="outline" size="sm" className="w-full text-xs rounded-xl border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all font-medium mt-auto" asChild>
          <Link href="/meetings?view=calendar">Ver Calendário Completo</Link>
        </Button>
      </CardContent>
    </div>
  )
}
