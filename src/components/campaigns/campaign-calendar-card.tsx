"use client"

import React from "react"
import { Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatCurrencyCompact } from "@/lib/utils/format"
import { CHANNEL_CONFIG, STATUS_CONFIG } from "@/lib/constants/calendar"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"

// ============================================
// TYPES
// ============================================

export interface CampaignCalendarCardProps {
  campaign: PortalCampaign
  compact?: boolean
  onClick: () => void
}

// ============================================
// UTILITY
// ============================================

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return ""
  return timeStr.substring(0, 5)
}

// ============================================
// COMPONENT
// ============================================

export const CampaignCalendarCard = React.memo(function CampaignCalendarCard({
  campaign,
  compact = false,
  onClick,
}: CampaignCalendarCardProps) {
  const channelConfig = CHANNEL_CONFIG[campaign.channel] || CHANNEL_CONFIG.email
  const statusConfig = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.scheduled
  const ChannelIcon = channelConfig.icon

  if (compact) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        className={`
          text-xs px-2 py-1 rounded-md flex flex-col
          text-white cursor-pointer hover:opacity-80 transition-all
        `}
        style={{ backgroundColor: campaign.color || "#3b82f6" }}
        title={campaign.name}
      >
        <div className="flex items-center gap-1.5 truncate">
          <ChannelIcon className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{campaign.name}</span>
        </div>
        {campaign.hasKlaviyoMetrics && campaign.status === "sent" && (
          <span className="text-[10px] text-white/70 truncate">
            {campaign.openRate != null ? `${campaign.openRate.toFixed(1)}% ab` : "\u2014"} · {formatCurrencyCompact(campaign.revenue ?? 0)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="rounded-lg bg-slate-50 dark:bg-[#1A1F2E] border border-slate-200/80 dark:border-slate-700/40 p-3 cursor-pointer hover:bg-white dark:hover:bg-[#151922] hover:shadow-sm dark:hover:shadow-slate-900/20 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: campaign.color || "#3b82f6" }}
        >
          <ChannelIcon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {campaign.scheduledTime && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {formatTime(campaign.scheduledTime)}
              </span>
            )}
            <Badge className={`text-[10px] ${statusConfig.color}`}>
              {statusConfig.label}
            </Badge>
          </div>
          <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate group-hover:text-primary transition-colors">
            {campaign.name}
          </p>
          {campaign.segmentName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {campaign.segmentName}
            </p>
          )}
          {campaign.recipients && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <Users className="h-3 w-3 inline mr-1" />
              {formatNumber(campaign.recipients)} destinatarios
            </p>
          )}
        </div>
      </div>
    </div>
  )
})
