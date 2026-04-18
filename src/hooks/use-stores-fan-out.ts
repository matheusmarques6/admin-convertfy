"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import type { StoreLoadState, FanOutResult, DateRange } from "@/types/report"

const MAX_CONCURRENT = 5

/**
 * Fan-out hook: fetches Klaviyo report data for multiple stores concurrently
 * with a semaphore limiting to MAX_CONCURRENT simultaneous requests.
 *
 * Each store transitions through: queued -> loading -> success | error
 * Supports abort on unmount or when storeIds/range change.
 */
export function useStoresFanOut(
  storeIds: string[],
  range: DateRange | null
): FanOutResult {
  const [stores, setStores] = useState<Map<string, StoreLoadState>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  // Stable key for storeIds to avoid re-triggering on every render
  const storeIdsKey = storeIds.join(",")

  useEffect(() => {
    if (!range || storeIds.length === 0) {
      setStores(new Map())
      return
    }

    // Abort previous run
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Initialize all stores as queued
    const initial = new Map<string, StoreLoadState>()
    storeIds.forEach((id) => initial.set(id, { status: "queued" }))
    setStores(initial)

    // Semaphore-based fan-out
    const queue = [...storeIds]
    let active = 0

    const processNext = () => {
      while (active < MAX_CONCURRENT && queue.length > 0) {
        const storeId = queue.shift()!
        active++

        setStores((prev) => {
          const next = new Map(prev)
          next.set(storeId, { status: "loading" })
          return next
        })

        fetchStoreReport(storeId, range, controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) {
              setStores((prev) => {
                const next = new Map(prev)
                next.set(storeId, { status: "success", data })
                return next
              })
            }
          })
          .catch((err) => {
            if (!controller.signal.aborted) {
              setStores((prev) => {
                const next = new Map(prev)
                next.set(storeId, {
                  status: "error",
                  error: err instanceof Error ? err.message : "Unknown error",
                })
                return next
              })
            }
          })
          .finally(() => {
            active--
            if (!controller.signal.aborted) processNext()
          })
      }
    }

    processNext()

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIdsKey, range?.startDate, range?.endDate])

  // Derive aggregates
  return useMemo(() => {
    const values = Array.from(stores.values())
    const completedCount = values.filter(
      (s) => s.status === "success" || s.status === "error"
    ).length
    const failedCount = values.filter((s) => s.status === "error").length
    const totalCount = stores.size
    const isAllDone = totalCount > 0 && completedCount === totalCount
    const hasErrors = failedCount > 0

    return { stores, completedCount, totalCount, isAllDone, hasErrors, failedCount }
  }, [stores])
}

// ─── Pure fetch function (exported for testing) ─────────────────────────────

export async function fetchStoreReport(
  storeId: string,
  range: DateRange,
  signal: AbortSignal
): Promise<NonNullable<StoreLoadState["data"]>> {
  const params = new URLSearchParams({
    store_id: storeId,
    period: "custom",
    start_date: range.startDate,
    end_date: range.endDate,
  })

  const res = await fetch(`/api/integrations/email-platform/report?${params}`, { signal })

  if (!res.ok) {
    const text = await res.text()
    let message = `Request failed: ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.error) message = json.error
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  const json = await res.json()

  return {
    totalRevenue: json.revenue?.totalRevenue ?? json.totalRevenue ?? 0,
    campaignRevenue: json.revenue?.campaignRevenue ?? json.campaignRevenue ?? 0,
    flowRevenue: json.revenue?.flowRevenue ?? json.flowRevenue ?? 0,
    currency: json.revenue?.currency ?? json.currency ?? json.account?.currency ?? "BRL",
  }
}
