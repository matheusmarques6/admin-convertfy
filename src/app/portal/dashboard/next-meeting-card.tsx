"use client"

import { useState, useEffect } from "react"
import { Video, Clock, ExternalLink, Calendar } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import type { PortalMeeting } from "./types"

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
      <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Próxima Reunião</span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhuma reunião agendada</p>
      </GlowCard>
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
      ? `Amanhã, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : meetingDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  return (
    <GlowCard color={isWithin24h ? "info" : "primary"} intensity={isWithin24h ? "moderate" : "subtle"} surfaceClassName="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Video className={`h-4 w-4 ${isWithin24h ? "text-info" : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Próxima Reunião</span>
      </div>

      <p className="text-sm font-semibold text-foreground mb-1">{nextMeeting.title}</p>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <Calendar className="h-3 w-3" />
        <span>{dateLabel}</span>
        <span>·</span>
        <span>{nextMeeting.duration}min</span>
      </div>

      {/* Countdown when < 24h */}
      {isWithin24h && (
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="h-3.5 w-3.5 text-info" />
          <span className="text-sm font-medium text-info">
            {diffHours > 0 ? `${diffHours}h ${diffMinutes}min` : `${diffMinutes}min`}
          </span>
        </div>
      )}

      {nextMeeting.meetingUrl && (
        <a
          href={nextMeeting.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-info/10 text-info hover:bg-info/20 transition-colors text-sm"
        >
          <ExternalLink className="h-3 w-3" />
          Entrar na reunião
        </a>
      )}
    </GlowCard>
  )
}
