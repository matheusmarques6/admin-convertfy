"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/hooks/use-toast"
import type { MeetingResponseStatus } from "@/types"

interface MeetingInviteActionsProps {
  participantId: string
  meetingId: string
  currentStatus: MeetingResponseStatus
  compact?: boolean
}

export function MeetingInviteActions({
  participantId,
  meetingId,
  currentStatus,
  compact = false,
}: MeetingInviteActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleResponse = async (status: MeetingResponseStatus) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_response: {
            participant_id: participantId,
            status,
          },
        }),
      })
      if (!res.ok) throw new Error()
      toast({
        title:
          status === "accepted"
            ? "Convite aceito"
            : status === "declined"
            ? "Convite recusado"
            : "Resposta enviada",
      })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao responder convite" })
    } finally {
      setIsLoading(false)
    }
  }

  if (currentStatus === "accepted") {
    return (
      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/20 text-xs">
        <Check className="mr-1 h-3 w-3" />
        Aceito
      </Badge>
    )
  }

  if (currentStatus === "declined") {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 dark:bg-destructive/20 text-xs">
        <X className="mr-1 h-3 w-3" />
        Recusado
      </Badge>
    )
  }

  if (currentStatus === "tentative") {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/20 text-xs">
        <Clock className="mr-1 h-3 w-3" />
        Talvez
      </Badge>
    )
  }

  // Pending — show action buttons
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-7 w-7" : "h-7 text-xs"}
        onClick={() => handleResponse("accepted")}
        disabled={isLoading}
        title="Aceitar"
      >
        <Check className={compact ? "h-3.5 w-3.5 text-emerald-500" : "mr-1 h-3 w-3 text-emerald-500"} />
        {!compact && "Aceitar"}
      </Button>
      <Button
        variant="outline"
        size={compact ? "icon" : "sm"}
        className={compact ? "h-7 w-7" : "h-7 text-xs"}
        onClick={() => handleResponse("declined")}
        disabled={isLoading}
        title="Recusar"
      >
        <X className={compact ? "h-3.5 w-3.5 text-destructive" : "mr-1 h-3 w-3 text-destructive"} />
        {!compact && "Recusar"}
      </Button>
    </div>
  )
}
