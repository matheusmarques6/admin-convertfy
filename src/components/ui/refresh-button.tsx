"use client"

import { RotateCw } from "lucide-react"
import { Icon } from "@/components/ui/icon"
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
  const iconPixels = size === "sm" ? 14 : 16
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
            <Icon icon={RotateCw} customSize={iconPixels} className={cn(isRefreshing && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
