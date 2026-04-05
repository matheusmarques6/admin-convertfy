"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useProductivityStore } from "@/stores/productivity-store"
import { PRIORITY_COLORS } from "@/types/productivity"
import {
  Card, CardHeader, DSBadge,
  IconCalendar, IconChevronLeft, IconChevronRight,
} from "./ds-atoms"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const MONTHS = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

export function ProductivityCalendar() {
  const { tasks, calendarEvents, isLoaded, fetchData } = useProductivityStore()
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    if (!isLoaded) fetchData()
  }, [isLoaded, fetchData])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    while (days.length % 7 !== 0) days.push(null)

    return days
  }, [year, month])

  const today = new Date()
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  // Map tasks to days
  const tasksByDay = useMemo(() => {
    const map = new Map<number, typeof tasks>()
    for (const t of tasks) {
      if (t.date) {
        const match = t.date.match(/(\d+)/)
        if (match) {
          const d = parseInt(match[1])
          if (!map.has(d)) map.set(d, [])
          map.get(d)!.push(t)
        }
      }
    }
    return map
  }, [tasks])

  // Map calendar events to days
  const eventsByDay = useMemo(() => {
    const map = new Map<number, typeof calendarEvents>()
    for (const ev of calendarEvents) {
      // Events have time field like "09:00" — try to extract day from original data
      const d = today.getDate() // Calendar events are for today by default
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(ev)
    }
    return map
  }, [calendarEvents, today])

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <header className="bg-white border-b border-[rgba(0,0,0,0.08)]">
        <div className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-gray-900 m-0 tracking-[-0.02em]">Calendario</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-md border border-[rgba(0,0,0,0.08)] bg-white cursor-pointer text-gray-500 hover:bg-gray-50 transition-colors">
              <IconChevronLeft size={16} />
            </button>
            <span className="text-[14px] font-semibold text-gray-800 min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-md border border-[rgba(0,0,0,0.08)] bg-white cursor-pointer text-gray-500 hover:bg-gray-50 transition-colors">
              <IconChevronRight size={16} />
            </button>
            <button onClick={goToday} className="ml-2 text-[12px] font-semibold text-brand-400 py-[5px] px-3 bg-brand-50 rounded-md cursor-pointer border-none hover:bg-brand-100 transition-colors">
              Hoje
            </button>
          </div>
        </div>
      </header>

      {/* Calendar grid */}
      <div className="p-6">
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-[rgba(0,0,0,0.08)]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayTasks = day ? tasksByDay.get(day) || [] : []
              const dayEvents = day ? eventsByDay.get(day) || [] : []

              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[96px] p-1.5 border-b border-r border-[rgba(0,0,0,0.04)]",
                    day && isToday(day) && "bg-brand-50/50"
                  )}
                >
                  {day && (
                    <>
                      <div className="flex justify-end mb-1">
                        <span className={cn(
                          "text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full",
                          isToday(day) ? "bg-brand-400 text-white font-semibold" : "text-gray-500"
                        )}>
                          {day}
                        </span>
                      </div>

                      {/* Google Cal events */}
                      {dayEvents.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-1 px-1.5 py-0.5 mb-0.5 bg-[#EEF0FB] rounded-[4px] border-l-2 border-brand-400">
                          <span className="text-[9px] font-semibold text-gray-500 font-mono">{ev.time}</span>
                          <span className="text-[10px] text-brand-400 truncate">{ev.name}</span>
                        </div>
                      ))}

                      {/* Tasks */}
                      {dayTasks.slice(0, 3).map((t) => (
                        <div key={t.id} className="flex items-center gap-1 px-1.5 py-0.5 mb-0.5 bg-white rounded-[4px] border border-gray-100">
                          <span className="w-[5px] h-[5px] rounded-[2px] shrink-0" style={{ background: PRIORITY_COLORS[t.priority] }} />
                          <span className={cn("text-[10px] truncate", t.status === "done" ? "text-gray-400 line-through" : "text-gray-700")}>
                            {t.name}
                          </span>
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="text-[9px] text-gray-400 px-1.5">+{dayTasks.length - 3} mais</span>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
