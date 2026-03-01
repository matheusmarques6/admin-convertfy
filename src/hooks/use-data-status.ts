import { useState, useEffect, useMemo } from "react"
import type { DataStatus, DataStatusMeta } from "@/lib/shared/data-status"

export interface UseDataStatusReturn {
  /** dataStatus === "loading" */
  isLoading: boolean
  /** dataStatus === "stale" */
  isStale: boolean
  /** dataStatus === "ready" */
  isReady: boolean
  /** dataStatus === "empty" */
  isEmpty: boolean
  /** dataStatus === "error" */
  isError: boolean
  /** dataStatus === "syncing" */
  isSyncing: boolean
  /** from meta */
  isRefreshing: boolean
  /** "cache" | "live" | "stale-cache" */
  source: string | null
  /** Parsed lastFetchedAt as Date */
  lastFetchedAt: Date | null
  /** Freshness label in Portuguese */
  freshness: string
  /** Raw status */
  status: DataStatus | undefined
}

/**
 * Calculates a human-readable freshness label in Portuguese.
 */
function getFreshnessLabel(fetchedAt: Date | null): string {
  if (!fetchedAt) return "Sincronizando..."
  const diff = Date.now() - fetchedAt.getTime()
  if (diff < 60_000) return "Atualizado agora"
  if (diff < 3_600_000) return `Atualizado ha ${Math.round(diff / 60_000)}min`
  if (diff < 86_400_000) return `Atualizado ha ${Math.round(diff / 3_600_000)}h`
  return `Dados de ${Math.round(diff / 86_400_000)} dias atras`
}

/**
 * Derives boolean states and freshness label from DataStatusMeta.
 * Pure hook — no side effects, only derivation.
 */
export function useDataStatus(meta: Partial<DataStatusMeta> | undefined): UseDataStatusReturn {
  // Force re-render every 60s so the freshness label stays current
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  return useMemo(() => {
    const status = meta?.dataStatus
    const lastFetchedAt = meta?.lastFetchedAt ? new Date(meta.lastFetchedAt) : null

    return {
      isLoading: status === "loading",
      isStale: status === "stale",
      isReady: status === "ready",
      isEmpty: status === "empty",
      isError: status === "error",
      isSyncing: status === "syncing",
      isRefreshing: meta?.isRefreshing ?? false,
      source: meta?.source ?? null,
      lastFetchedAt,
      freshness: getFreshnessLabel(lastFetchedAt),
      status,
    }
  }, [meta?.dataStatus, meta?.lastFetchedAt, meta?.isRefreshing, meta?.source])
}

export { getFreshnessLabel }
