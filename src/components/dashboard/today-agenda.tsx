"use client"

import Link from "next/link"
import { format, isToday, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Video, ExternalLink, Calendar, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Meeting } from "@/types"

interface TodayAgendaProps {
  meetings: Meeting[]
}

export function TodayAgenda({ meetings }: TodayAgendaProps) {
  const todayMeetings = meetings
    .filter(
      (m) =>
        m.status === "scheduled" &&
        isToday(parseISO(m.scheduled_at))
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    )

  const now = new Date()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Agenda de Hoje
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
            <Link href="/meetings?view=calendar">
              Ver calendário
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayMeetings.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Video className="h-8 w-8 mx-auto mb-1.5 opacity-30" />
            <p>Nenhuma reunião hoje</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayMeetings.map((meeting) => {
              const meetingDate = parseISO(meeting.scheduled_at)
              const isHappeningNow =
                meetingDate <= now &&
                meetingDate.getTime() + meeting.duration_minutes * 60000 > now.getTime()

              return (
                <div
                  key={meeting.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg border transition-colors",
                    isHappeningNow && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "rounded-md p-1.5",
                      isHappeningNow ? "bg-primary/20" : "bg-muted"
                    )}>
                      <Video className={cn(
                        "h-3.5 w-3.5",
                        isHappeningNow ? "text-primary animate-pulse" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{meeting.title}</p>
                        {isHappeningNow && (
                          <Badge variant="default" className="text-[10px] h-4">Agora</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(meetingDate, "HH:mm")} • {meeting.duration_minutes}min
                      </p>
                    </div>
                  </div>
                  {meeting.meeting_url && (
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" asChild>
                      <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Entrar
                      </a>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
