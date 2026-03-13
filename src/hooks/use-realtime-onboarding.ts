"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
const POLLING_INTERVAL_MS = 30_000

interface UseRealtimeOnboardingOptions {
  onDataUpdate: () => void
  enabled?: boolean
}

/**
 * Subscribes to Supabase Realtime on client_onboardings.
 * When rows are inserted/updated (phase transitions, assignments, etc.),
 * triggers onDataUpdate with a 2s debounce to batch multiple updates.
 *
 * Fallback: if Realtime disconnects, polls every 30s.
 */
export function useRealtimeOnboarding({ onDataUpdate, enabled = true }: UseRealtimeOnboardingOptions) {
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const debouncedUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onDataUpdate()
    }, DEBOUNCE_MS)
  }, [onDataUpdate])

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
      .channel("onboarding-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_onboardings",
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
    realtimeConnected,
  }
}
