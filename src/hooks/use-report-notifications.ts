"use client"

import { useCallback, useRef, useMemo } from "react"
import useSWR from "swr"
import { apiFetcher } from "@/lib/hooks/use-api-data"
import type { ReportJob, ReportJobStatus } from "@/types/report"
import { toast } from "@/lib/hooks/use-toast"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportsListResponse {
  jobs: ReportJob[]
  pagination: {
    has_more: boolean
    next_cursor: string | null
    count: number
  }
}

export interface UseReportNotificationsResult {
  jobs: ReportJob[]
  unreadCount: number
  hasActiveJobs: boolean
  isLoading: boolean
  markAsViewed: (jobIds: string[]) => Promise<void>
  mutate: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: ReportJobStatus[] = ["queued", "processing", "paused"]
const UNREAD_TERMINAL_STATUSES: ReportJobStatus[] = ["completed", "partial", "failed"]
const POLL_ACTIVE_MS = 5_000
const POLL_IDLE_MS = 30_000

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReportNotifications(): UseReportNotificationsResult {
  const prevJobsRef = useRef<Map<string, ReportJobStatus>>(new Map())

  const { data, error, isLoading, mutate } = useSWR<ReportsListResponse>(
    "/api/reports?status=notifications&limit=15",
    apiFetcher,
    {
      refreshInterval: (latestData?: ReportsListResponse) => {
        if (!latestData?.jobs) return POLL_IDLE_MS
        const hasActive = latestData.jobs.some((j) => ACTIVE_STATUSES.includes(j.status))
        return hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS
      },
      revalidateOnFocus: true,
      dedupingInterval: 4_000,
      errorRetryCount: 2,
      onSuccess: (freshData) => {
        detectTransitions(freshData.jobs)
      },
    }
  )

  const jobs = useMemo(() => data?.jobs ?? [], [data?.jobs])

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => ACTIVE_STATUSES.includes(j.status)),
    [jobs]
  )

  const unreadCount = useMemo(() => {
    const unreadTerminal = jobs.filter(
      (j) => UNREAD_TERMINAL_STATUSES.includes(j.status) && !j.viewed_at
    ).length
    const activeCount = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length
    return unreadTerminal + activeCount
  }, [jobs])

  // ── Detect status transitions and fire toasts ─────────────────────────
  function detectTransitions(currentJobs: ReportJob[]) {
    const prevMap = prevJobsRef.current
    const nextMap = new Map<string, ReportJobStatus>()

    for (const job of currentJobs) {
      nextMap.set(job.id, job.status)

      const prevStatus = prevMap.get(job.id)
      if (!prevStatus) continue // new job, no transition

      // Transition to completed
      if (prevStatus !== "completed" && job.status === "completed") {
        const label = formatJobLabel(job)
        toast({
          title: "Relatorio pronto",
          description: label,
        })
      }

      // Transition to partial
      if (prevStatus !== "partial" && job.status === "partial") {
        const label = formatJobLabel(job)
        toast({
          title: "Relatorio parcial",
          description: label,
          variant: "destructive",
        })
      }

      // Transition to failed
      if (prevStatus !== "failed" && job.status === "failed") {
        const label = formatJobLabel(job)
        toast({
          title: "Relatorio falhou",
          description: label,
          variant: "destructive",
        })
      }
    }

    prevJobsRef.current = nextMap
  }

  // ── Mark jobs as viewed ───────────────────────────────────────────────
  const markAsViewed = useCallback(
    async (jobIds: string[]) => {
      const now = new Date().toISOString()
      await Promise.allSettled(
        jobIds.map((id) =>
          fetch(`/api/reports/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewed_at: now }),
          })
        )
      )
      mutate()
    },
    [mutate]
  )

  return {
    jobs,
    unreadCount,
    hasActiveJobs,
    isLoading: isLoading && !error,
    markAsViewed,
    mutate: () => mutate(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatJobLabel(job: ReportJob): string {
  if (job.start_date && job.end_date) {
    return `${job.start_date} - ${job.end_date}`
  }
  return job.period || "Relatorio"
}
