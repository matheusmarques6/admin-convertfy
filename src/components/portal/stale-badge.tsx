"use client"

import { Clock } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  PERIOD_FRESHNESS_THRESHOLDS,
  STALE_THRESHOLD_MULTIPLIER,
  isCachedPeriod,
} from "@/lib/shared/data-status"

interface StaleBadgeProps {
  period: string
  lastFetchedAt?: string | null
}

/**
 * Returns a human-readable "X horas" / "X minutos" label for elapsed time.
 */
function formatElapsed(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minutos`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${hours} horas`
  const days = Math.round(ms / 86_400_000)
  return `${days} dias`
}

/**
 * AK-14.3 — Subtle badge when cached data is older than 2x the
 * freshness threshold for the current period.
 */
export function StaleBadge({ period, lastFetchedAt }: StaleBadgeProps) {
  if (!lastFetchedAt) return null
  if (!isCachedPeriod(period)) return null

  const threshold = PERIOD_FRESHNESS_THRESHOLDS[period]
  const fetchedDate = new Date(lastFetchedAt)
  const elapsed = Date.now() - fetchedDate.getTime()

  if (elapsed < threshold * STALE_THRESHOLD_MULTIPLIER) return null

  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400"
    >
      <Icon icon={Clock} customSize={12} />
      <span>Dados atualizados ha {formatElapsed(elapsed)}</span>
    </div>
  )
}

export { formatElapsed }
