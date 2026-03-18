"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { FileBarChart, ExternalLink, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ReportHistoryList } from "@/components/reports/report-history-list"
import { apiFetcher } from "@/lib/hooks/use-api-data"
import { ROUTES } from "@/lib/routes"
import { toast } from "@/lib/hooks/use-toast"
import type { ReportJob } from "@/types/report"

interface ReportsListResponse {
  jobs: ReportJob[]
  pagination: {
    has_more: boolean
    next_cursor: string | null
    count: number
  }
}

export default function ReportJobsPage() {
  const router = useRouter()
  const [allJobs, setAllJobs] = useState<ReportJob[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const { error, isLoading, mutate } = useSWR<ReportsListResponse>(
    "/api/reports?status=all&limit=20",
    apiFetcher,
    {
      onSuccess: (data) => {
        setAllJobs(data.jobs)
        setHasMore(data.pagination.has_more)
        setCursor(data.pagination.next_cursor)
      },
      refreshInterval: 15000, // refresh every 15s to track pending jobs
    }
  )

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await apiFetcher<ReportsListResponse>(`/api/reports?status=all&limit=20&cursor=${cursor}`)
      setAllJobs((prev) => [...prev, ...res.jobs])
      setHasMore(res.pagination.has_more)
      setCursor(res.pagination.next_cursor)
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar mais relatorios" })
    } finally {
      setIsLoadingMore(false)
    }
  }, [cursor, isLoadingMore])

  const handleRetry = useCallback(
    async (job: ReportJob) => {
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

        if (!res.ok) {
          throw new Error("Falha ao criar novo job")
        }

        toast({ title: "Novo relatorio criado", description: "O relatorio esta sendo processado." })
        mutate()
      } catch {
        toast({ variant: "destructive", title: "Erro ao tentar novamente" })
      }
    },
    [mutate]
  )

  const handleDownloadCsv = useCallback((jobId: string) => {
    window.open(`/api/reports/export?jobId=${jobId}`, "_blank")
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileBarChart}
        title="Historico de Relatorios"
        description="Acompanhe relatorios gerados, pendentes e com falhas"
        actions={
          <Button onClick={() => router.push(ROUTES.ADMIN.STORES.LIST)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Gerar via Painel de Lojas
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive">Erro ao carregar relatorios.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => mutate()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <ReportHistoryList
            jobs={allJobs}
            onRetry={handleRetry}
            onDownloadCsv={handleDownloadCsv}
          />

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                {isLoadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
