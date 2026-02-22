"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  isToday,
  isFuture,
  isPast,
  isTomorrow,
  isThisWeek,
  isThisMonth,
  parseISO,
  format,
  isWithinInterval,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Plus,
  Video,
  Calendar,
  List,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MeetingDialog } from "@/components/board/meeting-dialog"
import { MeetingCompletionDialog } from "@/components/meetings/meeting-completion-dialog"
import { MeetingCalendar } from "@/components/meetings/meeting-calendar"
import { MeetingFilters, type MeetingFiltersState } from "@/components/meetings/meeting-filters"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import { MEETING_STATUS_CONFIG } from "@/lib/constants/board"
import type { Meeting, MeetingStatus, MeetingParticipant } from "@/types"

interface UserProfile {
  id: string
  name: string
  email?: string
  avatar_url?: string
}

interface ClientInfo {
  id: string
  name: string
  company?: string
  stores?: string[]
}

interface ParticipantOption {
  id: string
  name: string
  email?: string
  avatar_url?: string
  type: "profile" | "org_member"
  role?: string
}

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: ClientInfo
  user?: UserProfile
  participants?: MeetingParticipant[]
}

interface MeetingsPageClientProps {
  meetings: MeetingWithRelations[]
  clients: ClientInfo[]
  members: ParticipantOption[]
}

function getShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0]
}

function formatClientDisplay(client: ClientInfo): string {
  const storeName = client.stores?.[0]
  const shortName = getShortName(client.name)
  return storeName ? `${storeName} — ${shortName}` : shortName
}

function formatMeetingDate(date: string) {
  const d = new Date(date)
  if (isToday(d)) return `Hoje, ${format(d, "HH:mm")}`
  if (isTomorrow(d)) return `Amanhã, ${format(d, "HH:mm")}`
  return format(d, "dd/MM 'às' HH:mm", { locale: ptBR })
}

