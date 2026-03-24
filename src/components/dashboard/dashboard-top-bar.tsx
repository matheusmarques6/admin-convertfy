"use client"

import { useState, useCallback, useEffect } from "react"
import { Download, CalendarRange } from "lucide-react"
import { subDays } from "date-fns"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { cn } from "@/lib/utils"
import {
  DateRangePanel,
  MobileDateSheet,
  type DateRange,
} from "./date-range-panel"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Period = "today" | "7d" | "30d" | "90d" | "custom"

export interface DashboardTopBarProps {
  userName: string
  period: Period
  onPeriodChange: (period: Period) => void
  customRange?: DateRange
  onCustomRangeChange?: (range: DateRange) => void
  compareEnabled: boolean
  onCompareToggle: (enabled: boolean) => void
  onExport?: () => void
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

function getDateRangeFromPeriod(period: Period): DateRange {
  const now = new Date()
  const to = new Date(now)
  let from: Date

  switch (period) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case "7d":
      from = subDays(now, 7)
      break
    case "30d":
      from = subDays(now, 30)
      break
    case "90d":
      from = subDays(now, 90)
      break
    default:
      from = subDays(now, 30)
  }

  return { from, to }
}

function formatDateRange(range: DateRange): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  })
  const yearFormatter = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
  })
  const from = formatter.format(range.from)
  const to = formatter.format(range.to)
  const year = yearFormatter.format(range.to)
  return `${from} \u2013 ${to}, ${year}`
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado...",
}

// ─────────────────────────────────────────────────────────────
// useMediaQuery hook (simple)
// ─────────────────────────────────────────────────────────────

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [query])

  return matches
}

// ─────────────────────────────────────────────────────────────
// DashboardTopBar
// ─────────────────────────────────────────────────────────────

export function DashboardTopBar({
  userName,
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  compareEnabled,
  onCompareToggle,
  onExport,
  className,
}: DashboardTopBarProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)
  const isMobile = useMediaQuery("(max-width: 767px)")

  // Effective range based on period
  const effectiveRange =
    period === "custom" && customRange
      ? customRange
      : getDateRangeFromPeriod(period)

  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      const p = newPeriod as Period
      onPeriodChange(p)
      if (p === "custom") {
        if (isMobile) {
          setIsMobileSheetOpen(true)
        } else {
          setIsPanelOpen(true)
        }
      } else {
        setIsPanelOpen(false)
        setIsMobileSheetOpen(false)
      }
    },
    [isMobile, onPeriodChange],
  )

  const handleCustomRangeChange = useCallback(
    (range: DateRange) => {
      onCustomRangeChange?.(range)
    },
    [onCustomRangeChange],
  )

  const handleApply = useCallback(() => {
    setIsPanelOpen(false)
    setIsMobileSheetOpen(false)
  }, [])

  const handleCancel = useCallback(() => {
    setIsPanelOpen(false)
    setIsMobileSheetOpen(false)
    if (period === "custom") {
      onPeriodChange("30d")
    }
  }, [period, onPeriodChange])

  return (
    <div className={cn("mb-6", className)}>
      {/* ──── Row 1: Title + Greeting + Actions ──── */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-gray-900 dark:text-[#EAEDF3]">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#8B92A5] mt-0.5">
            {getGreeting()}, {userName} 👋
          </p>
        </div>

        {/* Actions — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2">
          {onExport && (
            <Button variant="secondary" size="md" onClick={onExport}>
              <Icon icon={Download} size={16} />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* ──── Row 2: Period Controls ──── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
        {/* MOBILE: Select dropdown (Rule 23) */}
        <div className="block md:hidden w-full">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className={cn(
              "w-full h-11 rounded-[6px] px-3 text-sm font-medium",
              "bg-white border border-[rgba(0,0,0,0.08)] text-gray-700",
              "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)] dark:text-[#EAEDF3]",
              "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
              "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
              "appearance-none",
            )}
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {/* DESKTOP/TABLET: SegmentedTabs (Rule 15) */}
        <div className="hidden md:block">
          <SegmentedTabs
            value={period === "custom" ? "" : period}
            onValueChange={(v) => handlePeriodChange(v)}
          >
            <SegmentedTabItem value="today">Hoje</SegmentedTabItem>
            <SegmentedTabItem value="7d">7D</SegmentedTabItem>
            <SegmentedTabItem value="30d">30D</SegmentedTabItem>
            <SegmentedTabItem value="90d">90D</SegmentedTabItem>
          </SegmentedTabs>
        </div>

        {/* Custom button — desktop only */}
        <div className="hidden md:block">
          <Button
            variant={period === "custom" ? "primary" : "secondary"}
            size="md"
            onClick={() => {
              if (period === "custom" && isPanelOpen) {
                setIsPanelOpen(false)
              } else {
                onPeriodChange("custom")
                setIsPanelOpen(true)
              }
            }}
          >
            <Icon icon={CalendarRange} size={16} />
            Personalizado
          </Button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Range indicator text */}
        <span className="text-sm text-gray-500 dark:text-[#8B92A5] tabular-nums font-mono whitespace-nowrap">
          {formatDateRange(effectiveRange)}
        </span>

        {/* Compare toggle */}
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="text-sm text-gray-500 dark:text-[#8B92A5] hidden sm:inline">
            vs anterior
          </span>
          <Switch
            checked={compareEnabled}
            onCheckedChange={onCompareToggle}
          />
        </label>
      </div>

      {/* ──── Desktop: Expandable date range panel ──── */}
      {!isMobile && (
        <DateRangePanel
          isOpen={isPanelOpen}
          range={effectiveRange}
          onRangeChange={handleCustomRangeChange}
          onApply={handleApply}
          onCancel={handleCancel}
        />
      )}

      {/* ──── Mobile: Bottom sheet for custom range ──── */}
      {isMobile && (
        <MobileDateSheet
          isOpen={isMobileSheetOpen}
          onOpenChange={setIsMobileSheetOpen}
          range={effectiveRange}
          onRangeChange={handleCustomRangeChange}
          onApply={handleApply}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
