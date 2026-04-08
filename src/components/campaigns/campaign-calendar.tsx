"use client"

import { useState, useMemo, useCallback } from "react"
import {
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { ChannelBadge, ChannelDot, DS_CHANNEL_CONFIG } from "@/components/ui/channel-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface CampaignCalendarProps {
  campaigns: Campaign[]
  loading: boolean
  onCampaignClick: (campaign: Campaign) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getCalendarDays(month: Date): Array<{ date: Date }> {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1)
  // Start on Monday
  const startOffset = (firstDay.getDay() + 6) % 7
  const start = new Date(firstDay)
  start.setDate(start.getDate() - startOffset)

  const days: Array<{ date: Date }> = []
  const current = new Date(start)
  for (let i = 0; i < 42; i++) {
    days.push({ date: new Date(current) })
    current.setDate(current.getDate() + 1)
  }
  return days
}

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toFixed(0)
}

function getCampaignDate(campaign: Campaign): string | null {
  return campaign.scheduled_date || null
}

// ── Component ────────────────────────────────────────────────────────────────

export function CampaignCalendar({ campaigns, loading, onCampaignClick }: CampaignCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const isMobile = useMediaQuery("(max-width: 767px)")

  const navigateMonth = useCallback((dir: number) => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
    setSelectedDate(null)
  }, [])

  // Group campaigns by date key (YYYY-MM-DD)
  const campaignsByDate = useMemo(() => {
    const map: Record<string, Campaign[]> = {}
    campaigns.forEach(c => {
      const date = getCampaignDate(c)
      if (!date) return
      const key = date // already YYYY-MM-DD
      if (!map[key]) map[key] = []
      map[key].push(c)
    })
    return map
  }, [campaigns])

  const calendarDays = useMemo(() => getCalendarDays(currentMonth), [currentMonth])

  if (loading) {
    return (
      <div className="mt-6">
        <Skeleton className="h-[500px] w-full rounded-[8px]" />
      </div>
    )
  }

  // ── Mobile: Agenda View ─────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="mt-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
            {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date)} className="text-xs">
              Hoje
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <AgendaView
          campaigns={campaigns}
          campaignsByDate={campaignsByDate}
          currentMonth={currentMonth}
          onCampaignClick={onCampaignClick}
        />
      </div>
    )
  }

  // ── Desktop: Calendar Grid + Side Panel ─────────────────────────────────

  return (
    <div className="mt-6">
      <div className={cn(
        "grid gap-6",
        selectedDate ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1",
      )}>
        {/* Calendar grid */}
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] overflow-hidden">
          {/* Month navigation */}
          <div className="flex items-center justify-between p-4 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs">
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Day headers — starts on Monday */}
          <div className="grid grid-cols-7">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(day => (
              <div key={day} className="text-center text-[11px] font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dateKey = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`
              const dayCampaigns = campaignsByDate[dateKey] || []
              const isCurrentMonth = day.date.getMonth() === currentMonth.getMonth()
              const isToday = isSameDay(day.date, new Date())
              const isSelected = selectedDate && isSameDay(day.date, selectedDate)

              return (
                <button
                  key={index}
                  onClick={() => {
                    if (dayCampaigns.length > 0) {
                      setSelectedDate(prev => prev && isSameDay(prev, day.date) ? null : day.date)
                    }
                  }}
                  className={cn(
                    "min-h-[80px] p-2 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]",
                    "text-left transition-colors duration-150",
                    "hover:bg-gray-50 dark:hover:bg-[rgba(255,255,255,0.02)]",
                    !isCurrentMonth && "opacity-40",
                    isSelected && "bg-[#EEF0FB] dark:bg-[rgba(123,140,234,0.08)]",
                    dayCampaigns.length > 0 && "cursor-pointer",
                    dayCampaigns.length === 0 && "cursor-default",
                  )}
                >
                  <span className={cn(
                    "text-sm font-mono tabular-nums",
                    isToday && "font-semibold text-[#4E62D8] dark:text-[#7B8CEA]",
                    !isToday && isCurrentMonth && "text-gray-700 dark:text-[#8B92A5]",
                    !isCurrentMonth && "text-gray-300 dark:text-[#5C6378]",
                  )}>
                    {day.date.getDate()}
                  </span>

                  {/* Campaign dots */}
                  {dayCampaigns.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {dayCampaigns.slice(0, 4).map((campaign, i) => (
                        <ChannelDot
                          key={i}
                          channel={campaign.channel}
                        />
                      ))}
                      {dayCampaigns.length > 4 && (
                        <span className="text-[9px] text-gray-400 dark:text-[#5C6378]">
                          +{dayCampaigns.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Channel legend */}
          <div className="flex items-center justify-center gap-5 p-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
            {Object.entries(DS_CHANNEL_CONFIG).map(([key, config]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-[#8B92A5]">
                <ChannelDot channel={key} />
                {config.label}
              </span>
            ))}
          </div>
        </div>

        {/* Side panel — campaigns for selected date */}
        {selectedDate && (
          <DayCampaignPanel
            date={selectedDate}
            campaigns={campaignsByDate[`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`] || []}
            onClose={() => setSelectedDate(null)}
            onCampaignClick={onCampaignClick}
          />
        )}
      </div>
    </div>
  )
}

// ── Day Campaign Panel (desktop side panel) ──────────────────────────────────

function DayCampaignPanel({
  date,
  campaigns,
  onClose,
  onCampaignClick,
}: {
  date: Date
  campaigns: Campaign[]
  onClose: () => void
  onCampaignClick: (c: Campaign) => void
}) {
  return (
    <div className="h-fit sticky top-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3]">
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
          </h4>
          <p className="text-xs text-gray-400 dark:text-[#5C6378]">
            {campaigns.length} campanha{campaigns.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Campaign cards */}
      <div className="p-3 space-y-2">
        {campaigns.map(campaign => (
          <CampaignSidePanelCard
            key={campaign.id}
            campaign={campaign}
            onClick={() => onCampaignClick(campaign)}
          />
        ))}
      </div>
    </div>
  )
}

function CampaignSidePanelCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const recipients = campaign.recipients || 0
  const openRate = recipients > 0 ? ((campaign.opened || 0) / recipients) * 100 : null
  const clickRate = recipients > 0 ? ((campaign.clicked || 0) / recipients) * 100 : null

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-[6px] border",
        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        "hover:bg-gray-50 dark:hover:bg-[#242836]",
        "transition-colors duration-150",
      )}
    >
      {/* Name with channel dot */}
      <div className="flex items-center gap-2 mb-1.5">
        <ChannelDot channel={campaign.channel} size={8} />
        <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
          {campaign.name}
        </span>
      </div>

      {/* Channel badge + Status */}
      <div className="flex items-center gap-2 mb-1.5">
        <ChannelBadge channel={campaign.channel} />
        <StatusBadge status={campaign.status} />
      </div>

      {/* Metrics */}
      {campaign.status === "sent" && openRate !== null && (
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-[#8B92A5]">
          <span className="font-mono tabular-nums">{openRate.toFixed(1)}% open</span>
          {clickRate !== null && (
            <span className="font-mono tabular-nums">{clickRate.toFixed(1)}% click</span>
          )}
          {campaign.revenue != null && campaign.revenue > 0 && (
            <span className="font-mono tabular-nums font-medium text-[#065F46] dark:text-[#6EE7B7]">
              R$ {formatCompact(campaign.revenue)}
            </span>
          )}
        </div>
      )}

      {/* Scheduled info */}
      {campaign.status === "scheduled" && campaign.scheduled_time && (
        <p className="text-xs text-gray-400 dark:text-[#5C6378] font-mono tabular-nums">
          Agendada: {campaign.scheduled_time}
        </p>
      )}
    </button>
  )
}

// ── Agenda View (mobile) — Rule 23 ───────────────────────────────────────────

function AgendaView({
  campaigns: _campaigns,
  campaignsByDate,
  currentMonth,
  onCampaignClick,
}: {
  campaigns: Campaign[]
  campaignsByDate: Record<string, Campaign[]>
  currentMonth: Date
  onCampaignClick: (c: Campaign) => void
}) {
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  // Filter dates for current month
  const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`
  const sortedDates = Object.keys(campaignsByDate)
    .filter(d => d.startsWith(monthStr))
    .sort()

  const upcomingDates = sortedDates.filter(d => d >= todayKey)
  const pastDates = sortedDates.filter(d => d < todayKey).reverse()

  if (sortedDates.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-12">
        Nenhuma campanha neste mês
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upcoming */}
      {upcomingDates.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] mb-3 px-1">
            Próximas
          </h4>
          <div className="space-y-4">
            {upcomingDates.map(dateKey => (
              <AgendaDateGroup
                key={dateKey}
                dateKey={dateKey}
                campaigns={campaignsByDate[dateKey]}
                todayKey={todayKey}
                onCampaignClick={onCampaignClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {pastDates.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] mb-3 px-1">
            Anteriores
          </h4>
          <div className="space-y-4">
            {pastDates.map(dateKey => (
              <AgendaDateGroup
                key={dateKey}
                dateKey={dateKey}
                campaigns={campaignsByDate[dateKey]}
                todayKey={todayKey}
                onCampaignClick={onCampaignClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AgendaDateGroup({
  dateKey,
  campaigns,
  todayKey,
  onCampaignClick,
}: {
  dateKey: string
  campaigns: Campaign[]
  todayKey: string
  onCampaignClick: (c: Campaign) => void
}) {
  const dateObj = new Date(dateKey + "T12:00:00")
  const isToday = dateKey === todayKey

  return (
    <div>
      {/* Date header */}
      <div className={cn(
        "sticky top-14 z-10 py-2 px-1",
        "bg-gray-50 dark:bg-[#0F1117]",
      )}>
        <span className={cn(
          "text-xs font-semibold uppercase tracking-[0.04em]",
          isToday ? "text-[#4E62D8] dark:text-[#7B8CEA]" : "text-gray-500 dark:text-[#5C6378]",
        )}>
          {isToday ? "Hoje" : dateObj.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
        </span>
      </div>

      {/* Campaign cards */}
      <div className="space-y-2 px-1">
        {campaigns.map(campaign => {
          const recipients = campaign.recipients || 0
          const openRate = recipients > 0 ? ((campaign.opened || 0) / recipients) * 100 : null
          const clickRate = recipients > 0 ? ((campaign.clicked || 0) / recipients) * 100 : null

          return (
            <div
              key={campaign.id}
              className={cn(
                "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-4",
                "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
                "active:bg-gray-50 dark:active:bg-[#242836]",
                "transition-colors duration-150 cursor-pointer",
              )}
              onClick={() => onCampaignClick(campaign)}
            >
              {/* Row 1: dot + name + status badge */}
              <div className="flex items-center gap-2 mb-2">
                <ChannelDot channel={campaign.channel} size={10} />
                <span className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate flex-1">
                  {campaign.name}
                </span>
                <StatusBadge status={campaign.status} />
              </div>

              {/* Row 2: channel + metrics */}
              <div className="flex items-center gap-3 text-xs">
                <ChannelBadge channel={campaign.channel} />
                {campaign.status === "sent" && (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-[#8B92A5]">
                    {openRate !== null && (
                      <span className="font-mono tabular-nums">{openRate.toFixed(1)}% open</span>
                    )}
                    {clickRate !== null && (
                      <span className="font-mono tabular-nums">{clickRate.toFixed(1)}% click</span>
                    )}
                    {campaign.revenue != null && campaign.revenue > 0 && (
                      <span className="font-mono tabular-nums font-medium text-[#065F46] dark:text-[#6EE7B7]">
                        R$ {formatCompact(campaign.revenue)}
                      </span>
                    )}
                  </div>
                )}
                {campaign.status === "scheduled" && campaign.scheduled_time && (
                  <span className="text-gray-400 dark:text-[#5C6378] font-mono tabular-nums">
                    {campaign.scheduled_time}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
