"use client"

import Link from "next/link"
import { Calendar, Clock, CircleDot, ArrowRight } from "lucide-react"
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
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] h-full transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20">
              <Calendar className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            </div>
            <CardTitle className="text-sm font-semibold">Esta Semana</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted/50 dark:bg-white/[0.05]">
            {todayEvents.total} hoje
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1 p-2 rounded-lg bg-muted/20 dark:bg-white/[0.02]">
          {weekDays.map((day, i) => {
            const dayIdx = day.getDay()
            const events = getEventsForDay(day)
            const isToday = isSameDay(day, now)

            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center py-2.5 rounded-lg transition-all",
                  isToday
                    ? "bg-gradient-to-br from-[#4e62d8] to-[#2137b6] shadow-md"
                    : "hover:bg-muted/50 dark:hover:bg-white/[0.05]"
                )}
              >
                <span className={cn(
                  "text-[10px] font-medium",
                  isToday ? "text-white/70" : "text-muted-foreground"
                )}>
                  {DAY_LABELS[dayIdx]}
                </span>
                <span className={cn(
                  "text-sm font-bold mt-0.5",
                  isToday ? "text-white" : "text-foreground"
                )}>
                  {day.getDate()}
                </span>
                <div className="flex gap-0.5 mt-1.5 h-2">
                  {events.meetings.length > 0 && (
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isToday ? "bg-white" : "bg-blue-500"
                    )} />
                  )}
                  {events.tasks.length > 0 && (
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isToday ? "bg-white/60" : "bg-amber-500"
                    )} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Today's events */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hoje</p>

          {todayMeetingsSorted.length === 0 && todayEvents.tasks.length === 0 && (
            <div className="py-4 text-center">
              <div className="p-2.5 rounded-full bg-muted/50 dark:bg-white/[0.05] w-fit mx-auto mb-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Nenhum evento hoje</p>
            </div>
          )}

          {todayMeetingsSorted.slice(0, 3).map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 dark:bg-white/[0.03] hover:bg-muted/40 dark:hover:bg-white/[0.06] transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
                <Clock className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums font-medium">
                {new Date(m.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="truncate text-sm text-foreground flex-1">{m.title}</span>
            </div>
          ))}

          {todayEvents.tasks.length > 0 && (
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-500/5 dark:bg-amber-500/10">
              <div className="p-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/20">
                <CircleDot className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              </div>
              <span className="text-sm text-foreground">
                {todayEvents.tasks.length} {todayEvents.tasks.length === 1 ? "tarefa vence" : "tarefas vencem"} hoje
              </span>
            </div>
          )}
        </div>

        {/* Link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-primary group"
          asChild
        >
          <Link href="/meetings?view=calendar" className="flex items-center justify-center gap-1.5">
            Ver Calendario completo
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardContent>
    </div>
  )
}