export function MeetingsPageClient({
  meetings,
  clients,
  members,
}: MeetingsPageClientProps) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithRelations | null>(null)
  const [initialDate, setInitialDate] = useState<Date | undefined>()
  const [completionMeeting, setCompletionMeeting] = useState<MeetingWithRelations | null>(null)
  const [filters, setFilters] = useState<MeetingFiltersState>({
    status: "all",
    period: "all",
  })

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      // Status filter
      if (filters.status !== "all" && m.status !== filters.status) return false

      // Period filter
      const date = parseISO(m.scheduled_at)
      switch (filters.period) {
        case "today":
          if (!isToday(date)) return false
          break
        case "week":
          if (!isThisWeek(date, { locale: ptBR })) return false
          break
        case "month":
          if (!isThisMonth(date)) return false
          break
        case "custom":
          if (filters.customDateStart && filters.customDateEnd) {
            if (!isWithinInterval(date, { start: filters.customDateStart, end: filters.customDateEnd }))
              return false
          }
          break
      }

      return true
    })
  }, [meetings, filters])

  const upcomingMeetings = filteredMeetings
    .filter((m) => m.status === "scheduled" && isFuture(new Date(m.scheduled_at)))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const todayMeetings = upcomingMeetings.filter((m) => isToday(new Date(m.scheduled_at)))

  const pastMeetings = filteredMeetings
    .filter((m) => m.status !== "scheduled" || isPast(new Date(m.scheduled_at)))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 20)

  // Dialog handlers
  const handleNewMeeting = () => {
    setEditingMeeting(null)
    setInitialDate(undefined)
    setDialogOpen(true)
  }

  const handleEditMeeting = (meeting: MeetingWithRelations) => {
    setEditingMeeting(meeting)
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingMeeting(null)
  }

  const handleDialogSuccess = () => {
    handleDialogClose()
    router.refresh()
  }

  const handleOpenCompletion = (meeting: MeetingWithRelations) => {
    setCompletionMeeting(meeting)
  }

  const handleCompletionClose = () => {
    setCompletionMeeting(null)
  }

  const handleCompletionSuccess = () => {
    setCompletionMeeting(null)
    router.refresh()
  }

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta reunião?")) return
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast({ title: "Reunião excluída" })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir reunião" })
    }
  }

  const handleStatusChange = async (meetingId: string, newStatus: MeetingStatus) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast({ title: "Status atualizado" })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar status" })
    }
  }

  // Calendar slot click → open dialog with pre-filled date
  const handleSlotClick = (date: Date) => {
    setEditingMeeting(null)
    setInitialDate(date)
    setDialogOpen(true)
  }

  const now = new Date()

  return (
    <>
      <div className="space-y-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground">
            Gerencie as reuniões com seus clientes
          </p>
          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "calendar")}>
              <TabsList className="h-9">
                <TabsTrigger value="list" className="gap-2">
                  <List className="h-4 w-4" />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendário
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={handleNewMeeting}>
              <Plus className="mr-2 h-4 w-4" />
              Agendar Reunião
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <GlowCard color="primary" intensity="moderate" surfaceClassName="pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Próximas</p>
                <p className="text-2xl font-bold">{upcomingMeetings.length}</p>
              </div>
            </CardContent>
          </GlowCard>
          <GlowCard color="success" intensity="moderate" surfaceClassName="pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Realizadas</p>
                <p className="text-2xl font-bold">
                  {filteredMeetings.filter((m) => m.status === "completed").length}
                </p>
              </div>
            </CardContent>
          </GlowCard>
          <GlowCard color="warning" intensity="moderate" surfaceClassName="pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-warning/10">
                <Video className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hoje</p>
                <p className="text-2xl font-bold">{todayMeetings.length}</p>
              </div>
            </CardContent>
          </GlowCard>
        </div>

        {/* Filters */}
        <MeetingFilters filters={filters} onFiltersChange={setFilters} />

        {/* Content */}
        <div className="flex-1 min-h-0">
          {viewMode === "list" ? (
            <div className="space-y-6 pb-6">
              {/* Upcoming */}
              <GlowCard color="info" intensity="subtle">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-5 w-5 text-primary" />
                    Próximas Reuniões
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingMeetings.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma reunião agendada</p>
                      <Button variant="link" onClick={handleNewMeeting}>
                        Agendar primeira reunião
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMeetings.map((meeting) => {
                        const isHappeningNow =
                          new Date(meeting.scheduled_at) <= now &&
                          new Date(meeting.scheduled_at).getTime() + meeting.duration_minutes * 60000 > now.getTime()

                        return (
                          <div
                            key={meeting.id}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-lg border transition-colors",
                              isHappeningNow && "border-primary bg-primary/5",
                              isToday(new Date(meeting.scheduled_at)) && !isHappeningNow && "bg-amber-50/50 dark:bg-amber-950/20"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "rounded-lg p-2",
                                isHappeningNow ? "bg-primary/20" : "bg-primary/10"
                              )}>
                                <Video className={cn(
                                  "h-4 w-4",
                                  isHappeningNow ? "text-primary animate-pulse" : "text-primary"
                                )} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{meeting.title}</p>
                                  {isHappeningNow && (
                                    <Badge variant="default" className="text-xs">Agora</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {meeting.client && <span>{formatClientDisplay(meeting.client)}</span>}
                                  {meeting.client && <span>•</span>}
                                  <span>{formatMeetingDate(meeting.scheduled_at)}</span>
                                  <span>•</span>
                                  <span>{meeting.duration_minutes}min</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {meeting.meeting_url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-1 h-3 w-3" />
                                    Entrar
                                  </a>
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações da reunião">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditMeeting(meeting)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenCompletion(meeting)}>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Concluir reunião
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleStatusChange(meeting.id, "no_show")}>
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                    Marcar como no-show
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleStatusChange(meeting.id, "cancelled")}>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancelar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteMeeting(meeting.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </GlowCard>

              {/* History */}
              {pastMeetings.length > 0 && (
                <GlowCard color="primary" intensity="subtle">
                  <CardHeader>
                    <CardTitle className="text-base">Histórico</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pastMeetings.map((meeting) => {
                        const config = MEETING_STATUS_CONFIG[meeting.status]
                        return (
                          <div
                            key={meeting.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
                            onClick={() => handleOpenCompletion(meeting)}
                          >
                            <div className="flex items-center gap-3">
                              <config.icon className={cn(
                                "h-4 w-4",
                                meeting.status === "completed" && "text-success",
                                meeting.status === "no_show" && "text-destructive",
                                meeting.status === "cancelled" && "text-muted-foreground"
                              )} />
                              <div>
                                <p className="text-sm font-medium">{meeting.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {meeting.client && `${formatClientDisplay(meeting.client)} • `}
                                  {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </GlowCard>
              )}
            </div>
          ) : (
            <div className="h-[calc(100vh-340px)]">
              <MeetingCalendar
                meetings={filteredMeetings}
                onMeetingClick={handleEditMeeting}
                onSlotClick={handleSlotClick}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}
        </div>
      </div>

      <MeetingDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        meeting={editingMeeting as Parameters<typeof MeetingDialog>[0]["meeting"]}
        clients={clients}
        members={members}
        initialDate={initialDate}
      />

      {completionMeeting && (
        <MeetingCompletionDialog
          open={!!completionMeeting}
          onClose={handleCompletionClose}
          onSuccess={handleCompletionSuccess}
          meeting={completionMeeting}
        />
      )}
    </>
  )
}
