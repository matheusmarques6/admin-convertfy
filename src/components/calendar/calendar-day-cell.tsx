"use client"

import React from "react"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"
import { CampaignCalendarCard } from "@/components/campaigns/campaign-calendar-card"

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

  return (
    <div
      onClick={() => onDayClick(campaigns)}
      className={`
        min-h-[120px] border border-slate-100 dark:border-slate-700/30 p-2 cursor-pointer transition-all
        hover:bg-slate-50 dark:hover:bg-white/[0.06]
        ${isToday ? "bg-primary/5 border-primary/30" : "bg-white dark:bg-[#151922]"}
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
