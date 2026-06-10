import useSWR from "swr"

interface AgentStatus {
  agent: string
  status: string
  errorMessage: string | null
}

interface BatchStatusData {
  batchId: string
  currentBatchId?: string
  status: "pending" | "running" | "done" | "error"
  total: number
  completed: number
  errors: Array<{ emailId: string; agent: string; error: string }>
  summary: {
    totalCost: number
    totalDuration: number
    tokensTotal: number
  }
  // Bug 3: campos do email_flow_emails row pra UI detectar terminal
  // status (failed/ready) e calcular stale warning antes do watchdog
  // marcar como failed em 10min.
  email_status?: string | null
  email_failure_reason?: string | null
  email_updated_at?: string | null
}

interface GenerationStatusResult {
  data: BatchStatusData | null
  isLoading: boolean
  isComplete: boolean
  error: Error | undefined
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
  return json?.data ?? json
}

export function useGenerationStatus(
  storeId: string,
  batchId: string | null,
): GenerationStatusResult {
  const shouldPoll = !!batchId

  const { data, error, isLoading } = useSWR<BatchStatusData>(
    shouldPoll
      ? `/api/admin/stores/${storeId}/generation-status/${batchId}`
      : null,
    fetcher,
    {
      refreshInterval: (latestData) => {
        if (!latestData) return 3000
        if (latestData.status === "done" || latestData.status === "error") return 0
        return 3000
      },
      revalidateOnFocus: false,
    },
  )

  const isComplete =
    !!data && (data.status === "done" || data.status === "error")

  return {
    data: data ?? null,
    isLoading: shouldPoll && isLoading,
    isComplete,
    error,
  }
}
