"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Clock, Video, Link as LinkIcon } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { Meeting, MeetingStatus } from "@/types"

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

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: ClientInfo
  user?: UserProfile
}

interface MeetingDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  meeting?: MeetingWithRelations | null
  clients: ClientInfo[]
}

const schema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  client_id: z.string().optional(),
  duration_minutes: z.number().min(5).max(480),
  meeting_url: z.string().url("URL inválida").optional().or(z.literal("")),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const durationOptions = [
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h 30min" },
  { value: 120, label: "2 horas" },
]

const statusOptions: { value: MeetingStatus; label: string }[] = [
  { value: "scheduled", label: "Agendada" },
  { value: "completed", label: "Realizada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "Não Compareceu" },
]

export function MeetingDialog({
  open,
  onClose,
  onSuccess,
  meeting,
  clients,
}: MeetingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>()
  const [scheduledTime, setScheduledTime] = useState("09:00")
  const [status, setStatus] = useState<MeetingStatus>("scheduled")

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
      } else {
        reset({
          title: "",
          client_id: "",
          duration_minutes: 30,
          meeting_url: "",
          notes: "",
        })
        setStatus("scheduled")
        // Default to tomorrow at 9am
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setScheduledDate(tomorrow)
        setScheduledTime("09:00")
      }
    }
  }, [open, meeting, setValue, reset])

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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              rows={3}
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
