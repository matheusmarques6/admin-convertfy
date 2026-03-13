"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import type { RealtimeChannel } from "@supabase/supabase-js"

const DEBOUNCE_MS = 2000
const POLLING_INTERVAL_MS = 30_000

interface UseRealtimeBoardOptions {
  /** Called when tasks change — typically triggers a router.refresh() or refetch */
  onDataUpdate: () => void
  /** org_member_id of the current user — used to filter realtime events */
  orgMemberId: string
  enabled?: boolean
}

/**
 * Subscribes to Supabase Realtime on the `tasks` table,
 * filtered by assignee_id = current org member.
 *
 * On INSERT/UPDATE/DELETE, triggers onDataUpdate with a 2s debounce.
 * Shows a toast when a new auto-onboarding task arrives.
 *
 * Fallback: if Realtime disconnects, polls every 30s.
 */
export function useRealtimeBoard({
  onDataUpdate,
  orgMemberId,
  enabled = true,
}: UseRealtimeBoardOptions) {
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
    if (!enabled || !orgMemberId) return

    const channel = supabase
      .channel("board-tasks-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `assignee_id=eq.${orgMemberId}`,
        },
        (payload) => {
          // Show toast for auto-onboarding tasks
          const newRow = payload.new as Record<string, unknown>
          if (
            newRow.source_type === "auto_onboarding_step" ||
            newRow.source_type === "auto_onboarding"
          ) {
            toast({
              title: "Nova tarefa",
              description: (newRow.title as string) || "Uma nova tarefa de onboarding foi adicionada ao seu board",
            })
          }
          debouncedUpdate()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `assignee_id=eq.${orgMemberId}`,
        },
        () => {
          debouncedUpdate()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "tasks",
          filter: `assignee_id=eq.${orgMemberId}`,
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
  }, [enabled, orgMemberId, supabase, debouncedUpdate, startPolling, stopPolling])

  return {
    realtimeConnected,
  }
}
