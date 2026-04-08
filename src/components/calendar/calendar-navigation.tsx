"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { MONTH_NAMES } from "@/lib/constants/calendar"

// ============================================
// TYPES
// ============================================

export interface CalendarNavigationProps {
  month: number
  year: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

// ============================================
// COMPONENT
// ============================================

export function CalendarNavigation({
  month,
  year,
  onPrev,
  onNext,
  onToday,
}: CalendarNavigationProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={onPrev}
          className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <Icon icon={ChevronLeft} size={16} />
        </Button>
        <div className="w-44 text-center">
          <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            {MONTH_NAMES[month]} {year}
          </h2>
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={onNext}
          className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <Icon icon={ChevronRight} size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToday}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Hoje
        </Button>
      </div>
    </div>
  )
}
