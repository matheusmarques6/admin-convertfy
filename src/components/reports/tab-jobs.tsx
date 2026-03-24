"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Loader2,
  Eye,
  Download,
  RefreshCw,

} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { StatusTabs } from "@/components/ui/status-tabs"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/hooks/use-api-data"
import { ROUTES } from "@/lib/routes"
import { toast } from "@/lib/hooks/use-toast"
import type { ReportJob, ReportJobStatus } from "@/types/report"

// ── Types ────────────────────────────────────────────────────────────────────

interface ReportsListResponse {
  jobs: ReportJob[]
  pagination: {
    has_more: boolean
    next_cursor: string | null
    count: number
  }
}

/** Flat row type for DataTable */
interface JobRow {
  id: string
  dateRange: string
  storeCount: string
  period: string
  status: string
  statusLabel: string
  progressPercent: number
  progressText: string
  createdAt: string
  createdAtLabel: string
  hasResult: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL_MAP: Record<ReportJobStatus, string> = {
  queued: "Na fila",
  processing: "Processando",
  paused: "Pausado",
  completed: "Concluído",
  partial: "Parcial",
  failed: "Falhou",
  cancelled: "Cancelado",
  expired: "Expirado",
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return "Período padrão"
  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00")
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  }
  return `${fmt(start)} — ${fmt(end)}`
}

function getProgress(job: ReportJob): { percent: number; text: string } {
  const total = job.store_ids.length
  if (!job.progress || typeof job.progress !== "object") return { percent: 0, text: `0/${total}` }

  let completed = 0
  for (const key of Object.keys(job.progress)) {
    const val = job.progress[key]
    if (val && typeof val === "object" && "status" in val) {
      const status = (val as { status: string }).status
      if (status === "completed" || status === "failed") completed++
    }
  }
  return {
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    text: `${completed}/${total}`,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function TabJobs() {
  const router = useRouter()
  const [allJobs, setAllJobs] = useState<ReportJob[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")

  const { error, isLoading, mutate } = useSWR<ReportsListResponse>(
    "/api/reports?status=all&limit=20",
    apiFetcher,
    {
      onSuccess: (data) => {
        setAllJobs(data.jobs)
        setHasMore(data.pagination.has_more)
        setCursor(data.pagination.next_cursor)
      },
      refreshInterval: 15000,
    }
  )

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await apiFetcher<ReportsListResponse>(`/api/reports?status=all&limit=20&cursor=${cursor}`)
      setAllJobs(prev => [...prev, ...res.jobs])
      setHasMore(res.pagination.has_more)
      setCursor(res.pagination.next_cursor)
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar mais" })
    } finally {
      setIsLoadingMore(false)
    }
  }, [cursor, isLoadingMore])

  const handleRetry = useCallback(async (jobId: string) => {
    const job = allJobs.find(j => j.id === jobId)
    if (!job) return
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_ids: job.store_ids,
          period: job.period,
          start_date: job.start_date,
          end_date: job.end_date,
        }),
      })
      if (!res.ok) throw new Error("Falha ao criar novo job")
      toast({ title: "Novo relatório criado", description: "O relatório está sendo processado." })
      mutate()
    } catch {
      toast({ variant: "destructive", title: "Erro ao tentar novamente" })
    }
  }, [allJobs, mutate])

  const handleDownloadCsv = useCallback((jobId: string) => {
    window.open(`/api/reports/export?jobId=${jobId}`, "_blank")
  }, [])

  // Filter jobs by status
  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return allJobs
    if (statusFilter === "pending") return allJobs.filter(j => j.status === "queued" || j.status === "processing" || j.status === "paused")
    if (statusFilter === "done") return allJobs.filter(j => j.status === "completed" || j.status === "partial")
    if (statusFilter === "failed") return allJobs.filter(j => j.status === "failed" || j.status === "cancelled" || j.status === "expired")
    return allJobs
  }, [allJobs, statusFilter])

  // Status tab counts
  const statusCounts = useMemo(() => {
    const pending = allJobs.filter(j => j.status === "queued" || j.status === "processing" || j.status === "paused").length
    const done = allJobs.filter(j => j.status === "completed" || j.status === "partial").length
    const failed = allJobs.filter(j => j.status === "failed" || j.status === "cancelled" || j.status === "expired").length
    return { all: allJobs.length, pending, done, failed }
  }, [allJobs])

  // Flatten to JobRow for DataTable
  const rows: JobRow[] = useMemo(() => {
    return filteredJobs.map(job => {
      const progress = getProgress(job)
      return {
        id: job.id,
        dateRange: formatDateRange(job.start_date, job.end_date),
        storeCount: `${job.store_ids.length} loja${job.store_ids.length !== 1 ? "s" : ""}`,
        period: job.period || "custom",
        status: job.status,
        statusLabel: STATUS_LABEL_MAP[job.status] || job.status,
        progressPercent: progress.percent,
        progressText: progress.text,
        createdAt: job.created_at,
        createdAtLabel: formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR }),
        hasResult: !!job.result,
      }
    })
  }, [filteredJobs])

  // ── DataTable Columns ──────────────────────────────────────────────────────

  const columns: ColumnDef<JobRow>[] = [
    {
      accessorKey: "dateRange",
      header: "Período",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
          {row.dateRange}
        </span>
      ),
    },
    {
      accessorKey: "storeCount",
      header: "Lojas",
      type: "text",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm text-gray-600 dark:text-[#8B92A5]">
          {row.storeCount}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => {
        const isPending = row.status === "queued" || row.status === "processing"
        return (
          <div className="flex items-center gap-2">
            <StatusBadge status={row.status} label={row.statusLabel} />
            {isPending && (
              <div className="flex items-center gap-1.5 min-w-[80px]">
                <Progress value={row.progressPercent} className="h-1.5 flex-1" />
                <span className="text-[10px] font-mono tabular-nums text-gray-400 dark:text-[#5C6378]">
                  {row.progressText}
                </span>
              </div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "createdAtLabel",
      header: "Criado",
      type: "text",
      mobilePriority: "detail",
      hideOnTablet: true,
      cell: (row) => (
        <span className="text-sm text-gray-400 dark:text-[#5C6378]">
          {row.createdAtLabel}
        </span>
      ),
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "120px",
      cell: (row) => {
        const isComplete = row.status === "completed" || row.status === "partial"
        const isFailed = row.status === "failed"
        const isPaused = row.status === "paused"
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {isComplete && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(row.id))}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Abrir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleDownloadCsv(row.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {isFailed && (
              <>
                {row.hasResult && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(row.id))}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Parcial
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleRetry(row.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Retry
                </Button>
              </>
            )}
            {isPaused && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleRetry(row.id)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retomar
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[#991B1B] dark:text-[#FCA5A5]">Erro ao carregar relatórios.</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => mutate()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* StatusTabs — DS v3.0 Rule 18 */}
      <StatusTabs
        value={statusFilter}
        onValueChange={setStatusFilter}
        items={[
          { value: "all", label: "Todos", count: statusCounts.all },
          { value: "pending", label: "Pendentes", count: statusCounts.pending },
          { value: "done", label: "Concluídos", count: statusCounts.done },
          { value: "failed", label: "Falhas", count: statusCounts.failed },
        ]}
      />

      {/* DataTable — DS v3.0 Rule 5 */}
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Nenhum relatório gerado"
        emptyDescription="Gere seu primeiro relatório para acompanhar o desempenho."
        rowKey="id"
        onRowClick={(row) => {
          if (row.status === "completed" || row.status === "partial" || row.hasResult) {
            router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(row.id))
          }
        }}
      />

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  )
}
