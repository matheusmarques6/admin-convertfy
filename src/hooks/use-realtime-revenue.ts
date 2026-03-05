"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
const POLLING_INTERVAL_MS = 30_000

interface UseRealtimeRevenueOptions {
  period: string
  onDataUpdate: () => void
  enabled?: boolean
}

/**
 * Subscribes to Supabase Realtime on store_revenue_summary.
 * When rows are updated (by cron or refresh-revenue POST), triggers onDataUpdate
 * with a 2s debounce to batch multiple row updates into a single re-fetch.
 *
 * Fallback: if Realtime disconnects, polls every 30s.
 */
export function useRealtimeRevenue({ period, onDataUpdate, enabled = true }: UseRealtimeRevenueOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onDataUpdate()
      setIsRefreshing(false)
    }, DEBOUNCE_MS)
  }, [onDataUpdate])

  // Trigger a background refresh via POST endpoint
  const triggerRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)

    try {
      const res = await fetch("/api/dashboard/refresh-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      })
      const data = await res.json()

      if (data.alreadyRunning) {
        // Another refresh is in progress — Realtime will notify when done
        return
      }

      // POST completed synchronously — data is already updated
      // Realtime event will also fire, but debounce handles dedup
    } catch (err) {
      console.error("[useRealtimeRevenue] Refresh failed:", err)
      setIsRefreshing(false)
    }
  }, [period, isRefreshing])

  // Start/stop polling fallback
  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      onDataUpdate()
    }, POLLING_INTERVAL_MS)
  }, [onDataUpdate])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel("revenue-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_revenue_summary",
        },
        () => {
          debouncedUpdate()
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true)
          stopPolling()
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false)
          startPolling()
        }
      })

    channelRef.current = channel

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      stopPolling()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [enabled, supabase, debouncedUpdate, startPolling, stopPolling])

  return {
    isRefreshing,
    realtimeConnected,
    triggerRefresh,
  }
}
