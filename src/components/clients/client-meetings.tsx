"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Calendar, Video, CheckCircle, XCircle, Clock, Loader2, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { Meeting } from "@/types"

interface ClientMeetingsProps {
  clientId: string
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: React.ElementType }> = {
  scheduled: { label: "Agendada", variant: "default", icon: Clock },
  completed: { label: "Realizada", variant: "success", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "secondary", icon: XCircle },
  no_show: { label: "Não Compareceu", variant: "destructive", icon: XCircle },
}

export function ClientMeetings({ clientId }: ClientMeetingsProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMeetings() {
      const supabase = createClient()
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .eq("client_id", clientId)
        .order("scheduled_at", { ascending: false })
        .limit(50)
      setMeetings(data || [])
      setLoading(false)
    }
    loadMeetings()
  }, [clientId])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

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
          <Link href="/meetings">
            <Plus className="mr-2 h-4 w-4" />
            Agendar Reunião
          </Link>
        </Button>
      </div>

      {/* Upcoming Meetings */}
      <GlowCard color="info" intensity="subtle">
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
      </GlowCard>

      {/* Past Meetings */}
      {pastMeetings.length > 0 && (
        <GlowCard color="primary" intensity="subtle">
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
                    className="p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center justify-between">
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
                    {meeting.completion_notes && (
                      <div className="mt-2 ml-7 p-2 rounded bg-background/50 border-l-2 border-primary/30">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <FileText className="h-3 w-3" />
                          Notas da reunião
                        </div>
                        <p className="text-sm whitespace-pre-wrap line-clamp-3">
                          {meeting.completion_notes}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </GlowCard>
      )}
    </div>
  )
}
