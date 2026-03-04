"use client"

import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getFreshnessLabel } from "@/hooks/use-data-status"
import { cn } from "@/lib/utils"

interface RefreshButtonProps {
  onRefresh: () => void
  isRefreshing: boolean
  lastFetchedAt: Date | null
  size?: "sm" | "md"
  className?: string
}

export function RefreshButton({
  onRefresh,
  isRefreshing,
  lastFetchedAt,
  size = "md",
  className,
}: RefreshButtonProps) {
  const sizeClasses = size === "sm" ? "h-8 w-8" : "h-9 w-9"
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
  const tooltipLabel = lastFetchedAt
    ? `Ultimo sync: ${getFreshnessLabel(lastFetchedAt)}`
    : "Nenhum sync realizado"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(sizeClasses, className)}
          >
            <RotateCw
              className={cn(iconSize, isRefreshing && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
