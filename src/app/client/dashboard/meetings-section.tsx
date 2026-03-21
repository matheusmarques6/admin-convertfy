"use client"

import { useState, useCallback } from "react"
import {
  Video,
  Clock,
  CheckCircle,
  FileText,
  XCircle,
  HelpCircle,
  User,
  Crown,
  Loader2,
  Check,
  X,
  CircleDashed,
} from "lucide-react"
import { MeetingJoinButton } from "@/components/meetings/google-sync-badge"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { PortalMeeting, PortalMeetingParticipant, PortalMeetingResponseStatus } from "./types"
import type { MeetingUrlSource } from "@/types"

interface MeetingsSectionProps {
  meetings?: PortalMeeting[]
}

const RSVP_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  accepted: { icon: CheckCircle, color: "text-emerald-500", label: "Confirmado" },
  declined: { icon: XCircle, color: "text-red-500", label: "Recusado" },
  tentative: { icon: HelpCircle, color: "text-amber-500", label: "Talvez" },
  pending: { icon: Clock, color: "text-slate-400 dark:text-slate-500", label: "Pendente" },
}

const RSVP_BADGE_STYLES: Record<string, string> = {
  pending: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  accepted: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  declined: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
  tentative: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
}

function RSVPStatusBadge({ status }: { status: PortalMeetingResponseStatus }) {
  const config = RSVP_CONFIG[status] || RSVP_CONFIG.pending
  const Icon = config.icon
  const badgeStyle = RSVP_BADGE_STYLES[status] || RSVP_BADGE_STYLES.pending

  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", badgeStyle)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

function RSVPButtons({
  meetingId,
  currentStatus,
  onRSVP,
}: {
  meetingId: string
  currentStatus: PortalMeetingResponseStatus
  onRSVP: (meetingId: string, response: PortalMeetingResponseStatus) => Promise<void>
}) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleRSVP = useCallback(async (response: PortalMeetingResponseStatus) => {
    setLoading(response)
    try {
      await onRSVP(meetingId, response)
    } finally {
      setLoading(null)
    }
  }, [meetingId, onRSVP])

  const buttons: Array<{
    response: PortalMeetingResponseStatus
    label: string
    icon: typeof Check
    activeClass: string
    hoverClass: string
  }> = [
    {
      response: "accepted",
      label: "Aceitar",
      icon: Check,
      activeClass: "bg-emerald-500 text-white border-emerald-500",
      hoverClass: "hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-500/30",
    },
    {
      response: "declined",
      label: "Recusar",
      icon: X,
      activeClass: "bg-red-500 text-white border-red-500",
      hoverClass: "hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/30",
    },
    {
      response: "tentative",
      label: "Talvez",
      icon: CircleDashed,
      activeClass: "bg-amber-500 text-white border-amber-500",
      hoverClass: "hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-500/30",
    },
  ]

  return (
    <div className="flex items-center gap-1.5 mt-2">
      {buttons.map(({ response, label, icon: Icon, activeClass, hoverClass }) => {
        const isActive = currentStatus === response
        const isLoading = loading === response

        return (
          <button
            key={response}
            onClick={() => handleRSVP(response)}
            disabled={loading !== null}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isActive
                ? activeClass
                : cn(
                    "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-transparent",
                    hoverClass
                  )
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ParticipantBadge({ participant }: { participant: PortalMeetingParticipant }) {
  const config = RSVP_CONFIG[participant.response_status] || RSVP_CONFIG.pending
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            {participant.is_organizer ? (
              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
            ) : (
              <User className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
            )}
            <span className="truncate max-w-[120px]">{participant.name}</span>
            <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {participant.name}
            {participant.is_organizer && " (Organizador)"}
            {" - "}
            {config.label}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ParticipantsList({ participants }: { participants?: PortalMeetingParticipant[] }) {
  if (!participants || participants.length === 0) return null

  // Organizer first, then by name
  const sorted = [...participants].sort((a, b) => {
    if (a.is_organizer !== b.is_organizer) return a.is_organizer ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {sorted.map((p, i) => (
        <ParticipantBadge key={`${p.email || p.name}-${i}`} participant={p} />
      ))}
    </div>
  )
}

function MeetSourceBadge({ source }: { source?: string }) {
  if (source !== "google_meet") return null
  return (
    <Badge variant="neutral" showDot={false} className="gap-1 text-[10px] px-1.5 py-0 h-4 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400">
      <Video className="h-2.5 w-2.5" />
      Meet
    </Badge>
  )
}

export function MeetingsSection({ meetings }: MeetingsSectionProps) {
  const [localMeetings, setLocalMeetings] = useState(meetings)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  // Sync with prop changes
  if (meetings !== localMeetings && meetings) {
    setLocalMeetings(meetings)
  }

  const handleRSVP = useCallback(async (meetingId: string, response: PortalMeetingResponseStatus) => {
    try {
      const res = await fetch(`/api/portal/meetings/${meetingId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao responder")
      }

      // Optimistic update
      setLocalMeetings((prev) =>
        (prev || []).map((m) =>
          m.id === meetingId ? { ...m, responseStatus: response } : m
        )
      )

      const labels: Record<string, string> = {
        accepted: "Presenca confirmada",
        declined: "Reuniao recusada",
        tentative: "Marcado como talvez",
      }
      setToastMessage({ text: labels[response] || "Resposta atualizada", type: "success" })
      setTimeout(() => setToastMessage(null), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao responder"
      setToastMessage({ text: message, type: "error" })
      setTimeout(() => setToastMessage(null), 4000)
    }
  }, [])

  if (!localMeetings || localMeetings.length === 0) return null

  const upcomingMeetings = localMeetings.filter(m => m.status === "scheduled")
  const completedMeetings = localMeetings.filter(m => m.status === "completed")

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 relative">
      {/* Toast notification */}
      {toastMessage && (
        <div
          className={cn(
            "absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200",
            toastMessage.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          )}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Video className="h-4 w-4 text-[#05AFF2]" />
              Proximas Reunioes
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{upcomingMeetings.length} agendadas</span>
          </div>

          <div className="space-y-3">
            {upcomingMeetings.map((meeting) => {
              const meetingDate = new Date(meeting.scheduledAt)
              const isToday = new Date().toDateString() === meetingDate.toDateString()
              const isTomorrow = new Date(Date.now() + 86400000).toDateString() === meetingDate.toDateString()

              const dateLabel = isToday
                ? `Hoje, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : isTomorrow
                  ? `Amanha, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : meetingDate.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })

              const responseStatus = (meeting.responseStatus || "pending") as PortalMeetingResponseStatus

              return (
                <div
                  key={meeting.id}
                  className={`p-3 rounded-lg border ${
                    isToday
                      ? "border-[#05AFF2]/30 bg-[#05AFF2]/5"
                      : "border-slate-200/80 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-800/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`rounded-lg p-2 shrink-0 ${isToday ? "bg-[#05AFF2]/15" : "bg-slate-100 dark:bg-slate-800"}`}>
                        <Video className={`h-4 w-4 ${isToday ? "text-[#05AFF2]" : "text-slate-400 dark:text-slate-500"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{meeting.title}</p>
                          <MeetSourceBadge source={meeting.meetingUrlSource} />
                          <RSVPStatusBadge status={responseStatus} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>{dateLabel}</span>
                          <span>•</span>
                          <span>{meeting.duration}min</span>
                        </div>
                        <ParticipantsList participants={meeting.participants} />
                        <RSVPButtons
                          meetingId={meeting.id}
                          currentStatus={responseStatus}
                          onRSVP={handleRSVP}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 ml-2">
                      <MeetingJoinButton
                        meetingUrl={meeting.meetingUrl}
                        meetingUrlSource={meeting.meetingUrlSource as MeetingUrlSource | undefined}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Completed meetings with notes */}
      {completedMeetings.length > 0 && (
        <div className={upcomingMeetings.length > 0 ? "mt-4 border-t border-slate-200/80 dark:border-slate-700/40 pt-4" : ""}>
          <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            Reunioes Recentes
          </h4>
          <div className="space-y-2">
            {completedMeetings.map((meeting) => {
              const meetingDate = new Date(meeting.scheduledAt)

              return (
                <div key={meeting.id} className="p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/40">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{meeting.title}</p>
                      <MeetSourceBadge source={meeting.meetingUrlSource} />
                    </div>
                    <span className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Realizada
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {meetingDate.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                  <ParticipantsList participants={meeting.participants} />
                  {meeting.completionNotes && (
                    <div className="bg-white dark:bg-[#1A1F2E] rounded-lg p-3 border-l-2 border-[#05AFF2]/30 mt-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                        <FileText className="h-3 w-3" />
                        Notas da reuniao
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                        {meeting.completionNotes}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {upcomingMeetings.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
          Reunioes agendadas com sua equipe de sucesso
        </p>
      )}
    </div>
  )
}
