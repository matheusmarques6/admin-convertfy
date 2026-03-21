"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Clock } from "lucide-react"
import { Icon } from "@/components/ui/icon"
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
      <Badge variant="neutral" showDot={false} className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/20 text-xs">
        <Icon icon={Check} customSize={12} className="mr-1" />
        Aceito
      </Badge>
    )
  }

  if (currentStatus === "declined") {
    return (
      <Badge variant="neutral" showDot={false} className="text-destructive border-destructive/30 bg-destructive/10 dark:bg-destructive/20 text-xs">
        <Icon icon={X} customSize={12} className="mr-1" />
        Recusado
      </Badge>
    )
  }

  if (currentStatus === "tentative") {
    return (
      <Badge variant="neutral" showDot={false} className="text-amber-500 border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/20 text-xs">
        <Icon icon={Clock} customSize={12} className="mr-1" />
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
        <Icon icon={Check} customSize={compact ? 14 : 12} className={compact ? "text-emerald-500" : "mr-1 text-emerald-500"} />
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
        <Icon icon={X} customSize={compact ? 14 : 12} className={compact ? "text-destructive" : "mr-1 text-destructive"} />
        {!compact && "Recusar"}
      </Button>
    </div>
  )
}
