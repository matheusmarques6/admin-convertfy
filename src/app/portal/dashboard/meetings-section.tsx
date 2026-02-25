import { Video, Clock, ExternalLink, CheckCircle, FileText } from "lucide-react"
import type { PortalMeeting } from "./types"

interface MeetingsSectionProps {
  meetings?: PortalMeeting[]
}

export function MeetingsSection({ meetings }: MeetingsSectionProps) {
  if (!meetings || meetings.length === 0) return null

  const upcomingMeetings = meetings.filter(m => m.status === "scheduled")
  const completedMeetings = meetings.filter(m => m.status === "completed")

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
      {/* Upcoming meetings */}
      {upcomingMeetings.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
              <Video className="h-4 w-4 text-[#05AFF2]" />
              Próximas Reuniões
            </h3>
            <span className="text-xs text-slate-500">{upcomingMeetings.length} agendadas</span>
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
                      ? "border-[#05AFF2]/30 bg-[#05AFF2]/5"
                      : "border-slate-200/80 bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${isToday ? "bg-[#05AFF2]/15" : "bg-slate-100"}`}>
                      <Video className={`h-4 w-4 ${isToday ? "text-[#05AFF2]" : "text-slate-400"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{meeting.title}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
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
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#05AFF2]/10 text-[#05AFF2] hover:bg-[#05AFF2]/20 transition-colors text-sm"
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
        <div className={upcomingMeetings.length > 0 ? "mt-4 border-t border-slate-200/80 pt-4" : ""}>
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            Reuniões Recentes
          </h4>
          <div className="space-y-2">
            {completedMeetings.map((meeting) => {
              const meetingDate = new Date(meeting.scheduledAt)

              return (
                <div key={meeting.id} className="p-3 rounded-lg bg-slate-50/50 border border-slate-200/80">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-800">{meeting.title}</p>
                    <span className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Realizada
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {meetingDate.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                  {meeting.completionNotes && (
                    <div className="bg-white rounded-lg p-3 border-l-2 border-[#05AFF2]/30">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                        <FileText className="h-3 w-3" />
                        Notas da reunião
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
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
        <p className="text-xs text-slate-400 mt-3">
          Reuniões agendadas com sua equipe de sucesso
        </p>
      )}
    </div>
  )
}
