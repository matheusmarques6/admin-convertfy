import { Video, Clock, ExternalLink, CheckCircle, FileText } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import type { PortalMeeting } from "./types"

interface MeetingsSectionProps {
  meetings?: PortalMeeting[]
}

export function MeetingsSection({ meetings }: MeetingsSectionProps) {
  if (!meetings || meetings.length === 0) return null

  const upcomingMeetings = meetings.filter(m => m.status === "scheduled")
  const completedMeetings = meetings.filter(m => m.status === "completed")

  return (
    <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-400" />
              Próximas Reuniões
            </h3>
            <span className="text-xs text-muted-foreground">{upcomingMeetings.length} agendadas</span>
          </div>

          <div className="space-y-3">
            {upcomingMeetings.map((meeting) => {
              const meetingDate = new Date(meeting.scheduledAt)
              const isToday = new Date().toDateString() === meetingDate.toDateString()
              const isTomorrow = new Date(Date.now() + 86400000).toDateString() === meetingDate.toDateString()

              const dateLabel = isToday
                ? `Hoje, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : isTomorrow
                  ? `Amanhã, ${meetingDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : meetingDate.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })

              return (
                <div
                  key={meeting.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isToday
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${isToday ? "bg-blue-500/20" : "bg-muted"}`}>
                      <Video className={`h-4 w-4 ${isToday ? "text-blue-400" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{dateLabel}</span>
                        <span>•</span>
                        <span>{meeting.duration}min</span>
                      </div>
                    </div>
                  </div>
                  {meeting.meetingUrl && (
                    <a
                      href={meeting.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-sm"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Entrar
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Completed meetings with notes */}
      {completedMeetings.length > 0 && (
        <div className={upcomingMeetings.length > 0 ? "mt-4 border-t border-border pt-4" : ""}>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <CheckCircle className="h-3 w-3 text-emerald-400" />
            Reuniões Recentes
          </h4>
          <div className="space-y-2">
            {completedMeetings.map((meeting) => {
              const meetingDate = new Date(meeting.scheduledAt)

              return (
                <div key={meeting.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{meeting.title}</p>
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Realizada
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {meetingDate.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                  {meeting.completionNotes && (
                    <div className="bg-background/50 rounded-lg p-3 border-l-2 border-blue-500/30">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                        <FileText className="h-3 w-3" />
                        Notas da reunião
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">
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
        <p className="text-xs text-muted-foreground/70 mt-3">
          Reuniões agendadas com sua equipe de sucesso
        </p>
      )}
    </GlowCard>
  )
}
