"use client"

import { useState, useMemo, useEffect } from "react"
import {
  isToday,
  isFuture,
  isPast,
  isTomorrow,
  isThisWeek,
  isThisMonth,
  parseISO,
  format,
  formatDistanceToNow,
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
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { GoogleSyncBadge, MeetingJoinButton } from "@/components/meetings/google-sync-badge"
import { RsvpSummary } from "@/components/meetings/participant-rsvp-status"
import { AlertBanner } from "@/components/ui/alert-banner"
import { useGoogleCalendarStatus } from "@/lib/hooks/use-api-data"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  hasGoogleCalendar?: boolean
  lastSyncedAt?: string | null
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
  meetings: initialMeetings,
  clients,
  members,
  hasGoogleCalendar = false,
  lastSyncedAt,
}: MeetingsPageClientProps) {
  const calendarStatus = useGoogleCalendarStatus()
  const [localMeetings, setLocalMeetings] = useState<MeetingWithRelations[]>(initialMeetings)
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithRelations | null>(null)
  const [initialDate, setInitialDate] = useState<Date | undefined>()
  const [completionMeeting, setCompletionMeeting] = useState<MeetingWithRelations | null>(null)
  const [filters, setFilters] = useState<MeetingFiltersState>({
    status: "all",
    period: "all",
  })
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync server props → local state
  useEffect(() => {
    setLocalMeetings(initialMeetings)
  }, [initialMeetings])

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    return localMeetings.filter((m) => {
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
  }, [localMeetings, filters])

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

  const handleDialogSuccess = (newMeeting?: MeetingWithRelations) => {
    const wasEditing = !!editingMeeting
    handleDialogClose()

    if (newMeeting) {
      setLocalMeetings((prev) => {
        if (wasEditing) {
          return prev.map((m) => (m.id === newMeeting.id ? { ...m, ...newMeeting } : m))
        }
        return [newMeeting, ...prev]
      })
    }
  }

  const handleOpenCompletion = (meeting: MeetingWithRelations) => {
    setCompletionMeeting(meeting)
  }

  const handleCompletionClose = () => {
    setCompletionMeeting(null)
  }

  const handleCompletionSuccess = () => {
    const completedId = completionMeeting?.id
    setCompletionMeeting(null)
    if (completedId) {
      setLocalMeetings((prev) =>
        prev.map((m) => (m.id === completedId ? { ...m, status: "completed" as const } : m))
      )
    }
  }

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta reunião?")) return
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast({ title: "Reunião excluída" })
      setLocalMeetings((prev) => prev.filter((m) => m.id !== meetingId))
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
      setLocalMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, status: newStatus } : m))
      )
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

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/integrations/google/sync", { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao sincronizar")
      }
      toast({
        title: "Sincronizacao iniciada",
        description: "Os dados do Google Calendar serao atualizados em instantes",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao sincronizar",
        description: error instanceof Error ? error.message : "Tente novamente mais tarde",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const now = new Date()

  return (
    <>
      <div className="space-y-4 h-full flex flex-col">
        {/* AC 42.7.6: Reconnection banner when Google Calendar is disconnected or has error */}
        {calendarStatus.connected && !calendarStatus.isActive && !calendarStatus.isLoading && (
          <AlertBanner
            variant="warning"
            title="Seu Google Calendar esta desconectado"
            description={calendarStatus.syncError || "Reconecte para sincronizar reunioes."}
            action={{
              label: "Reconectar",
              href: "/api/integrations/google/authorize?scope=calendar&context=admin",
            }}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              Gerencie as reunioes com seus clientes
            </p>
            {/* AC 42.13.4: Last sync timestamp */}
            {hasGoogleCalendar && lastSyncedAt && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Sync: {formatDistanceToNow(new Date(lastSyncedAt), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Ultimo sync: {format(new Date(lastSyncedAt), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {hasGoogleCalendar && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={handleManualSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </Button>
            )}
          </div>
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
          <Card className="rounded-xl border pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Próximas</p>
                <p className="text-2xl font-bold">{upcomingMeetings.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Realizadas</p>
                <p className="text-2xl font-bold">
                  {filteredMeetings.filter((m) => m.status === "completed").length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border pt-6">
            <CardContent className="flex items-center gap-4">
              <div className="rounded-lg p-3 bg-amber-500/10">
                <Video className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hoje</p>
                <p className="text-2xl font-bold">{todayMeetings.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <MeetingFilters filters={filters} onFiltersChange={setFilters} />

        {/* Content */}
        <div className="flex-1 min-h-0">
          {viewMode === "list" ? (
            <div className="space-y-6 pb-6">
              {/* Upcoming */}
              <Card className="rounded-xl border">
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
                      <Button variant="ghost" onClick={handleNewMeeting}>
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
                                    <Badge variant="info" className="text-xs">Agora</Badge>
                                  )}
                                  <GoogleSyncBadge
                                    status={meeting.google_sync_status}
                                    error={meeting.google_sync_error}
                                    compact
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {meeting.client && <span>{formatClientDisplay(meeting.client)}</span>}
                                  {meeting.client && <span>•</span>}
                                  <span>{formatMeetingDate(meeting.scheduled_at)}</span>
                                  <span>•</span>
                                  <span>{meeting.duration_minutes}min</span>
                                  {meeting.participants && meeting.participants.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <RsvpSummary participants={meeting.participants} />
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <MeetingJoinButton
                                meetingUrl={meeting.meeting_url}
                                meetingUrlSource={meeting.meeting_url_source}
                              />
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
              </Card>

              {/* History */}
              {pastMeetings.length > 0 && (
                <Card className="rounded-xl border">
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
                                meeting.status === "completed" && "text-emerald-500",
                                meeting.status === "no_show" && "text-destructive",
                                meeting.status === "cancelled" && "text-muted-foreground"
                              )} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{meeting.title}</p>
                                  <GoogleSyncBadge
                                    status={meeting.google_sync_status}
                                    error={meeting.google_sync_error}
                                    compact
                                  />
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span>
                                    {meeting.client && `${formatClientDisplay(meeting.client)} • `}
                                    {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </span>
                                  {meeting.participants && meeting.participants.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <RsvpSummary participants={meeting.participants} />
                                    </>
                                  )}
                                </div>
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
        hasGoogleCalendar={hasGoogleCalendar}
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
