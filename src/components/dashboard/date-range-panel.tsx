"use client"

import { useState, useMemo } from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
  isSameDay,
  format,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer"
import type { DateRange as DayPickerRange } from "react-day-picker"

export interface DateRange {
  from: Date
  to: Date
}

interface QuickPreset {
  label: string
  getValue: () => DateRange
}

function getQuickPresets(): QuickPreset[] {
  const now = new Date()
  return [
    { label: "Última semana", getValue: () => ({ from: subDays(now, 7), to: now }) },
    { label: "Últimos 30 dias", getValue: () => ({ from: subDays(now, 30), to: now }) },
    { label: "Este mês", getValue: () => ({ from: startOfMonth(now), to: now }) },
    { label: "Mês anterior", getValue: () => ({ from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) }) },
    { label: "Este trimestre", getValue: () => ({ from: startOfQuarter(now), to: now }) },
    { label: "Trimestre anterior", getValue: () => ({ from: startOfQuarter(subQuarters(now, 1)), to: endOfQuarter(subQuarters(now, 1)) }) },
    { label: "Este ano", getValue: () => ({ from: startOfYear(now), to: now }) },
    { label: "Ano anterior", getValue: () => ({ from: startOfYear(subYears(now, 1)), to: endOfYear(subYears(now, 1)) }) },
  ]
}

function isPresetActive(preset: QuickPreset, range: DateRange): boolean {
  const val = preset.getValue()
  return isSameDay(val.from, range.from) && isSameDay(val.to, range.to)
}

// ─────────────────────────────────────────────────────────────
// DateRangePanel — expandable desktop panel (Rule 15)
// ─────────────────────────────────────────────────────────────

interface DateRangePanelProps {
  isOpen: boolean
  range: DateRange
  onRangeChange: (range: DateRange) => void
  onApply: () => void
  onCancel: () => void
}

export function DateRangePanel({
  isOpen,
  range,
  onRangeChange,
  onApply,
  onCancel,
}: DateRangePanelProps) {
  const presets = useMemo(() => getQuickPresets(), [])

  const [localRange, setLocalRange] = useState<DateRange>(range)

  // Sync when panel opens with new range
  const handlePresetSelect = (preset: QuickPreset) => {
    const val = preset.getValue()
    setLocalRange(val)
    onRangeChange(val)
  }

  const handleCalendarSelect = (selected: DayPickerRange | undefined) => {
    if (selected?.from) {
      const newRange: DateRange = {
        from: selected.from,
        to: selected.to || selected.from,
      }
      setLocalRange(newRange)
      onRangeChange(newRange)
    }
  }

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value + "T00:00:00")
    if (!isNaN(date.getTime())) {
      const newRange = { from: date, to: localRange.to }
      setLocalRange(newRange)
      onRangeChange(newRange)
    }
  }

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value + "T00:00:00")
    if (!isNaN(date.getTime())) {
      const newRange = { from: localRange.from, to: date }
      setLocalRange(newRange)
      onRangeChange(newRange)
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
        isOpen ? "max-h-[500px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0",
      )}
    >
      <div
        className={cn(
          "rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-4",
          "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
        )}
      >
        {/* Desktop: 3 columns */}
        <div className="grid grid-cols-[180px_1fr_160px] gap-4">
          {/* Left: Quick presets */}
          <div className="border-r border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] pr-4">
            <div className="space-y-0.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm rounded-[6px]",
                    "transition-colors duration-150 cursor-pointer",
                    isPresetActive(preset, localRange)
                      ? "bg-[#EEF0FB] text-[#4E62D8] font-medium dark:bg-[rgba(123,140,234,0.12)] dark:text-[#7B8CEA]"
                      : "text-gray-600 dark:text-white/70 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] dark:hover:bg-[#242836]",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Dual calendar */}
          <div className="flex justify-center">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={{ from: localRange.from, to: localRange.to }}
              onSelect={handleCalendarSelect}
              locale={ptBR}
              disabled={{ after: new Date() }}
              classNames={{
                day_selected:
                  "bg-[#4E62D8] text-white hover:bg-[#4E62D8] focus:bg-[#4E62D8] dark:bg-[#7B8CEA] dark:hover:bg-[#7B8CEA] dark:focus:bg-[#7B8CEA]",
                day_range_middle:
                  "aria-selected:bg-[#EEF0FB] aria-selected:text-[#4E62D8] dark:aria-selected:bg-[rgba(123,140,234,0.12)] dark:aria-selected:text-[#7B8CEA]",
                day_today:
                  "font-semibold text-gray-900 dark:text-white dark:text-[#EAEDF3]",
              }}
            />
          </div>

          {/* Right: Inputs + actions */}
          <div className="border-l border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] pl-4 flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/60 dark:text-[#5C6378] mb-1 block">
                De
              </label>
              <Input
                type="date"
                value={format(localRange.from, "yyyy-MM-dd")}
                onChange={handleFromChange}
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/60 dark:text-[#5C6378] mb-1 block">
                Até
              </label>
              <Input
                type="date"
                value={format(localRange.to, "yyyy-MM-dd")}
                onChange={handleToChange}
                className="text-sm"
              />
            </div>

            <div className="flex flex-col gap-2 mt-auto">
              <Button variant="primary" size="md" onClick={onApply} className="w-full">
                Aplicar
              </Button>
              <Button variant="ghost" size="md" onClick={onCancel} className="w-full">
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MobileDateSheet — bottom sheet for custom range (Rule 23)
// ─────────────────────────────────────────────────────────────

interface MobileDateSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  range: DateRange
  onRangeChange: (range: DateRange) => void
  onApply: () => void
  onCancel: () => void
}

