"use client"

import type { ReactNode } from "react"
import { WEEK_DAYS } from "@/lib/constants/calendar"
import { formatDateKey } from "@/lib/utils/date"

// ============================================
// TYPES
// ============================================

export interface CalendarGridProps {
  year: number
  month: number
  renderDay: (date: Date, dateKey: string) => ReactNode
}

// ============================================
// COMPONENT
// ============================================

export function CalendarGrid({ year, month, renderDay }: CalendarGridProps) {
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const cells: ReactNode[] = []

  // Empty cells before month start
  for (let i = 0; i < startingDayOfWeek; i++) {
    cells.push(
      <div
        key={`empty-start-${i}`}
        role="gridcell"
        className="min-h-[120px] bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/30"
      />
    )
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const dateKey = formatDateKey(date)
    cells.push(
      <div key={`day-${day}`} role="gridcell">
        {renderDay(date, dateKey)}
      </div>
    )
  }

  // Trailing empty cells to complete last row
  const totalCells = cells.length
  const remainder = totalCells % 7
  if (remainder !== 0) {
    const trailingCount = 7 - remainder
    for (let i = 0; i < trailingCount; i++) {
      cells.push(
        <div
          key={`empty-end-${i}`}
          role="gridcell"
          className="min-h-[120px] bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/30"
        />
      )
    }
  }

  // Group cells into rows of 7 for ARIA grid structure
  const rows: ReactNode[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7))
  }

  return (
    <div
      role="grid"
      aria-label="Calendário de campanhas"
      className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 overflow-hidden"
    >
      {/* Week days header */}
      <div role="row" className="grid grid-cols-7 bg-slate-50 dark:bg-[#1A1F2E]">
        {WEEK_DAYS.map((day, index) => (
          <div
            key={day}
            role="columnheader"
            className={`
              py-3 text-center text-sm font-medium text-slate-500 dark:text-slate-400
              border-r border-slate-100 dark:border-slate-700/30 last:border-r-0
              ${index === 0 || index === 6 ? "text-slate-400 dark:text-slate-500" : ""}
            `}
          >
            {day}
          </div>
        ))}
      </div>
      {/* Calendar grid rows */}
      {rows.map((row, rowIdx) => (
        <div key={`row-${rowIdx}`} role="row" className="grid grid-cols-7">
          {row}
        </div>
      ))}
    </div>
  )
}
