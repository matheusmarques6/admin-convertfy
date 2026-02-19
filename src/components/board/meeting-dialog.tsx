"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Clock, Video, Link as LinkIcon, Users, X } from "lucide-react"
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

interface MeetingDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  meeting?: MeetingWithRelations | null
  clients: ClientInfo[]
  members?: ParticipantOption[]
  initialDate?: Date
}

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  client_id: z.string().optional(),
  duration_minutes: z.number().min(5).max(480),
  meeting_url: z.string().url("URL inválida").optional().or(z.literal("")),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

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
}: MeetingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>()
  const [scheduledTime, setScheduledTime] = useState("09:00")
  const [status, setStatus] = useState<MeetingStatus>("scheduled")
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantOption[]>([])

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
  }, [open, meeting, initialDate, setValue, reset])

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

      onSuccess()
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
            <Video className="h-5 w-5 text-primary" />
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
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} {client.company && `(${client.company})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Participants Multi-select */}
              {members.length > 0 && (
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Participantes
                  </Label>

                  {/* Selected participants badges */}
                  {selectedParticipants.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {selectedParticipants.map((participant) => (
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
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-destructive"
                            onClick={() => {
                              setSelectedParticipants(prev =>
                                prev.filter(p => !(p.id === participant.id && p.type === participant.type))
                              )
                            }}
                          />
                        </Badge>
                      ))}
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
                                <Badge variant="outline" className="text-[10px] shrink-0">
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
                        <CalendarIcon className="mr-2 h-4 w-4" />
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
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Link da Reunião
                </Label>
                <Input
                  placeholder="https://meet.google.com/xxx ou https://zoom.us/j/xxx"
                  {...register("meeting_url")}
                />
                {errors.meeting_url && (
                  <p className="text-sm text-destructive">{errors.meeting_url.message}</p>
                )}
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
