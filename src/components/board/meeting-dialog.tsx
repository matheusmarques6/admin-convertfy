"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Clock, Video, Link as LinkIcon, Users, X, Globe, AlertTriangle, ExternalLink } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { MEETING_DURATION_OPTIONS, MEETING_STATUS_OPTIONS } from "@/lib/constants/board"
import { GoogleSyncBadge, MeetingJoinButton, RetrySyncButton } from "@/components/meetings/google-sync-badge"
import { ParticipantRsvpStatus } from "@/components/meetings/participant-rsvp-status"
import type { Meeting, MeetingStatus, MeetingParticipant, MeetingResponseStatus } from "@/types"

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

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "Brasilia (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Noronha (GMT-2)" },
]

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "America/Sao_Paulo"
  }
}

interface MeetingDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: (meeting?: MeetingWithRelations) => void
  meeting?: MeetingWithRelations | null
  clients: ClientInfo[]
  members?: ParticipantOption[]
  initialDate?: Date
  hasGoogleCalendar?: boolean
}

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  client_id: z.string().optional(),
  duration_minutes: z.number().min(5).max(480),
  meeting_url: z.string().url("URL inválida").optional().or(z.literal("")),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function getShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0]
}

const durationOptions = MEETING_DURATION_OPTIONS
const statusOptions = MEETING_STATUS_OPTIONS

