"use client"

import { useState, useEffect } from "react"
import { Video, Clock, Calendar } from "lucide-react"
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
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-500/10">
            <Video className="h-4 w-4 text-purple-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Proxima Reuniao</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma reuniao agendada</p>
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
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${isWithin24h ? "bg-cyan-50 dark:bg-cyan-500/10" : "bg-purple-50 dark:bg-purple-500/10"}`}>
          <Video className={`h-4 w-4 ${isWithin24h ? "text-cyan-600" : "text-purple-600"}`} />
        </div>
        <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Proxima Reuniao</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{nextMeeting.title}</p>

      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
        <Calendar className="h-3 w-3" />
        <span>{dateLabel}</span>
        <span>·</span>
        <span>{nextMeeting.duration}min</span>
      </div>

      {/* Countdown when < 24h */}
      {isWithin24h && (
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="h-3.5 w-3.5 text-[#05AFF2]" />
          <span className="text-sm font-medium text-[#05AFF2]">
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
