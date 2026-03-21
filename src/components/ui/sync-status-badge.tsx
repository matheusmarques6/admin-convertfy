"use client"

import { AlertTriangle, Clock } from "lucide-react"
import { Icon } from "@/components/ui/icon"

export const PARTIAL_DATA_TOOLTIP = "Algumas lojas tiveram erro na ultima sincronizacao. Os dados podem estar incompletos."
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface SyncStatusBadgeProps {
  /** Known statuses: ok, pending, partial, error. Unknown values fall through to error badge. */
  status: 'ok' | 'pending' | 'partial' | 'error' | (string & {})
  compact?: boolean
}

export function SyncStatusBadge({ status, compact = false }: SyncStatusBadgeProps) {
  if (status === "ok") return null

  if (status === "pending") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral" showDot={false} className="text-muted-foreground gap-1">
              <Icon icon={Clock} customSize={12} />
              {!compact && "Aguardando"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Aguardando primeira sincronizacao</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (status === "partial") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral" showDot={false} className="text-yellow-600 dark:text-yellow-400 border-yellow-600/30 dark:border-yellow-400/30 gap-1">
              <Icon icon={AlertTriangle} customSize={12} />
              {!compact && "Dados parciais"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{PARTIAL_DATA_TOOLTIP}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // error
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" showDot={false} className="text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {!compact && "Erro sync"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Erro na sincronizacao. Revenue pode estar desatualizado.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
