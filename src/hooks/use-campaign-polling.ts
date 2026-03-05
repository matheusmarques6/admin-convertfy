"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { toast } from "@/lib/hooks/use-toast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerationData {
  id: string
  name: string
  date: string
  reference_doc_url: string | null
  drive_folder_id: string | null
  drive_folder_url: string | null
  status: "processing" | "done" | "error"
  created_at: string
  updated_at: string
}

interface StoreData {
  id: string
  store_id: string
  status: string
  version: number
  error_message: string | null
  generated_at: string | null
}

export interface PollResponse {
  generation: GenerationData
  stores: StoreData[]
}

interface UseCampaignPollingResult {
  data: PollResponse | null
  isPolling: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCampaignPolling(
  generationId: string | null,
): UseCampaignPollingResult {
  const [data, setData] = useState<PollResponse | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // No generationId -> nothing to poll
    if (!generationId) {
      cleanup()
      setIsPolling(false)
      return
    }

    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/campaigns/generate/${generationId}`)
        if (!res.ok) return

        const json = await res.json()
        if (!active || !isMountedRef.current) return

        const response = json.data as PollResponse | undefined
        if (!response) return

        setData((prev) => {
          // Detect transition from processing to done/error for toasts
          const wasProcessing =
            prev === null || prev.generation.status === "processing"
          const nowDone = response.generation.status === "done"

          if (wasProcessing && nowDone) {
            const hasErrors = response.stores.some(
              (s) => s.status === "error",
            )
            if (hasErrors) {
              toast({
                title: "Geracao concluida com erros parciais",
                description:
                  "Algumas lojas tiveram erro na geracao de copies.",
                variant: "destructive",
              })
            } else {
              toast({
                title: "Copies geradas com sucesso!",
                description: "Todas as lojas foram processadas.",
                variant: "success",
              })
            }
          }

          return response
        })

        // Stop polling when no longer processing
        if (response.generation.status !== "processing") {
          cleanup()
          setIsPolling(false)
        }
      } catch {
        // Network errors are silently ignored; polling continues
      }
    }

    // If data is already loaded and not processing, skip polling
    if (data?.generation.status && data.generation.status !== "processing") {
      return
    }

    // Start polling
    setIsPolling(true)

    // Immediate first fetch
    poll()

    // Only one interval at a time
    cleanup()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      active = false
      isMountedRef.current = false
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId])

  return { data, isPolling }
}
