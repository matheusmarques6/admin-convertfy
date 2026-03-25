"use client"

import { useState, useEffect } from "react"
import { CalendarDays } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  startDate?: Date
  endDate?: Date
  onApply: (start: Date, end: Date) => void
  /** Trigger element — if not provided, renders a default button */
  trigger?: React.ReactNode
  /** Show picker immediately (controlled externally) */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: "start" | "center" | "end"
}

export function DateRangePicker({
  startDate,
  endDate,
  onApply,
  trigger,
  open,
  onOpenChange,
  align = "end",
}: DateRangePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(
    startDate && endDate ? { from: startDate, to: endDate } : undefined
  )

  // Sync internal state when parent props change
  useEffect(() => {
    if (startDate && endDate) {
      setRange({ from: startDate, to: endDate })
    }
  }, [startDate, endDate])

  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen

  const isSameDay = range?.from && range?.to && range.from.getTime() === range.to.getTime()

  const handleApply = () => {
    if (range?.from && range?.to && !isSameDay) {
      onApply(range.from, range.to)
      setIsOpen(false)
    }
  }

  const formatLabel = () => {
    if (range?.from && range?.to) {
      return `${format(range.from, "dd/MM/yy", { locale: ptBR })} — ${format(range.to, "dd/MM/yy", { locale: ptBR })}`
    }
    return "Selecionar período"
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="secondary" size="sm" className="gap-2 text-xs">
            <Icon icon={CalendarDays} size={16} />
            {formatLabel()}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align} sideOffset={8}>
        <div className="p-3 space-y-3">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={2}
            locale={ptBR}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-between border-t pt-3 px-1">
            <p className="text-xs text-muted-foreground">
              {range?.from && range?.to
                ? isSameDay
                  ? "Selecione dias diferentes"
                  : `${format(range.from, "dd MMM", { locale: ptBR })} → ${format(range.to, "dd MMM", { locale: ptBR })}`
                : "Selecione início e fim"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setRange(undefined)
                }}
              >
                Limpar
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!range?.from || !range?.to || !!isSameDay}
                onClick={handleApply}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
