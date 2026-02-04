"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/lib/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"

// Partial client type for the select dropdown
interface ClientOption {
  id: string
  name: string
  company?: string | null
  status: string
}

const meetingSchema = z.object({
  client_id: z.string().min(1, "Selecione um cliente"),
  title: z.string().min(2, "Título deve ter pelo menos 2 caracteres"),
  scheduled_at: z.string().min(1, "Selecione uma data e hora"),
  duration_minutes: z.number().min(15, "Duração mínima de 15 minutos").max(480, "Duração máxima de 8 horas"),
  meeting_url: z.string().url("URL inválida").optional().or(z.literal("")),
  notes: z.string().optional(),
})

type MeetingForm = z.infer<typeof meetingSchema>

export default function NewMeetingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdParam = searchParams.get("clientId")

  const [clients, setClients] = useState<ClientOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingClients, setIsFetchingClients] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MeetingForm>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      client_id: clientIdParam || "",
      duration_minutes: 60,
    },
  })

  const selectedClientId = watch("client_id")

  useEffect(() => {
    async function fetchClients() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, company, status")
          .in("status", ["active", "onboarding", "prospect"])
          .order("name")

        if (error) throw error

        setClients(data || [])
      } catch (error) {
        console.error("Error fetching clients:", error)
        toast({
          variant: "destructive",
          title: "Erro ao carregar clientes",
          description: "Tente novamente mais tarde.",
        })
      } finally {
        setIsFetchingClients(false)
      }
    }

    fetchClients()
  }, [])

  async function onSubmit(data: MeetingForm) {
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from("meetings")
        .insert({
          client_id: data.client_id,
          user_id: user?.id,
          title: data.title,
          scheduled_at: new Date(data.scheduled_at).toISOString(),
          duration_minutes: data.duration_minutes,
          meeting_url: data.meeting_url || null,
          notes: data.notes || null,
          status: "scheduled",
        })
        .select()
        .single()

      if (error) throw error

      // Create activity
      await supabase.from("activities").insert({
        client_id: data.client_id,
        user_id: user?.id,
        type: "meeting_scheduled",
        description: `Reunião "${data.title}" foi agendada`,
      })

      toast({
        title: "Reunião agendada!",
        description: "A reunião foi agendada com sucesso.",
      })

      router.push("/meetings")
      router.refresh()
    } catch (error) {
      console.error("Error creating meeting:", error)
      toast({
        variant: "destructive",
        title: "Erro ao agendar reunião",
        description: "Tente novamente mais tarde.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Get minimum datetime (now + 1 hour)
  const minDateTime = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)

  if (isFetchingClients) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/meetings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Agendar Reunião</h1>
          <p className="text-muted-foreground">
            Agende uma nova reunião com um cliente
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Reunião</CardTitle>
            <CardDescription>
              Preencha as informações da reunião
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client Selection */}
            <div className="space-y-2">
              <Label htmlFor="client_id">Cliente *</Label>
              <Select
                value={selectedClientId}
                onValueChange={(value) => setValue("client_id", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                      {client.company && ` (${client.company})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.client_id && (
                <p className="text-sm text-destructive">{errors.client_id.message}</p>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Título da Reunião *</Label>
              <Input
                id="title"
                placeholder="Ex: Apresentação de resultados"
                {...register("title")}
                disabled={isLoading}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Date/Time and Duration */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduled_at">Data e Hora *</Label>
                <Input
                  id="scheduled_at"
                  type="datetime-local"
                  min={minDateTime}
                  {...register("scheduled_at")}
                  disabled={isLoading}
                />
                {errors.scheduled_at && (
                  <p className="text-sm text-destructive">{errors.scheduled_at.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Duração</Label>
                <Select
                  defaultValue="60"
                  onValueChange={(value) => setValue("duration_minutes", parseInt(value))}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1 hora 30 min</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Meeting URL */}
            <div className="space-y-2">
              <Label htmlFor="meeting_url">Link da Reunião</Label>
              <Input
                id="meeting_url"
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                {...register("meeting_url")}
                disabled={isLoading}
              />
              {errors.meeting_url && (
                <p className="text-sm text-destructive">{errors.meeting_url.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Google Meet, Zoom, Teams ou outro link de videoconferência
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Pauta da reunião, tópicos a discutir..."
                rows={3}
                {...register("notes")}
                disabled={isLoading}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" asChild disabled={isLoading}>
                <Link href="/meetings">Cancelar</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agendar Reunião
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
