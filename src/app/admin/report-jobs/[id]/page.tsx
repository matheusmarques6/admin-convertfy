"use client"

import { use, useCallback, useState } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Download,
  Copy,
  AlertTriangle,
  RefreshCw,
  Loader2,
  FileWarning,
  Check,
  LayoutDashboard,
} from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { formatCurrency } from "@/lib/utils/format"
import { apiFetcher } from "@/lib/hooks/use-api-data"
import { ROUTES } from "@/lib/routes"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/lib/hooks/use-toast"
import type { ReportJob, ReportJobResult } from "@/types/report"

interface ReportJobWithExpiry extends ReportJob {
  is_expired: boolean
}

const fetcher = (url: string) => apiFetcher<ReportJobWithExpiry>(url)

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export default function ReportJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [retryingStores, setRetryingStores] = useState<Set<string>>(new Set())
  const [copiedLink, setCopiedLink] = useState(false)

  const { data: job, error, isLoading } = useSWR<ReportJobWithExpiry>(
    `/api/reports/${id}`,
    fetcher,
    {
      refreshInterval: (latestData) =>
        latestData?.status === "processing" ? 5000 : 0,
    }
  )

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    setCopiedLink(true)
    toast({ title: "Link copiado" })
    setTimeout(() => setCopiedLink(false), 2000)
  }, [])

  const handleDownloadCsv = useCallback(() => {
    window.open(`/api/reports/export?jobId=${id}`, "_blank")
  }, [id])

  const handleRetryStore = useCallback(
    async (storeId: string) => {
      if (!job) return
      setRetryingStores((prev) => new Set(prev).add(storeId))
      try {
        const res = await fetch("/api/reports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_ids: [storeId],
            period: job.period,
            start_date: job.start_date,
            end_date: job.end_date,
          }),
        })

        if (!res.ok) throw new Error("Falha ao reprocessar loja")

        toast({
          title: "Reprocessamento iniciado",
          description: "Um novo mini-job foi criado para esta loja.",
        })
      } catch {
        toast({ variant: "destructive", title: "Erro ao reprocessar loja" })
      } finally {
        setRetryingStores((prev) => {
          const next = new Set(prev)
          next.delete(storeId)
          return next
        })
      }
    },
    [job]
  )

  const handleRegenerateReport = useCallback(async () => {
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

      if (!res.ok) throw new Error("Falha ao gerar novamente")
      const newJob = await res.json()
      toast({ title: "Novo relatorio criado" })
      router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(newJob.id))
    } catch {
      toast({ variant: "destructive", title: "Erro ao gerar novamente" })
    }
  }, [job, router])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-lg font-medium">Relatorio nao encontrado</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.LIST)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    )
  }

  const result: ReportJobResult | null = job.result
  const isExpiredOrEmpty = job.is_expired || !result

  // Show expired state
  if (isExpiredOrEmpty) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Relatorio expirado"
          breadcrumb={[
            { label: "Relatorios", href: ROUTES.ADMIN.REPORT_JOBS.LIST },
            { label: "Detalhe" },
          ]}
        />
        <div className="flex flex-col items-center justify-center py-16">
          <FileWarning className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-medium mb-2">Relatorio expirado ou sem dados</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
            Os dados deste relatorio expiraram. Voce pode gerar novamente com os mesmos parametros.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.LIST)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <Button onClick={handleRegenerateReport}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Gerar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const storeEntries = Object.entries(result.per_store)
  const successStores = storeEntries.filter(([, s]) => !s.error)
  const failedStores = storeEntries.filter(([, s]) => !!s.error)

  // Determine primary currency from first successful store
  const primaryCurrency = successStores.length > 0 ? successStores[0][1].currency : "BRL"

  // Calculate attributed percentage
  const attributedPercent =
    result.total_revenue > 0
      ? (result.klaviyo_attributed_revenue / result.total_revenue) * 100
      : 0

  const dateRange = job.start_date && job.end_date
    ? `${format(new Date(job.start_date + "T00:00:00"), "dd MMM yyyy", { locale: ptBR })} — ${format(new Date(job.end_date + "T00:00:00"), "dd MMM yyyy", { locale: ptBR })}`
    : "Periodo padrao"

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Detalhe do Relatorio"
        breadcrumb={[
          { label: "Relatorios", href: ROUTES.ADMIN.REPORT_JOBS.LIST },
          { label: dateRange },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copiedLink ? (
                <Check className="h-4 w-4 mr-1" />
              ) : (
                <Copy className="h-4 w-4 mr-1" />
              )}
              {copiedLink ? "Copiado" : "Copiar link"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
              <Download className="h-4 w-4 mr-1" />
              Baixar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.LIST)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push(ROUTES.ADMIN.STORES.LIST)}>
              <LayoutDashboard className="h-4 w-4 mr-1" />
              Voltar ao painel
            </Button>
          </div>
        }
      />

      {/* Banner */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{dateRange}</strong>
            </span>
            <span>
              Gerado em{" "}
              {format(new Date(result.generated_at), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
            </span>
            <span>
              {result.stores_processed}/{result.stores_processed + result.stores_failed} lojas processadas
            </span>
            {result.stores_failed > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {result.stores_failed} com falha
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Receita Total</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{formatCurrency(result.total_revenue, primaryCurrency)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Receita Atribuida (Klaviyo)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{formatCurrency(result.klaviyo_attributed_revenue, primaryCurrency)}</p>
            <p className="text-xs text-muted-foreground">{formatPercent(attributedPercent)} do total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Receita Flows</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">
              {formatCurrency(
                successStores.reduce((sum, [, s]) => sum + s.flow_revenue, 0),
                primaryCurrency
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Receita Campanhas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">
              {formatCurrency(
                successStores.reduce((sum, [, s]) => sum + s.campaign_revenue, 0),
                primaryCurrency
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-store breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Breakdown por Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Receita Total</TableHead>
                <TableHead className="text-right">Campanhas</TableHead>
                <TableHead className="text-right">Flows</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {successStores.map(([storeId, store]) => {
                const pctOfTotal =
                  result.total_revenue > 0
                    ? (store.revenue / result.total_revenue) * 100
                    : 0
                return (
                  <TableRow key={storeId}>
                    <TableCell className="font-medium">{store.store_name || storeId}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(store.revenue, store.currency || "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(store.campaign_revenue, store.currency || "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(store.flow_revenue, store.currency || "BRL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(pctOfTotal)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="text-[10px]">
                        OK
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}

              {/* Failed stores */}
              {failedStores.map(([storeId, store]) => (
                <TableRow key={storeId} className="bg-destructive/5">
                  <TableCell className="font-medium">{store.store_name || storeId}</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell className="text-right text-muted-foreground">—</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs text-destructive truncate max-w-[200px]">
                        {store.error || "Erro desconhecido"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={retryingStores.has(storeId)}
                        onClick={() => handleRetryStore(storeId)}
                      >
                        {retryingStores.has(storeId) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Tentar novamente
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
