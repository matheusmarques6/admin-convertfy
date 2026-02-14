"use client"

import Link from "next/link"
import { Plus, Calendar, Video, CheckCircle, XCircle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/utils"
import type { Meeting } from "@/types"

interface ClientMeetingsProps {
  meetings: Meeting[]
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: React.ElementType }> = {
  scheduled: { label: "Agendada", variant: "default", icon: Clock },
  completed: { label: "Realizada", variant: "success", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "secondary", icon: XCircle },
  no_show: { label: "Não Compareceu", variant: "destructive", icon: XCircle },
}

export function ClientMeetings({ meetings }: ClientMeetingsProps) {
  const now = new Date()
  const upcomingMeetings = meetings
    .filter((m) => m.status === "scheduled" && new Date(m.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const pastMeetings = meetings
    .filter((m) => m.status !== "scheduled" || new Date(m.scheduled_at) <= now)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex justify-end">
        <Button asChild>
          <Link href={`/meetings/new?clientId=${clientId}`}>
            <Plus className="mr-2 h-4 w-4" />
            Agendar Reunião
          </Link>
        </Button>
      </div>

      {/* Upcoming Meetings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Próximas Reuniões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingMeetings.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              Nenhuma reunião agendada
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg p-2 bg-primary/10">
                      <Video className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{meeting.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(meeting.scheduled_at)} -{" "}
                        {meeting.duration_minutes} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {meeting.meeting_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={meeting.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Entrar
                        </a>
                      </Button>
                    )}
                    <Badge>Agendada</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Meetings */}
      {pastMeetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Reuniões</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pastMeetings.map((meeting) => {
                const config = statusConfig[meeting.status] || statusConfig.scheduled
                return (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <config.icon className={`h-4 w-4 ${
                        meeting.status === "completed"
                          ? "text-emerald-500"
                          : meeting.status === "no_show"
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(meeting.scheduled_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
