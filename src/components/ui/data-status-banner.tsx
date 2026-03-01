"use client"

import { AlertCircle, Clock, Loader2, Info } from "lucide-react"
import type { DataStatus } from "@/lib/shared/data-status"
import { getFreshnessLabel } from "@/hooks/use-data-status"
import { cn } from "@/lib/utils"

interface DataStatusBannerProps {
  status: DataStatus | undefined
  lastFetchedAt?: string | null
  isRefreshing?: boolean
  className?: string
}

const variants: Record<DataStatus, {
  icon: React.ReactNode
  color: string
}> = {
  loading: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  syncing: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  stale: {
    icon: <Clock className="h-4 w-4" />,
    color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    color: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  empty: {
    icon: <Info className="h-4 w-4" />,
    color: "bg-muted text-muted-foreground",
  },
  ready: {
    icon: null,
    color: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
}

function getMessage(
  status: DataStatus,
  lastFetchedAt: string | null | undefined,
  isRefreshing: boolean | undefined
): string | null {
  switch (status) {
    case "loading":
      return "Carregando dados..."
    case "syncing":
      return "Dados sendo sincronizados..."
    case "stale": {
      const parsed = lastFetchedAt ? new Date(lastFetchedAt) : null
      const label = getFreshnessLabel(parsed)
      return `${label}${isRefreshing ? " — atualizando..." : ""}`
    }
    case "error":
      return "Erro ao carregar dados. Tentando novamente..."
    case "empty":
      return "Nenhum dado disponivel para este periodo."
    case "ready":
      return isRefreshing ? "Atualizando dados em segundo plano..." : null
    default:
      return null
  }
}

export function DataStatusBanner({
  status,
  lastFetchedAt,
  isRefreshing,
  className,
}: DataStatusBannerProps) {
  if (!status) return null
  if (status === "ready" && !isRefreshing) return null

  const variant = variants[status]
  const message = getMessage(status, lastFetchedAt, isRefreshing)

  if (!message) return null

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
        variant.color,
        className
      )}
    >
      {variant.icon}
      <span>{message}</span>
    </div>
  )
}
