"use client"

import { useState } from "react"
import {
  CheckCircle,
  Clock,
  AlertCircle,
  CloudOff,
  RefreshCw,
  Video,
  ExternalLink,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import type { GoogleSyncStatus, MeetingUrlSource } from "@/types"

const SYNC_STATUS_CONFIG: Record<
  GoogleSyncStatus,
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  synced: { icon: CheckCircle, color: "text-green-500", label: "Sincronizado" },
  pending: { icon: Clock, color: "text-yellow-500", label: "Pendente" },
  error: { icon: AlertCircle, color: "text-red-500", label: "Erro de sync" },
  not_connected: { icon: CloudOff, color: "text-muted-foreground", label: "Nao conectado" },
}

interface GoogleSyncBadgeProps {
  status?: GoogleSyncStatus
  error?: string
  className?: string
  /** Compact mode shows only the icon, no text */
  compact?: boolean
}

export function GoogleSyncBadge({
  status,
  error,
  className,
  compact = false,
}: GoogleSyncBadgeProps) {
  if (!status) return null

  const config = SYNC_STATUS_CONFIG[status]
  if (!config) return null

  const Icon = config.icon
  const tooltipText = status === "error" && error ? error : config.label

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" showDot={false} className={cn("gap-1 cursor-default", className)}>
            <Icon className={cn("h-3 w-3", config.color)} />
            {!compact && <span className="text-xs">{config.label}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[250px] text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface MeetingJoinButtonProps {
  meetingUrl?: string
  meetingUrlSource?: MeetingUrlSource
  className?: string
  size?: "sm" | "default"
}

export function MeetingJoinButton({
  meetingUrl,
  meetingUrlSource,
  className,
  size = "sm",
}: MeetingJoinButtonProps) {
  if (!meetingUrl) return null

  const isGoogleMeet = meetingUrlSource === "google_meet"
  const Icon = isGoogleMeet ? Video : ExternalLink
  const label = isGoogleMeet ? "Entrar na reuniao" : "Entrar"

  return (
    <Button variant="secondary" size={size} className={className} asChild>
      <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
        <Icon className={cn("h-3 w-3", size === "sm" ? "mr-1" : "mr-2")} />
        {label}
      </a>
    </Button>
  )
}

interface RetrySyncButtonProps {
  meetingId: string
  syncStatus?: GoogleSyncStatus
  onSyncComplete?: () => void
  className?: string
}

export function RetrySyncButton({
  meetingId,
  syncStatus,
  onSyncComplete,
  className,
}: RetrySyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false)

  if (syncStatus !== "error") return null

  async function handleRetry() {
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_sync: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao sincronizar")
      }
      toast({
        title: "Sincronizacao solicitada",
        description: "A reuniao sera sincronizada com o Google Calendar",
      })
      onSyncComplete?.()
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

  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("gap-1", className)}
      onClick={handleRetry}
      disabled={isSyncing}
    >
      <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
      {isSyncing ? "Sincronizando..." : "Tentar sincronizar"}
    </Button>
  )
}
