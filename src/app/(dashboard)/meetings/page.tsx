import { Plus, Calendar, Video, Clock, CheckCircle, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/utils"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"

export const dynamic = "force-dynamic"

async function getMeetings() {
  const supabase = await createClient()

  const { data: meetings } = await supabase
    .from("meetings")
    .select(`
      *,
      client:clients (
        id,
        name,
        company
      ),
      user:profiles!meetings_user_id_fkey (
        id,
        name
      )
    `)
    .order("scheduled_at", { ascending: true })

  const now = new Date()
  const upcoming = meetings?.filter(
    (m) => m.status === "scheduled" && new Date(m.scheduled_at) > now
  ) || []
  const past = meetings?.filter(
    (m) => m.status !== "scheduled" || new Date(m.scheduled_at) <= now
  ) || []

  return { upcoming, past, all: meetings || [] }
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive"; icon: React.ElementType }> = {
  scheduled: { label: "Agendada", variant: "default", icon: Clock },
  completed: { label: "Realizada", variant: "success", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "secondary", icon: XCircle },
  no_show: { label: "Não Compareceu", variant: "destructive", icon: XCircle },
}

export default async function MeetingsPage() {
  const { upcoming, past } = await getMeetings()

  return (
    <PagePermissionWrapper requiredFeatures={["calendar_control"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reuniões</h1>
          <p className="text-muted-foreground">
            Gerencie as reuniões com seus clientes
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agendar Reunião
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Próximas</p>
              <p className="text-2xl font-bold">{upcoming.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-emerald-500/10">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Realizadas (mês)</p>
              <p className="text-2xl font-bold">
                {past.filter((m) => m.status === "completed").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">No-shows (mês)</p>
              <p className="text-2xl font-bold">
                {past.filter((m) => m.status === "no_show").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Meetings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Próximas Reuniões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma reunião agendada
            </div>
          ) : (
            <div className="space-y-4">
              {upcoming.map((meeting) => (
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
                        {meeting.client?.name} • {formatDateTime(meeting.scheduled_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {meeting.meeting_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
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
      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>Reuniões anteriores</CardDescription>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma reunião no histórico
            </div>
          ) : (
            <div className="space-y-3">
              {past.slice(0, 10).map((meeting) => {
                const config = statusConfig[meeting.status] || statusConfig.scheduled
                return (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <config.icon className={`h-4 w-4 ${
                        meeting.status === "completed" ? "text-emerald-500" :
                        meeting.status === "no_show" ? "text-red-500" : "text-muted-foreground"
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {meeting.client?.name} • {formatDateTime(meeting.scheduled_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PagePermissionWrapper>
  )
}
