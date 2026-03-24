"use client"

import React, { useCallback } from "react"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"
import { CampaignCalendarCard } from "@/components/campaigns/campaign-calendar-card"
import { MONTH_NAMES } from "@/lib/constants/calendar"

// ============================================
// TYPES
// ============================================

export interface CalendarDayCellProps {
  date: Date
  isToday: boolean
  campaigns: PortalCampaign[]
  onDayClick: (campaigns: PortalCampaign[]) => void
  onCampaignClick: (campaign: PortalCampaign) => void
}

// ============================================
// COMPONENT
// ============================================

export const CalendarDayCell = React.memo(function CalendarDayCell({
  date,
  isToday,
  campaigns,
  onDayClick,
  onCampaignClick,
}: CalendarDayCellProps) {
  const day = date.getDate()
  const monthName = MONTH_NAMES[date.getMonth()]
  const campaignCount = campaigns.length
  const ariaLabel = `${day} de ${monthName}, ${campaignCount} campanha${campaignCount !== 1 ? "s" : ""}`

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onDayClick(campaigns)
      return
    }

    // Arrow key grid navigation (roving tabindex)
    const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
    if (!arrowKeys.includes(e.key)) return
    e.preventDefault()

    const grid = (e.currentTarget as HTMLElement).closest('[role="grid"]')
    if (!grid) return
    const cells = Array.from(grid.querySelectorAll<HTMLElement>('[role="button"][tabindex]'))
    const currentIdx = cells.indexOf(e.currentTarget as HTMLElement)
    if (currentIdx === -1) return

    let nextIdx = currentIdx
    switch (e.key) {
      case "ArrowRight": nextIdx = Math.min(currentIdx + 1, cells.length - 1); break
      case "ArrowLeft": nextIdx = Math.max(currentIdx - 1, 0); break
      case "ArrowDown": nextIdx = Math.min(currentIdx + 7, cells.length - 1); break
      case "ArrowUp": nextIdx = Math.max(currentIdx - 7, 0); break
      case "Home": nextIdx = 0; break
      case "End": nextIdx = cells.length - 1; break
    }

    if (nextIdx !== currentIdx) {
      e.currentTarget.setAttribute("tabindex", "-1")
      cells[nextIdx].setAttribute("tabindex", "0")
      cells[nextIdx].focus()
    }
  }, [onDayClick, campaigns])

  return (
    <div
      tabIndex={isToday ? 0 : -1}
      role="button"
      aria-label={ariaLabel}
      aria-current={isToday ? "date" : undefined}
      onClick={() => onDayClick(campaigns)}
      onKeyDown={handleKeyDown}
      className={`
        min-h-[120px] border border-slate-100 dark:border-slate-700/30 p-2 cursor-pointer transition-all
        hover:bg-slate-50 dark:hover:bg-white/[0.06]
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
        ${isToday ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-[#1A1D27]"}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`
            text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
            ${isToday ? "bg-primary text-white" : "text-slate-500 dark:text-slate-400"}
          `}
        >
          {day}
        </span>
        {campaigns.length > 3 && (
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            +{campaigns.length - 3}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {campaigns.slice(0, 3).map((campaign) => (
          <CampaignCalendarCard
            key={campaign.id}
            campaign={campaign}
            compact
            onClick={() => onCampaignClick(campaign)}
          />
        ))}
      </div>
    </div>
  )
})
