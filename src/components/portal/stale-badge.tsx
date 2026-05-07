"use client"

import { Clock } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  PERIOD_FRESHNESS_THRESHOLDS,
  STALE_THRESHOLD_MULTIPLIER,
  isCachedPeriod,
} from "@/lib/shared/data-status"
import { formatElapsed } from "./stale-badge-helpers"

interface StaleBadgeProps {
  period: string
  lastFetchedAt?: string | null
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

// Re-export do helper pra compatibilidade com call-sites que importavam
// formatElapsed daqui.
export { formatElapsed }
