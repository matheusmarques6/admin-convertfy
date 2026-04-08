"use client"

import { Clock, Info } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface RateLimitBannerProps {
  /** Response has rateLimited: true and fromCache: true */
  fromCache: boolean
  /** ISO timestamp of when the cache was fetched */
  fetchedAt?: string
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} minuto${minutes !== 1 ? "s" : ""}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hora${hours !== 1 ? "s" : ""}`
  const days = Math.floor(hours / 24)
  return `${days} dia${days !== 1 ? "s" : ""}`
}

/**
 * Banner shown when Klaviyo API is rate-limited.
 *
 * - fromCache=true: shows warning with timestamp (data is from cache)
 * - fromCache=false: shows info that data is temporarily unavailable
 */
export function RateLimitBanner({ fromCache, fetchedAt }: RateLimitBannerProps) {
  if (fromCache && fetchedAt) {
    return (
      <Alert variant="warning" className="mb-4">
        <Icon icon={Clock} size={16} />
        <AlertDescription>
          {"Exibindo dados de "}{formatTimeAgo(fetchedAt)}{" atr\u00e1s. A Klaviyo est\u00e1 temporariamente limitando requisi\u00e7\u00f5es. Os dados ser\u00e3o atualizados automaticamente."}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="mb-4 border-muted-foreground/30 bg-muted/50">
      <Icon icon={Info} size={16} />
      <AlertDescription>
        {"N\u00e3o foi poss\u00edvel carregar dados devido a uma limita\u00e7\u00e3o da Klaviyo. Assim que normalizar, os dados estar\u00e3o dispon\u00edveis."}
      </AlertDescription>
    </Alert>
  )
}
