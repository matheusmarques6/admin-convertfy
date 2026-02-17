import { Video, Clock, ExternalLink } from "lucide-react"
import type { PortalMeeting } from "./types"

interface MeetingsSectionProps {
  meetings?: PortalMeeting[]
}

export function MeetingsSection({ meetings }: MeetingsSectionProps) {
  if (!meetings || meetings.length === 0) return null

  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Video className="h-4 w-4 text-blue-400" />
          Próximas Reuniões
        </h3>
        <span className="text-xs text-muted-foreground">{meetings.length} agendadas</span>
      </div>

      <div className="space-y-3">
        {meetings.map((meeting) => {
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

      <p className="text-xs text-muted-foreground/70 mt-3">
        Reuniões agendadas com sua equipe de sucesso
      </p>
    </div>
  )
}
