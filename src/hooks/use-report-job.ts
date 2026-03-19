"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import useSWR from "swr"
import { useToast } from "@/lib/hooks/use-toast"
import { apiFetcher } from "@/lib/hooks/use-api-data"
import type { ReportJobWithExpiry } from "@/components/shared/report-job-card"

// ─── Types ──────────────────────────────────────────────────────────────────

type TerminalStatus = "completed" | "partial" | "failed" | "cancelled" | "expired"

const TERMINAL_STATUSES: TerminalStatus[] = [
  "completed",
  "partial",
  "failed",
  "cancelled",
  "expired",
]

export interface UseReportJobOptions {
  onComplete?: (job: ReportJobWithExpiry) => void
}

export interface UseReportJobReturn {
  activeJob: ReportJobWithExpiry | null
  isGenerating: boolean
  jobDismissed: boolean
  generateReport: (
    storeIds: string[],
    startDate: string,
    endDate: string
  ) => Promise<void>
  retryReport: () => Promise<void>
  dismissJob: () => void
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useReportJob(
  options: UseReportJobOptions = {}
): UseReportJobReturn {
  const { onComplete } = options
  const { toast } = useToast()

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobDismissed, setJobDismissed] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Track previous status so we only fire onComplete on transition
  const prevStatusRef = useRef<string | null>(null)

  // Ref-ify onComplete to decouple from effect deps (prevents re-runs with non-memoized callbacks)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // ─── Poll active report job via SWR ───────────────────────────────────────
  const isTerminal = prevStatusRef.current !== null && TERMINAL_STATUSES.includes(prevStatusRef.current as TerminalStatus)
  const shouldPoll = !!activeJobId && !jobDismissed && !isTerminal
  const { data: jobData } = useSWR<ReportJobWithExpiry>(
    shouldPoll ? `/api/reports/${activeJobId}` : null,
    apiFetcher,
    {
      refreshInterval: shouldPoll ? 5000 : 0,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    }
  )

  const activeJob = jobData ?? null

  // ─── Detect terminal state transitions ────────────────────────────────────
  useEffect(() => {
    if (!activeJob) return

    const currentStatus = activeJob.status
    const prevStatus = prevStatusRef.current

    // Only fire callback when transitioning FROM an active state TO a terminal state
    if (
      prevStatus !== null &&
      prevStatus !== currentStatus &&
      !TERMINAL_STATUSES.includes(prevStatus as TerminalStatus) &&
      TERMINAL_STATUSES.includes(currentStatus as TerminalStatus)
    ) {
      onCompleteRef.current?.(activeJob)
    }

    prevStatusRef.current = currentStatus
  }, [activeJob])

  // ─── Check for existing active job on mount ───────────────────────────────
  useEffect(() => {
    async function checkActiveJob() {
      try {
        const res = await fetch("/api/reports?status=active&limit=1")
        const data = await res.json()
        const jobs =
          data?.jobs ?? data?.data ?? (Array.isArray(data) ? data : [])
        if (jobs.length > 0) {
          setActiveJobId(jobs[0].id)
          setJobDismissed(false)
          // Initialize status ref so first poll won't false-trigger onComplete
          prevStatusRef.current = jobs[0].status ?? null
        }
      } catch {
        // Silent — not critical
      }
    }
    checkActiveJob()
  }, [])

  // ─── Generate report ──────────────────────────────────────────────────────
  const generateReport = useCallback(
    async (storeIds: string[], startDate: string, endDate: string) => {
      if (storeIds.length === 0) {
        toast({
          title: "Nenhuma loja disponivel",
          description:
            "Nao ha lojas com dados para gerar o relatorio",
          variant: "destructive",
        })
        return
      }

      setIsGenerating(true)
      try {
        const res = await fetch("/api/reports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_ids: storeIds,
            period: "custom",
            start_date: startDate,
            end_date: endDate,
          }),
        })
        const data = await res.json()
        if (data.id) {
          setActiveJobId(data.id)
          setJobDismissed(false)
          prevStatusRef.current = "queued"
          toast({
            title: "Relatorio iniciado",
            description: `Gerando relatorio para ${storeIds.length} lojas. Acompanhe o progresso abaixo.`,
          })
        } else {
          toast({
            title: "Erro ao iniciar relatorio",
            description: data.error || "Tente novamente",
            variant: "destructive",
          })
        }
      } catch {
        toast({
          title: "Erro de conexao",
          description: "Nao foi possivel iniciar o relatorio",
          variant: "destructive",
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [toast]
  )

  // ─── Retry report ─────────────────────────────────────────────────────────
  const retryReport = useCallback(async () => {
    if (!activeJob) return
    const storeIds = activeJob.store_ids
    const startDate = activeJob.start_date
    const endDate = activeJob.end_date
    if (!startDate || !endDate) return

    setIsGenerating(true)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_ids: storeIds,
          period: "custom",
          start_date: startDate,
          end_date: endDate,
        }),
      })
      const data = await res.json()
      if (data.id) {
        setActiveJobId(data.id)
        setJobDismissed(false)
        prevStatusRef.current = "queued"
      }
    } catch {
      toast({
        title: "Erro de conexao",
        description: "Nao foi possivel reiniciar o relatorio",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [activeJob, toast])

  // ─── Dismiss job ──────────────────────────────────────────────────────────
  const dismissJob = useCallback(() => {
    setJobDismissed(true)
  }, [])

  return {
    activeJob,
    isGenerating,
    jobDismissed,
    generateReport,
    retryReport,
    dismissJob,
  }
}
