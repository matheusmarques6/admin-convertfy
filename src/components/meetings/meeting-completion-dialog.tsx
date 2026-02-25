"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CheckCircle, Video, Users, FileText, Clock } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/lib/hooks/use-toast"
import { MEETING_STATUS_CONFIG } from "@/lib/constants/board"
import type { Meeting, MeetingParticipant } from "@/types"

interface ClientInfo {
  id: string
  name: string
  company?: string
  stores?: string[]
}

interface UserProfile {
  id: string
  name: string
  email?: string
  avatar_url?: string
}

interface MeetingWithRelations extends Omit<Meeting, "client" | "user"> {
  client?: ClientInfo
  user?: UserProfile
  participants?: MeetingParticipant[]
}

interface MeetingCompletionDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  meeting: MeetingWithRelations
}

function getShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0]
}

export function MeetingCompletionDialog({
  open,
  onClose,
  onSuccess,
  meeting,
}: MeetingCompletionDialogProps) {
  const [completionNotes, setCompletionNotes] = useState(meeting.completion_notes || "")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isCompleted = meeting.status === "completed"
  const isReadOnly = isCompleted && !!meeting.completion_notes

  const clientDisplay = meeting.client
    ? meeting.client.stores?.[0]
      ? `${meeting.client.stores[0]} — ${getShortName(meeting.client.name)}`
      : getShortName(meeting.client.name)
    : null

  const nonOrganizerParticipants = (meeting.participants || []).filter(p => !p.is_organizer)

  async function handleComplete() {
    if (!completionNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Notas obrigatórias",
        description: "Adicione notas sobre o que foi discutido na reunião",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completion_notes: completionNotes.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao concluir")
      }

      toast({
        title: "Reunião concluída",
        description: "Notas salvas e visíveis para todos os participantes",
      })
      onSuccess()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao concluir reunião",
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
            {isReadOnly ? (
              <>
                <FileText className="h-5 w-5 text-primary" />
                Detalhes da Reunião
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Concluir Reunião
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly
              ? "Informações e notas da reunião concluída"
              : "Anexe informações sobre o que foi discutido"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Meeting info */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <span className="font-medium">{meeting.title}</span>
              {isCompleted && (
                <Badge variant="secondary" className="ml-auto">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {MEETING_STATUS_CONFIG.completed.label}
                </Badge>
              )}
            </div>

            {clientDisplay && (
              <p className="text-sm text-muted-foreground pl-6">
                {clientDisplay}
              </p>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground pl-6">
              <Clock className="h-3 w-3" />
              <span>
                {format(new Date(meeting.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
              <span>•</span>
              <span>{meeting.duration_minutes}min</span>
            </div>

            {meeting.completed_at && (
              <p className="text-xs text-muted-foreground pl-6">
                Concluída em {format(new Date(meeting.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>

          {/* Participants */}
          {nonOrganizerParticipants.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                Participantes
              </Label>
              <div className="flex flex-wrap gap-2">
                {nonOrganizerParticipants.map((p) => {
                  const name = p.profile?.name || p.org_member?.profile?.name || "Participante"
                  const avatar = p.profile?.avatar_url || p.org_member?.profile?.avatar_url
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-sm">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={avatar} />
                        <AvatarFallback className="text-[9px]">
                          {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{getShortName(name)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Completion notes */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notas de Conclusão {!isReadOnly && "*"}
            </Label>
            {isReadOnly ? (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm whitespace-pre-wrap">{meeting.completion_notes}</p>
              </div>
            ) : (
              <>
                <Textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Resuma o que foi discutido, decisões tomadas, próximos passos..."
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Estas notas serão visíveis para todos os participantes da reunião
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          {isReadOnly ? (
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Concluir e Salvar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
