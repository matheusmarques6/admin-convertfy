"use client"

import { useState } from "react"
import { format, isToday, isTomorrow, isPast, isFuture } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Plus,
  Video,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MeetingDialog } from "./meeting-dialog"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import { MEETING_STATUS_CONFIG } from "@/lib/constants/board"
import type { Meeting, MeetingStatus, MeetingParticipant } from "@/types"

interface UserProfile {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface ClientInfo {
  id: string
  name: string
  company?: string
  stores?: string[]
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

interface MeetingsTabProps {
  meetings: MeetingWithRelations[]
  clients: ClientInfo[]
  members?: ParticipantOption[]
  onMeetingChange?: React.Dispatch<React.SetStateAction<MeetingWithRelations[]>>
}

const statusConfig = MEETING_STATUS_CONFIG

function formatMeetingDate(date: string) {
  const d = new Date(date)
  if (isToday(d)) return `Hoje, ${format(d, "HH:mm")}`
  if (isTomorrow(d)) return `Amanhã, ${format(d, "HH:mm")}`
  return format(d, "dd/MM 'às' HH:mm", { locale: ptBR })
}

export function MeetingsTab({ meetings, clients, members = [], onMeetingChange }: MeetingsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithRelations | null>(null)

  const now = new Date()

  // Separate meetings
  const upcomingMeetings = meetings
    .filter((m) => m.status === "scheduled" && isFuture(new Date(m.scheduled_at)))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const todayMeetings = upcomingMeetings.filter((m) => isToday(new Date(m.scheduled_at)))

  const pastMeetings = meetings
    .filter((m) => m.status !== "scheduled" || isPast(new Date(m.scheduled_at)))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 10)

  const handleNewMeeting = () => {
    setEditingMeeting(null)
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

    if (newMeeting && onMeetingChange) {
      onMeetingChange((prev) => {
        if (wasEditing) {
          return prev.map((m) => (m.id === newMeeting.id ? { ...m, ...newMeeting } : m))
        }
        return [newMeeting, ...prev]
      })
    }
  }

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta reunião?")) return

    try {
      const response = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Erro ao excluir")

      toast({ title: "Reunião excluída" })
      if (onMeetingChange) {
        onMeetingChange((prev) => prev.filter((m) => m.id !== meetingId))
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir reunião" })
    }
  }

  const handleStatusChange = async (meetingId: string, newStatus: MeetingStatus) => {
    try {
      const response = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error("Erro ao atualizar")

      toast({ title: "Status atualizado" })
      if (onMeetingChange) {
        onMeetingChange((prev) =>
          prev.map((m) => (m.id === meetingId ? { ...m, status: newStatus } : m))
        )
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao atualizar status" })
    }
  }

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="space-y-6 pb-6">
          {/* Header com botão de nova reunião */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Reuniões</h2>
              <p className="text-sm text-muted-foreground">
                {upcomingMeetings.length} reuniões agendadas
                {todayMeetings.length > 0 && ` (${todayMeetings.length} hoje)`}
              </p>
            </div>
            <Button onClick={handleNewMeeting}>
              <Icon icon={Plus} size={16} className="mr-2" />
              Nova Reunião
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="rounded-xl border bg-card">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-3 bg-primary/10">
                  <Icon icon={Calendar} size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Próximas</p>
                  <p className="text-2xl font-bold">{upcomingMeetings.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-3 bg-emerald-500/10">
                  <Icon icon={CheckCircle} size={20} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Realizadas</p>
                  <p className="text-2xl font-bold">
                    {meetings.filter((m) => m.status === "completed").length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-lg p-3 bg-amber-500/10">
                  <Icon icon={Video} size={20} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hoje</p>
                  <p className="text-2xl font-bold">{todayMeetings.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Meetings */}
          <Card className="rounded-xl border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon icon={Calendar} size={20} className="text-primary" />
                Próximas Reuniões
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingMeetings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon icon={Video} customSize={40} className="mx-auto mb-2 opacity-50" />
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
                          isToday(new Date(meeting.scheduled_at)) && !isHappeningNow && "bg-warning/5 dark:bg-warning/10"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "rounded-lg p-2",
                            isHappeningNow ? "bg-primary/20" : "bg-primary/10"
                          )}>
                            <Icon icon={Video} size={16} className={cn(
                              isHappeningNow ? "text-primary animate-pulse" : "text-primary"
                            )} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{meeting.title}</p>
                              {isHappeningNow && (
                                <Badge variant="info" className="text-xs">
                                  Agora
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {meeting.client && (
                                <span>{formatClientDisplay(meeting.client)}</span>
                              )}
                              {meeting.client && <span>•</span>}
                              <span>{formatMeetingDate(meeting.scheduled_at)}</span>
                              <span>•</span>
                              <span>{meeting.duration_minutes}min</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {meeting.meeting_url && (
                            <Button variant="secondary" size="sm" asChild>
                              <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer">
                                <Icon icon={ExternalLink} customSize={12} className="mr-1" />
                                Entrar
                              </a>
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Icon icon={MoreHorizontal} size={16} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditMeeting(meeting)}>
                                <Icon icon={Pencil} size={16} className="mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(meeting.id, "completed")}>
                                <Icon icon={CheckCircle} size={16} className="mr-2" />
                                Marcar como realizada
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(meeting.id, "no_show")}>
                                <Icon icon={AlertCircle} size={16} className="mr-2" />
                                Marcar como no-show
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleStatusChange(meeting.id, "cancelled")}>
                                <Icon icon={XCircle} size={16} className="mr-2" />
                                Cancelar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteMeeting(meeting.id)}
                                className="text-destructive"
                              >
                                <Icon icon={Trash2} size={16} className="mr-2" />
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

          {/* Past Meetings */}
          {pastMeetings.length > 0 && (
            <Card className="rounded-xl border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Histórico</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pastMeetings.map((meeting) => {
                    const config = statusConfig[meeting.status]
                    return (
                      <div
                        key={meeting.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
                        onClick={() => handleEditMeeting(meeting)}
                      >
                        <div className="flex items-center gap-3">
                          <Icon icon={config.icon} size={16} className={cn(
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
            </Card>
          )}
        </div>
      </div>

      <MeetingDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        meeting={editingMeeting}
        clients={clients}
        members={members}
      />
    </>
  )
}
