"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
const POLLING_INTERVAL_MS = 30_000

interface UseRealtimeRevenueOptions {
  period: string
  /** Range personalizado (YYYY-MM-DD) — vai no body quando period="custom". */
  start?: string
  end?: string
  onDataUpdate: () => void
  enabled?: boolean
  refreshUrl?: string
}

/**
 * Subscribes to Supabase Realtime on store_revenue_summary.
 * When rows are updated (by cron or refresh-revenue POST), triggers onDataUpdate
 * with a 2s debounce to batch multiple row updates into a single re-fetch.
 *
 * Fallback: if Realtime disconnects, polls every 30s.
 */
export function useRealtimeRevenue({ period, start, end, onDataUpdate, enabled = true, refreshUrl = "/api/dashboard/refresh-revenue" }: UseRealtimeRevenueOptions) {
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

  // Trigger a background refresh via POST endpoint.
  // Timeout absoluto de 60s no client pra UI nao ficar "carregando infinito"
  // mesmo que o servidor demore mais (vai continuar processando em bg, e o
  // Realtime/polling captura a atualizacao).
  const triggerRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    try {
      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, start, end }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (data.alreadyRunning) {
        // Another refresh is in progress — Realtime will notify when done
        return
      }

      // POST completed synchronously — data is already updated
      // Realtime event will also fire, but debounce handles dedup
      onDataUpdate()
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError"
      if (isAbort) {
        console.warn(
          "[useRealtimeRevenue] Refresh client-timeout (60s); processamento continua em background via Realtime/polling",
        )
      } else {
        console.error("[useRealtimeRevenue] Refresh failed:", err)
      }
    } finally {
      clearTimeout(timeoutId)
      setIsRefreshing(false)
    }
  }, [period, start, end, isRefreshing, onDataUpdate, refreshUrl])

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