export function MeetingDialog({
  open,
  onClose,
  onSuccess,
  meeting,
  clients,
  members = [],
  initialDate,
  hasGoogleCalendar = false,
}: MeetingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>()
  const [scheduledTime, setScheduledTime] = useState("09:00")
  const [status, setStatus] = useState<MeetingStatus>("scheduled")
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantOption[]>([])
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const [createGoogleMeet, setCreateGoogleMeet] = useState(hasGoogleCalendar)

  const isEditing = !!meeting

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      duration_minutes: 30,
    },
  })

  // Reset form when dialog opens/closes or meeting changes
  useEffect(() => {
    if (open) {
      if (meeting) {
        setValue("title", meeting.title)
        setValue("client_id", meeting.client_id || "")
        setValue("duration_minutes", meeting.duration_minutes)
        setValue("meeting_url", meeting.meeting_url || "")
        setValue("notes", meeting.notes || "")
        setStatus(meeting.status)
        setTimezone(meeting.timezone || getBrowserTimezone())
        setCreateGoogleMeet(hasGoogleCalendar && meeting.meeting_url_source === "google_meet")

        const date = new Date(meeting.scheduled_at)
        setScheduledDate(date)
        setScheduledTime(format(date, "HH:mm"))

        // Load existing participants (excluding organizer)
        if (meeting.participants) {
          const existingParticipants = meeting.participants
            .filter(p => !p.is_organizer)
            .map(p => {
              if (p.participant_type === "org_member" && p.org_member) {
                return {
                  id: p.participant_id,
                  name: p.org_member.profile?.name || "Membro",
                  email: p.org_member.profile?.email,
                  avatar_url: p.org_member.profile?.avatar_url,
                  type: "org_member" as const,
                }
              }
              return {
                id: p.participant_id,
                name: p.profile?.name || "Usuário",
                email: p.profile?.email,
                avatar_url: p.profile?.avatar_url,
                type: "profile" as const,
              }
            })
          setSelectedParticipants(existingParticipants)
        } else {
          setSelectedParticipants([])
        }
      } else {
        reset({
          title: "",
          client_id: "",
          duration_minutes: 30,
          meeting_url: "",
          notes: "",
        })
        setStatus("scheduled")
        setSelectedParticipants([])
        setTimezone(getBrowserTimezone())
        setCreateGoogleMeet(hasGoogleCalendar)
        if (initialDate) {
          setScheduledDate(initialDate)
          setScheduledTime(format(initialDate, "HH:mm"))
        } else {
          // Default to tomorrow at 9am
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          setScheduledDate(tomorrow)
          setScheduledTime("09:00")
        }
      }
    }
  }, [open, meeting, initialDate, setValue, reset, hasGoogleCalendar])

  async function onSubmit(data: FormData) {
    if (!scheduledDate) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Selecione uma data para a reunião",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Combine date and time
      const [hours, minutes] = scheduledTime.split(":").map(Number)
      const scheduledAt = new Date(scheduledDate)
      scheduledAt.setHours(hours, minutes, 0, 0)

      const url = isEditing ? `/api/meetings/${meeting.id}` : "/api/meetings"
      const method = isEditing ? "PUT" : "POST"

      const body = {
        title: data.title,
        client_id: data.client_id || null,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: data.duration_minutes,
        meeting_url: data.meeting_url || null,
        notes: data.notes || null,
        timezone,
        create_google_meet: createGoogleMeet,
        participants: selectedParticipants.map(p => ({ id: p.id, type: p.type })),
        ...(isEditing ? { status } : {}),
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao salvar")
      }

      toast({
        title: isEditing ? "Reunião atualizada" : "Reunião agendada",
        description: result.message,
      })

      onSuccess(result.meeting)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar reunião",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon icon={Video} size={20} className="text-primary" />
            {isEditing ? "Editar Reunião" : "Agendar Reunião"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize os detalhes da reunião" : "Agende uma nova reunião"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            <div className="space-y-4 py-1">
              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  placeholder="Ex: Kickoff com Cliente X"
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Cliente</Label>
                <Select
                  value={watch("client_id") || "_none"}
                  onValueChange={(value) => setValue("client_id", value === "_none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {clients.map((client) => {
                      const storeName = client.stores?.[0]
                      const shortName = getShortName(client.name)
                      return (
                        <SelectItem key={client.id} value={client.id}>
                          {storeName ? (
                            <span>
                              <span className="font-semibold">{storeName}</span>
                              {" — "}
                              {shortName}
                            </span>
                          ) : (
                            shortName
                          )}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Participants Multi-select */}
              {members.length > 0 && (
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Icon icon={Users} size={16} />
                    Participantes
                  </Label>

                  {/* Selected participants badges */}
                  {selectedParticipants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedParticipants.map((participant) => {
                        // Find original participant data to get google_rsvp_status
                        const originalParticipant = meeting?.participants?.find(
                          p => p.participant_id === participant.id && p.participant_type === participant.type
                        )
                        return (
                          <Badge
                            key={`${participant.type}-${participant.id}`}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={participant.avatar_url} />
                              <AvatarFallback className="text-[8px]">
                                {participant.name?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="max-w-[100px] truncate">{participant.name}</span>
                            {originalParticipant?.google_rsvp_status && (
                              <ParticipantRsvpStatus
                                localStatus={originalParticipant.response_status as MeetingResponseStatus}
                                googleStatus={originalParticipant.google_rsvp_status}
                                compact
                              />
                            )}
                            <Icon
                              icon={X}
                              customSize={12}
                              className="cursor-pointer hover:text-destructive"
                              onClick={() => {
                                setSelectedParticipants(prev =>
                                  prev.filter(p => !(p.id === participant.id && p.type === participant.type))
                                )
                              }}
                            />
                          </Badge>
                        )
                      })}
                    </div>
                  )}

                  {/* Member list with checkboxes */}
                  <div className="border rounded-md">
                    <ScrollArea className="h-[120px]">
                      <div className="p-2 space-y-1">
                        {members.map((member) => {
                          const isSelected = selectedParticipants.some(
                            p => p.id === member.id && p.type === member.type
                          )
                          return (
                            <label
                              key={`${member.type}-${member.id}`}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedParticipants(prev => [...prev, member])
                                  } else {
                                    setSelectedParticipants(prev =>
                                      prev.filter(p => !(p.id === member.id && p.type === member.type))
                                    )
                                  }
                                }}
                              />
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={member.avatar_url} />
                                <AvatarFallback className="text-xs">
                                  {member.name?.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-sm truncate">{member.name}</span>
                                {member.email && (
                                  <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                                )}
                              </div>
                              {member.type === "org_member" && member.role && (
                                <Badge variant="neutral" showDot={false} className="text-[10px] shrink-0">
                                  {member.role}
                                </Badge>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Membros selecionados verão a reunião em seus calendários
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !scheduledDate && "text-muted-foreground"
                        )}
                      >
                        <Icon icon={CalendarIcon} size={16} className="mr-2" />
                        {scheduledDate ? format(scheduledDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={setScheduledDate}
                        locale={ptBR}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid gap-2">
                  <Label>Horário *</Label>
                  <div className="relative">
                    <Icon icon={Clock} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Duração</Label>
                <Select
                  value={String(watch("duration_minutes"))}
                  onValueChange={(value) => setValue("duration_minutes", Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Google Meet checkbox */}
              {hasGoogleCalendar && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Checkbox
                    id="create_google_meet"
                    checked={createGoogleMeet}
                    onCheckedChange={(checked) => setCreateGoogleMeet(!!checked)}
                  />
                  <label htmlFor="create_google_meet" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Icon icon={Video} size={16} className="text-primary" />
                      <span className="text-sm font-medium">Criar Google Meet automaticamente</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Um link do Google Meet sera gerado e a reuniao sincronizada com o Calendar
                    </p>
                  </label>
                </div>
              )}

              {/* AC 42.7.7: Inline alert when Google Calendar is not connected */}
              {!hasGoogleCalendar && (
                <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <Icon icon={AlertTriangle} size={16} className="mt-0.5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Conecte seu Google Calendar para criar reunioes com Meet automatico
                    </p>
                    <a
                      href="/admin/settings/integrations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300 hover:underline mt-1"
                    >
                      <Icon icon={ExternalLink} customSize={12} />
                      Conectar agora
                    </a>
                  </div>
                </div>
              )}

              {/* Sync status when editing */}
              {isEditing && meeting?.google_sync_status && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <GoogleSyncBadge
                    status={meeting.google_sync_status}
                    error={meeting.google_sync_error}
                  />
                  {meeting.meeting_url && meeting.meeting_url_source === "google_meet" && (
                    <MeetingJoinButton
                      meetingUrl={meeting.meeting_url}
                      meetingUrlSource={meeting.meeting_url_source}
                      size="sm"
                    />
                  )}
                  <RetrySyncButton
                    meetingId={meeting.id}
                    syncStatus={meeting.google_sync_status}
                    className="ml-auto"
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Icon icon={LinkIcon} size={16} />
                  Link da Reuniao
                </Label>
                <Input
                  placeholder="https://meet.google.com/xxx ou https://zoom.us/j/xxx"
                  {...register("meeting_url")}
                  disabled={createGoogleMeet}
                />
                {createGoogleMeet && (
                  <p className="text-xs text-muted-foreground">
                    O link sera gerado automaticamente pelo Google Meet
                  </p>
                )}
                {errors.meeting_url && (
                  <p className="text-sm text-destructive">{errors.meeting_url.message}</p>
                )}
              </div>

              {/* Timezone */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Icon icon={Globe} size={16} />
                  Fuso horario
                </Label>
                <Select
                  value={timezone}
                  onValueChange={setTimezone}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fuso horario" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Notas</Label>
                <Textarea
                  placeholder="Pauta, observações, etc..."
                  rows={2}
                  {...register("notes")}
                />
              </div>

              {isEditing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as MeetingStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : isEditing ? "Salvar" : "Agendar Reunião"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
