"use client"

import { useState, useMemo, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
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
  // Calendar is now the default view (absorbs dashboard calendar)
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar")
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

  // Confirmação visual ao voltar do OAuth do Google Calendar (feito aqui,
  // não mais nas Configurações). Revalida o status e limpa os params.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const success = searchParams.get("success")
    const errorParam = searchParams.get("error")
    if (!success && !errorParam) return

    if (success === "google_calendar_connected") {
      toast({ title: "Google Calendar conectado", description: "Suas reuniões vão sincronizar com a sua agenda pessoal." })
    } else if (errorParam) {
      toast({ variant: "destructive", title: "Falha ao conectar", description: `Erro: ${errorParam}` })
    }
    calendarStatus.refresh()

    const params = new URLSearchParams(searchParams.toString())
    params.delete("success")
    params.delete("error")
    params.delete("settings")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, pathname])

  // Filter meetings
  const filteredMeetings = useMemo(() => {
    return localMeetings.filter((m) => {
      if (filters.status !== "all" && m.status !== filters.status) return false

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
        title: "Sincronização iniciada",
        description: "Os dados do Google Calendar serão atualizados em instantes",
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
        {/* Conectar Google Calendar (primeira vez) */}
        {!calendarStatus.connected && !calendarStatus.isLoading && (
          <AlertBanner
            variant="info"
            title="Conecte seu Google Calendar"
            description="Sincronize suas reuniões automaticamente com a sua agenda pessoal do Google."
            action={{
              label: "Conectar Google Calendar",
              href: "/api/integrations/google/authorize?scope=calendar&context=admin&return_to=%2Fadmin%2Fmeetings",
            }}
          />
        )}

        {/* Reconexão quando o token foi revogado */}
        {calendarStatus.connected && !calendarStatus.isActive && !calendarStatus.isLoading && (
          <AlertBanner
            variant="warning"
            title="Seu Google Calendar está desconectado"
            description={calendarStatus.syncError || "Reconecte para sincronizar reuniões."}
            action={{
              label: "Reconectar",
              href: "/api/integrations/google/authorize?scope=calendar&context=admin&return_to=%2Fadmin%2Fmeetings",
            }}
          />
        )}

        {/* Toolbar: SegmentedTabs + Sync + New Meeting */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <SegmentedTabs value={viewMode} onValueChange={(v) => setViewMode(v as "calendar" | "list")}>
              <SegmentedTabItem value="calendar">
                <Icon icon={Calendar} size={16} className="mr-1.5" />
                Calendário
              </SegmentedTabItem>
              <SegmentedTabItem value="list">
                <Icon icon={List} size={16} className="mr-1.5" />
                Lista
              </SegmentedTabItem>
            </SegmentedTabs>

            {/* Last sync timestamp */}
            {hasGoogleCalendar && lastSyncedAt && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon icon={Clock} size={16} />
                      <span>
                        Sync: {formatDistanceToNow(new Date(lastSyncedAt), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Último sync: {format(new Date(lastSyncedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
                <Icon icon={RefreshCw} size={16} className={cn(isSyncing && "animate-spin")} />
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </Button>
            )}
          </div>

          <Button onClick={handleNewMeeting}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Reunião
          </Button>
        </div>

        {/* Stats — DS v3.0: no icon-in-circle, naked inline icons */}
        <div className="grid gap-4 grid-cols-3">
          <div className="rounded-[8px] border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon={Calendar} size={16} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Próximas</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{upcomingMeetings.length}</p>
          </div>
          <div className="rounded-[8px] border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon={CheckCircle} size={16} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Realizadas</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {filteredMeetings.filter((m) => m.status === "completed").length}
            </p>
          </div>
          <div className="rounded-[8px] border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon={Video} size={16} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Hoje</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{todayMeetings.length}</p>
          </div>
        </div>

        {/* Filters */}
        <MeetingFilters filters={filters} onFiltersChange={setFilters} />

        {/* Content */}
        <div className="flex-1 min-h-0">
          {viewMode === "calendar" ? (
            <div className="h-[calc(100vh-380px)]">
              <MeetingCalendar
                meetings={filteredMeetings}
                onMeetingClick={handleEditMeeting}
                onSlotClick={handleSlotClick}
                onStatusChange={handleStatusChange}
                defaultView="week"
              />
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {/* Upcoming */}
              <Card className="rounded-[8px] border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Próximas Reuniões</CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingMeetings.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Icon icon={Video} customSize={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma reunião agendada</p>
                      <Button variant="ghost" size="sm" onClick={handleNewMeeting} className="mt-2">
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
                              "flex items-center justify-between p-4 rounded-[8px] border transition-colors",
                              isHappeningNow && "border-[#4E62D8] bg-[#EEF0FB] dark:border-[#7B8CEA] dark:bg-[#141C3D]",
                              isToday(new Date(meeting.scheduled_at)) && !isHappeningNow && "bg-[#FFFBEB] dark:bg-[#3B2506]/30"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Icon
                                icon={Video}
                                size={16}
                                className={cn(
                                  isHappeningNow ? "text-[#4E62D8] dark:text-[#7B8CEA]" : "text-muted-foreground"
                                )}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{meeting.title}</p>
                                  {isHappeningNow && (
                                    <Badge variant="info" className="text-[10px]">Agora</Badge>
                                  )}
                                  <GoogleSyncBadge
                                    status={meeting.google_sync_status}
                                    error={meeting.google_sync_error}
                                    compact
                                  />
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  {meeting.client && <span>{formatClientDisplay(meeting.client)}</span>}
                                  {meeting.client && <span>·</span>}
                                  <span>{formatMeetingDate(meeting.scheduled_at)}</span>
                                  <span>·</span>
                                  <span>{meeting.duration_minutes}min</span>
                                  {meeting.participants && meeting.participants.length > 0 && (
                                    <>
                                      <span>·</span>
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
                                  <Button variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="Ações da reunião">
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
                <Card className="rounded-[8px] border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Histórico</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pastMeetings.map((meeting) => {
                        const config = MEETING_STATUS_CONFIG[meeting.status]
                        return (
                          <div
                            key={meeting.id}
                            className="flex items-center justify-between p-3 rounded-[8px] bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
                            onClick={() => handleOpenCompletion(meeting)}
                          >
                            <div className="flex items-center gap-3">
                              <Icon
                                icon={config.icon}
                                size={16}
                                className={cn(
                                  meeting.status === "completed" && "text-[#065F46] dark:text-[#6EE7B7]",
                                  meeting.status === "no_show" && "text-[#991B1B] dark:text-[#FCA5A5]",
                                  meeting.status === "cancelled" && "text-muted-foreground"
                                )}
                              />
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
                                    {meeting.client && `${formatClientDisplay(meeting.client)} · `}
                                    {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </span>
                                  {meeting.participants && meeting.participants.length > 0 && (
                                    <>
                                      <span>·</span>
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
