"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TimeAgoProps {
  date: string | null
  className?: string
}

export function TimeAgo({ date, className }: TimeAgoProps) {
  if (!date) return null

  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000)

  let label: string
  if (isNaN(minutes) || minutes < 0) {
    label = "Atualizado agora"
  } else if (minutes < 1) {
    label = "Atualizado agora"
  } else if (minutes < 60) {
    label = `Atualizado ha ${minutes} min`
  } else {
    const hours = Math.floor(minutes / 60)
    label = `Atualizado ha ${hours}h`
  }

  const fullDate = new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className ?? "text-xs text-muted-foreground"}>
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{fullDate}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