export function MobileDateSheet({
  isOpen,
  onOpenChange,
  range,
  onRangeChange,
  onApply,
  onCancel,
}: MobileDateSheetProps) {
  const presets = useMemo(() => getQuickPresets(), [])
  const [localRange, setLocalRange] = useState<DateRange>(range)

  const handlePresetSelect = (preset: QuickPreset) => {
    const val = preset.getValue()
    setLocalRange(val)
    onRangeChange(val)
  }

  const handleCalendarSelect = (selected: DayPickerRange | undefined) => {
    if (selected?.from) {
      const newRange: DateRange = {
        from: selected.from,
        to: selected.to || selected.from,
      }
      setLocalRange(newRange)
      onRangeChange(newRange)
    }
  }

  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Selecionar período</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Quick presets as vertical list */}
          <div className="space-y-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  "w-full px-3 py-3 text-left text-sm rounded-[6px]",
                  "min-h-[44px] transition-colors duration-150",
                  isPresetActive(preset, localRange)
                    ? "bg-[#EEF0FB] text-[#4E62D8] font-medium dark:bg-[rgba(123,140,234,0.12)] dark:text-[#7B8CEA]"
                    : "text-gray-600 dark:text-white/70 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-white/5 dark:bg-[#242836] dark:hover:bg-[#242836]",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]" />

          {/* Single month calendar (Rule 23) */}
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={{ from: localRange.from, to: localRange.to }}
            onSelect={handleCalendarSelect}
            locale={ptBR}
            disabled={{ after: new Date() }}
            classNames={{
              day_selected:
                "bg-[#4E62D8] text-white hover:bg-[#4E62D8] focus:bg-[#4E62D8] dark:bg-[#7B8CEA]",
              day_range_middle:
                "aria-selected:bg-[#EEF0FB] aria-selected:text-[#4E62D8] dark:aria-selected:bg-[rgba(123,140,234,0.12)] dark:aria-selected:text-[#7B8CEA]",
              day_today:
                "font-semibold text-gray-900 dark:text-white dark:text-[#EAEDF3]",
            }}
          />

          {/* Inputs De/Até */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/60 dark:text-[#5C6378] mb-1 block">
                De
              </label>
              <Input
                type="date"
                value={format(localRange.from, "yyyy-MM-dd")}
                onChange={(e) => {
                  const d = new Date(e.target.value + "T00:00:00")
                  if (!isNaN(d.getTime())) {
                    const nr = { from: d, to: localRange.to }
                    setLocalRange(nr)
                    onRangeChange(nr)
                  }
                }}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-white/60 dark:text-[#5C6378] mb-1 block">
                Até
              </label>
              <Input
                type="date"
                value={format(localRange.to, "yyyy-MM-dd")}
                onChange={(e) => {
                  const d = new Date(e.target.value + "T00:00:00")
                  if (!isNaN(d.getTime())) {
                    const nr = { from: localRange.from, to: d }
                    setLocalRange(nr)
                    onRangeChange(nr)
                  }
                }}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button variant="primary" size="lg" className="w-full" onClick={onApply}>
            Aplicar
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onCancel}>
            Cancelar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
