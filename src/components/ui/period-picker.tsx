"use client"

import { useState } from "react"
import { CalendarDays, ChevronDown } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface PeriodOption {
  value: string
  label: string
}

export interface PeriodValue {
  period: string
  customStart?: Date
  customEnd?: Date
}

interface PeriodPickerProps {
  value: PeriodValue
  onChange: (value: PeriodValue) => void
  options?: PeriodOption[]
  className?: string
}

const DEFAULT_OPTIONS: PeriodOption[] = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
]

export function PeriodPicker({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  className,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(
    value.customStart && value.customEnd
      ? { from: value.customStart, to: value.customEnd }
      : undefined
  )

  const activeLabel = (() => {
    if (value.period === "custom" && value.customStart && value.customEnd) {
      return `${format(value.customStart, "dd/MM", { locale: ptBR })} — ${format(value.customEnd, "dd/MM", { locale: ptBR })}`
    }
    const opt = options.find((o) => o.value === value.period)
    return opt?.label ?? value.period
  })()

  const handlePreset = (preset: string) => {
    onChange({ period: preset })
    setShowCalendar(false)
    setRange(undefined)
    setOpen(false)
  }

  const isSameDay = range?.from && range?.to && range.from.getTime() === range.to.getTime()

  const handleApplyCustom = () => {
    if (range?.from && range?.to && !isSameDay) {
      onChange({ period: "custom", customStart: range.from, customEnd: range.to })
      setShowCalendar(false)
      setOpen(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setShowCalendar(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-lg text-sm font-medium",
            className
          )}
        >
          <Icon icon={CalendarDays} size={16} />
          {activeLabel}
          <Icon icon={ChevronDown} customSize={12} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="end"
        sideOffset={8}
      >
        <div className="flex">
          {/* Sidebar — presets */}
          <div className="flex flex-col border-r p-1.5 min-w-[120px]">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePreset(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  value.period === opt.value && value.period !== "custom"
                    ? "bg-accent font-medium"
                    : "text-muted-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className="my-1 border-t" />
            <button
              onClick={() => setShowCalendar(true)}
              className={cn(
                "rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                (showCalendar || value.period === "custom")
                  ? "bg-accent font-medium"
                  : "text-muted-foreground"
              )}
            >
              Personalizado
            </button>
          </div>

          {/* Main area — calendar (only when "Personalizado" is active) */}
          {showCalendar && (
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
                    onClick={() => setRange(undefined)}
                  >
                    Limpar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!range?.from || !range?.to || !!isSameDay}
                    onClick={handleApplyCustom}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
