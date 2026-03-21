"use client"

import {
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { MeetingResponseStatus } from "@/types"

type GoogleRsvpStatus = "accepted" | "declined" | "tentative" | "needsAction"

const GOOGLE_RSVP_CONFIG: Record<
  GoogleRsvpStatus,
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  accepted: { icon: CheckCircle, color: "text-green-500", label: "Confirmado" },
  declined: { icon: XCircle, color: "text-red-500", label: "Recusou" },
  tentative: { icon: HelpCircle, color: "text-yellow-500", label: "Talvez" },
  needsAction: { icon: Clock, color: "text-muted-foreground", label: "Aguardando resposta" },
}

const LOCAL_STATUS_LABELS: Record<MeetingResponseStatus, string> = {
  accepted: "Aceito",
  declined: "Recusado",
  tentative: "Talvez",
  pending: "Pendente",
}

function isGoogleRsvpStatus(s: string): s is GoogleRsvpStatus {
  return s === "accepted" || s === "declined" || s === "tentative" || s === "needsAction"
}

/**
 * Maps local response_status to the equivalent Google status key for divergence comparison.
 * Local "pending" maps to Google "needsAction".
 */
function localToGoogleEquivalent(local: MeetingResponseStatus): GoogleRsvpStatus {
  if (local === "pending") return "needsAction"
  return local as GoogleRsvpStatus
}

interface ParticipantRsvpStatusProps {
  localStatus: MeetingResponseStatus
  googleStatus?: string | null
  /** Compact mode: show only the Google icon, no local badge */
  compact?: boolean
  className?: string
}

/**
 * AC 42.13.1 + AC 42.13.2 + AC 42.13.3
 *
 * Shows RSVP status for a participant:
 * - Local response_status as a badge
 * - Google RSVP icon when available
 * - Divergence highlight (yellow border) when they differ
 */
export function ParticipantRsvpStatus({
  localStatus,
  googleStatus,
  compact = false,
  className,
}: ParticipantRsvpStatusProps) {
  const googleConfig = googleStatus && isGoogleRsvpStatus(googleStatus)
    ? GOOGLE_RSVP_CONFIG[googleStatus]
    : null

  const isDivergent = googleConfig
    ? localToGoogleEquivalent(localStatus) !== googleStatus
    : false

  const GoogleIcon = googleConfig?.icon

  if (compact) {
    // Compact: only show Google icon if available, otherwise nothing
    if (!googleConfig || !GoogleIcon) return null

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <GoogleIcon className={cn("h-3.5 w-3.5 shrink-0", googleConfig.color, className)} />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Google Calendar: {googleConfig.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Google RSVP badge — only when present */}
      {googleConfig && GoogleIcon && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className={cn(
                  "gap-1 cursor-default text-xs px-1.5 py-0",
                  isDivergent && "border-yellow-500/60 bg-yellow-500/5"
                )}
              >
                <GoogleIcon className={cn("h-3 w-3", googleConfig.color)} />
                <span className="hidden sm:inline">{googleConfig.label}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[220px]">
                {isDivergent
                  ? `RSVP local: ${LOCAL_STATUS_LABELS[localStatus]} | Google Calendar: ${googleConfig.label}`
                  : `Google Calendar: ${googleConfig.label}`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

interface RsvpSummaryProps {
  participants: Array<{
    google_rsvp_status?: string | null
    is_organizer?: boolean
  }>
  className?: string
}

/**
 * Compact RSVP summary for meeting cards: "3/5 confirmados"
 * Shows a warning if someone declined.
 */
export function RsvpSummary({ participants, className }: RsvpSummaryProps) {
  const nonOrganizers = participants.filter(p => !p.is_organizer)

  // Only show if at least one participant has google_rsvp_status
  const withGoogle = nonOrganizers.filter(p =>
    p.google_rsvp_status && isGoogleRsvpStatus(p.google_rsvp_status)
  )

  if (withGoogle.length === 0) return null

  const accepted = withGoogle.filter(p => p.google_rsvp_status === "accepted").length
  const declined = withGoogle.filter(p => p.google_rsvp_status === "declined").length
  const total = nonOrganizers.length

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              declined > 0 ? "text-red-500" : "text-muted-foreground",
              className
            )}
          >
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>{accepted}/{total}</span>
            {declined > 0 && (
              <>
                <XCircle className="h-3 w-3 text-red-500 ml-0.5" />
                <span>{declined}</span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {accepted} confirmado{accepted !== 1 ? "s" : ""} de {total} participante{total !== 1 ? "s" : ""}
            {declined > 0 && ` | ${declined} recusou`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
