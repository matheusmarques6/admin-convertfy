"use client"

import { useRouter } from "next/navigation"
import {
  Check,
  AlertTriangle,
  Loader2,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Pause,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ROUTES } from "@/lib/routes"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { ReportJob, ReportJobStatus } from "@/types/report"

interface ReportHistoryCardProps {
  job: ReportJob
  onRetry?: (job: ReportJob) => void
  onDownloadCsv?: (jobId: string) => void
}

const STATUS_ICON_CONFIG: Record<ReportJobStatus, { icon: LucideIcon }> = {
  queued: { icon: Clock },
  processing: { icon: Loader2 },
  paused: { icon: Pause },
  completed: { icon: Check },
  partial: { icon: AlertTriangle },
  failed: { icon: AlertTriangle },
  cancelled: { icon: Clock },
  expired: { icon: Clock },
}

const STATUS_LABEL_MAP: Record<ReportJobStatus, { status: string; label: string }> = {
  queued: { status: "queued", label: "Na fila" },
  processing: { status: "processing", label: "Processando" },
  paused: { status: "paused", label: "Pausado" },
  completed: { status: "completed", label: "Concluido" },
  partial: { status: "warning", label: "Parcial" },
  failed: { status: "failed", label: "Falhou" },
  cancelled: { status: "cancelled", label: "Cancelado" },
  expired: { status: "expired", label: "Expirado" },
}

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate || !endDate) return "Periodo padrao"
  const fmt = (d: string) => {
    const date = new Date(d + "T00:00:00")
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
  }
  return `${fmt(startDate)} — ${fmt(endDate)}`
}

function getProgress(job: ReportJob): { completed: number; total: number; percent: number } {
  const total = job.store_ids.length
  if (!job.progress || typeof job.progress !== "object") {
    return { completed: 0, total, percent: 0 }
  }

  let completed = 0
  for (const key of Object.keys(job.progress)) {
    const val = job.progress[key]
    if (val && typeof val === "object" && "status" in val) {
      const status = (val as { status: string }).status
      if (status === "completed" || status === "failed") {
        completed++
      }
    }
  }

  return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

export function ReportHistoryCard({ job, onRetry, onDownloadCsv }: ReportHistoryCardProps) {
  const router = useRouter()
  const iconConfig = STATUS_ICON_CONFIG[job.status] || STATUS_ICON_CONFIG.queued
  const labelConfig = STATUS_LABEL_MAP[job.status] || STATUS_LABEL_MAP.queued
  const StatusIcon = iconConfig.icon
  const progress = getProgress(job)
  const isPending = job.status === "queued" || job.status === "processing" || job.status === "paused"
  const isComplete = job.status === "completed" || job.status === "partial"
  const isFailed = job.status === "failed"

  const handleView = () => {
    router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(job.id))
  }

  const handleCsvDownload = () => {
    if (onDownloadCsv) {
      onDownloadCsv(job.id)
    } else {
      window.open(`/api/reports/export?jobId=${job.id}`, "_blank")
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={handleView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleView()
        }
      }}
    >
      <CardContent className="flex items-center gap-4 py-3 px-4">
        {/* Status icon */}
        <div className="shrink-0">
          <StatusIcon
            className={`h-5 w-5 ${
              job.status === "processing" ? "animate-spin text-primary" :
              job.status === "completed" ? "text-green-500" :
              job.status === "partial" ? "text-yellow-500" :
              isFailed ? "text-destructive" :
              "text-muted-foreground"
            }`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {formatDateRange(job.start_date, job.end_date)}
            </span>
            <StatusBadge status={labelConfig.status} label={labelConfig.label} className="text-[10px] px-1.5 py-0" />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{job.store_ids.length} loja{job.store_ids.length !== 1 ? "s" : ""}</span>
            <span>
              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>

          {/* Progress bar for pending jobs */}
          {isPending && (
            <div className="flex items-center gap-2">
              <Progress value={progress.percent} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {progress.completed}/{progress.total}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {isComplete && (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleView}>
                <Eye className="h-3.5 w-3.5 mr-1" />
                Abrir
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCsvDownload}>
                <Download className="h-3.5 w-3.5 mr-1" />
                CSV
              </Button>
            </>
          )}

          {job.status === "paused" && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onRetry(job)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retomar
            </Button>
          )}

          {isFailed && (
            <>
              {job.result && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleView}>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Ver parcial
                </Button>
              )}
              {onRetry && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onRetry(job)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Tentar novamente
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
