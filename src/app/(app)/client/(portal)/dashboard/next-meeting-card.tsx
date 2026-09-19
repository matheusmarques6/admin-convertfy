"use client"

import { useState, useEffect } from "react"
import { Video, Clock, Calendar } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { EmptyState } from "@/components/ui/empty-state"
import { MeetingJoinButton } from "@/components/meetings/google-sync-badge"
import type { PortalMeeting } from "./types"
import type { MeetingUrlSource } from "@/types"

interface NextMeetingCardProps {
  meetings?: PortalMeeting[]
}

export function NextMeetingCard({ meetings }: NextMeetingCardProps) {
  const [now, setNow] = useState(new Date())

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const upcomingMeetings = (meetings || [])
    .filter(m => m.status === "scheduled" && new Date(m.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())

  const nextMeeting = upcomingMeetings[0]

  if (!nextMeeting) {
    return (
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-500/10">
            <Icon icon={Video} size={16} className="text-purple-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Proxima Reuniao</span>
        </div>
        <EmptyState compact title="Nenhuma reuniao agendada" />
      </div>
    )
  }

  const meetingDate = new Date(nextMeeting.scheduledAt)
  const diffMs = meetingDate.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const isWithin24h = diffHours < 24 && diffMs > 0

  const isToday = now.toDateString() === meetingDate.toDateString()
  const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === meetingDate.toDateString()

  const dateLabel = isToday
    ? `Hoje, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : isTomorrow
      ? `Amanha, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : meetingDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${isWithin24h ? "bg-cyan-50 dark:bg-cyan-500/10" : "bg-purple-50 dark:bg-purple-500/10"}`}>
          <Icon icon={Video} size={16} className={isWithin24h ? "text-cyan-600" : "text-purple-600"} />
        </div>
        <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Proxima Reuniao</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{nextMeeting.title}</p>

      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
        <Icon icon={Calendar} customSize={12} />
        <span>{dateLabel}</span>
        <span>·</span>
        <span>{nextMeeting.duration}min</span>
      </div>

      {/* Countdown when < 24h */}
      {isWithin24h && (
        <div className="flex items-center gap-1.5 mb-3">
          <Icon icon={Clock} customSize={14} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
          <span className="text-sm font-medium text-[#4E62D8] dark:text-[#7B8CEA]">
            {diffHours > 0 ? `${diffHours}h ${diffMinutes}min` : `${diffMinutes}min`}
          </span>
        </div>
      )}

      <MeetingJoinButton
        meetingUrl={nextMeeting.meetingUrl}
        meetingUrlSource={nextMeeting.meetingUrlSource as MeetingUrlSource | undefined}
        size="sm"
      />
    </div>
  )
}
