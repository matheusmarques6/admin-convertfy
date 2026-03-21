"use client"

import { useRouter } from "next/navigation"
import {
  BarChart3,
  CheckCircle,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TimeAgo } from "@/components/ui/time-ago"
import { cn } from "@/lib/utils"
import type { ReportJob } from "@/types/report"

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReportJobWithExpiry = ReportJob & { is_expired?: boolean }

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return ""
  const s = new Date(start + "T00:00:00")
  const e = new Date(end + "T00:00:00")
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
  const fmtFull = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
  if (s.getFullYear() === e.getFullYear()) {
    return `${fmtDay(s)} — ${fmtFull(e)}`
  }
  return `${fmtFull(s)} — ${fmtFull(e)}`
}

// ─── Variant styles ─────────────────────────────────────────────────────────

type Variant = "default" | "dark"

const variantStyles: Record<
  Variant,
  {
    active: { card: string; icon: string; text: string; progress: string; muted: string }
    done: { card: string; icon: string; text: string; muted: string }
    warn: { card: string; icon: string; text: string; muted: string }
    neutral: { card: string; icon: string; text: string }
  }
> = {
  default: {
    active: {
      card: "border-primary/20 bg-primary/5",
      icon: "text-primary",
      text: "text-sm font-medium",
      progress: "",
      muted: "text-muted-foreground",
    },
    done: {
      card: "border-emerald-500/20 bg-emerald-500/5",
      icon: "text-emerald-500",
      text: "text-sm font-medium",
      muted: "text-muted-foreground",
    },
    warn: {
      card: "border-amber-500/20 bg-amber-500/5",
      icon: "text-amber-500",
      text: "text-sm font-medium",
      muted: "text-muted-foreground",
    },
    neutral: {
      card: "border-muted",
      icon: "",
      text: "text-sm text-muted-foreground",
    },
  },
  dark: {
    active: {
      card: "border-[#05AFF2]/20 bg-[#05AFF2]/5",
      icon: "text-[#05AFF2]",
      text: "text-sm font-medium text-white",
      progress: "[&>div]:bg-[#05AFF2]",
      muted: "text-white/60",
    },
    done: {
      card: "border-emerald-400/20 bg-emerald-400/10",
      icon: "text-emerald-400",
      text: "text-sm font-medium text-white",
      muted: "text-white/60",
    },
    warn: {
      card: "border-amber-400/20 bg-amber-400/10",
      icon: "text-amber-400",
      text: "text-sm font-medium text-white",
      muted: "text-white/60",
    },
    neutral: {
      card: "border-white/10 bg-white/5",
      icon: "text-white/50",
      text: "text-sm text-white/60",
    },
  },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReportJobCardProps {
  job: ReportJobWithExpiry
  onClose: () => void
  onRetry: () => void
  variant?: Variant
  className?: string
}

export function ReportJobCard({
  job,
  onClose,
  onRetry,
  variant = "default",
  className,
}: ReportJobCardProps) {
  const router = useRouter()
  const styles = variantStyles[variant]

  const isActive = job.status === "queued" || job.status === "processing"
  const isDone = job.status === "completed"
  const isPartial = job.status === "partial"
  const isFailed = job.status === "failed"

  // Calculate progress from job.progress
  const storeEntries = Object.entries(job.progress).filter(
    ([k]) =>
      !["invocation_count", "paused_reason", "paused_at", "failure_reason"].includes(k)
  )
  const completedCount = storeEntries.filter(([, v]) => {
    const entry = v as { status?: string } | null
    return entry?.status === "completed" || entry?.status === "failed"
  }).length
  const totalCount = job.store_ids.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const dateLabel = formatDateRange(job.start_date, job.end_date)

  const estimateRemaining = () => {
    if (completedCount === 0) return "calculando..."
    const createdAt = new Date(job.created_at).getTime()
    const elapsed = Date.now() - createdAt
    const avgPerStore = elapsed / completedCount
    const remaining = (totalCount - completedCount) * avgPerStore
    const mins = Math.ceil(remaining / 60000)
    if (mins < 1) return "<1 min"
    return `~${mins} min`
  }

  if (isActive) {
    const s = styles.active
    return (
      <Card className={cn(s.card, className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon icon={BarChart3} size={16} className={s.icon} />
              <span className={s.text}>Relatorio: {dateLabel}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={onClose}
            >
              <Icon icon={X} customSize={14} />
            </Button>
          </div>
          <Progress value={progress} className={cn("h-2 mb-2", s.progress)} />
          <div className={cn("flex items-center justify-between text-xs", s.muted)}>
            <span>
              {completedCount} de {totalCount} lojas | {estimateRemaining()}
            </span>
            <span>Processando em segundo plano...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isDone) {
    const s = styles.done
    return (
      <Card className={cn(s.card, className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon icon={CheckCircle} size={16} className={s.icon} />
              <span className={s.text}>Relatorio pronto: {dateLabel}</span>
            </div>
          </div>
          <p className={cn("text-xs mb-3", s.muted)}>
            {totalCount}/{totalCount} lojas |{" "}
            <TimeAgo date={job.updated_at} className="text-xs" />
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={() => router.push(`/admin/report-jobs/${job.id}`)}
            >
              <Icon icon={FileText} customSize={12} className="mr-1" />
              Abrir Relatorio
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-auto"
              onClick={onClose}
            >
              <Icon icon={X} customSize={12} />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isPartial || isFailed) {
    const s = styles.warn
    const failedStores = storeEntries.filter(
      ([, v]) => (v as { status?: string } | null)?.status === "failed"
    ).length

    return (
      <Card className={cn(s.card, className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon icon={AlertTriangle} size={16} className={s.icon} />
              <span className={s.text}>
                {isFailed ? "Relatorio falhou" : "Relatorio parcial"}: {dateLabel}
              </span>
            </div>
          </div>
          <p className={cn("text-xs mb-3", s.muted)}>
            {completedCount - failedStores}/{totalCount} lojas | {failedStores}{" "}
            {failedStores === 1 ? "loja falhou" : "lojas falharam"}
          </p>
          <div className="flex items-center gap-2">
            {isPartial && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => router.push(`/admin/report-jobs/${job.id}`)}
              >
                <Icon icon={FileText} customSize={12} className="mr-1" />
                Ver Relatorio Parcial
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onRetry}
            >
              <Icon icon={RefreshCw} customSize={12} className="mr-1" />
              Tentar Novamente
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-auto"
              onClick={onClose}
            >
              <Icon icon={X} customSize={12} />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Cancelled / expired / paused — just show dismiss
  const s = styles.neutral
  return (
    <Card className={cn(s.card, className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-2", s.text)}>
            <Icon icon={BarChart3} size={16} className={s.icon} />
            <span>
              Relatorio{" "}
              {job.status === "cancelled"
                ? "cancelado"
                : job.status === "paused"
                  ? "pausado"
                  : "expirado"}
              : {dateLabel}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <Icon icon={X} customSize={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
