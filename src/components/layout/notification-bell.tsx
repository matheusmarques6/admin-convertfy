"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Bell,
  Check,
  AlertTriangle,
  Loader2,
  Clock,
  FileText,
  ArrowRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/routes"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useReportNotifications,
} from "@/hooks/use-report-notifications"
import type { ReportJob, ReportJobStatus } from "@/types/report"

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { icon: typeof Check; label: string; className: string }
> = {
  queued: { icon: Clock, label: "Na fila", className: "text-muted-foreground" },
  processing: { icon: Loader2, label: "Processando", className: "text-blue-400" },
  paused: { icon: Clock, label: "Pausado", className: "text-yellow-400" },
  completed: { icon: Check, label: "Concluido", className: "text-green-400" },
  partial: { icon: AlertTriangle, label: "Parcial", className: "text-yellow-400" },
  failed: { icon: AlertTriangle, label: "Falhou", className: "text-red-400" },
}

const ACTIVE_STATUSES: ReportJobStatus[] = ["queued", "processing", "paused"]
const COMPLETED_STATUSES: ReportJobStatus[] = ["completed"]
const FAILED_STATUSES: ReportJobStatus[] = ["partial", "failed"]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  collapsed?: boolean
}

export function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const router = useRouter()
  const { jobs, unreadCount, markAsViewed } = useReportNotifications()

  // Group jobs by status category
  const { activeJobs, completedJobs, failedJobs } = useMemo(() => {
    const active: ReportJob[] = []
    const completed: ReportJob[] = []
    const failed: ReportJob[] = []

    for (const job of jobs) {
      if (ACTIVE_STATUSES.includes(job.status)) active.push(job)
      else if (COMPLETED_STATUSES.includes(job.status)) completed.push(job)
      else if (FAILED_STATUSES.includes(job.status)) failed.push(job)
    }

    return { activeJobs: active, completedJobs: completed, failedJobs: failed }
  }, [jobs])

  const hasItems = jobs.length > 0

  // Mark unviewed terminal jobs as viewed when popover opens
  function handleOpenChange(open: boolean) {
    if (!open) return
    const unviewedIds = jobs
      .filter(
        (j) =>
          !j.viewed_at &&
          (COMPLETED_STATUSES.includes(j.status) || FAILED_STATUSES.includes(j.status))
      )
      .map((j) => j.id)

    if (unviewedIds.length > 0) {
      markAsViewed(unviewedIds)
    }
  }

  function handleJobClick(job: ReportJob) {
    if (job.status === "completed" || job.status === "partial") {
      router.push(ROUTES.ADMIN.REPORT_JOBS.DETAIL(job.id))
    }
  }

  // ── Bell button ─────────────────────────────────────────────────────────
  const bellButton = (
    <PopoverTrigger asChild>
      <button
        className={cn(
          "relative flex items-center justify-center rounded-lg transition-colors duration-150",
          "text-sidebar-foreground hover:text-white hover:bg-white/[0.07]",
          collapsed ? "h-9 w-9 mx-auto" : "h-9 w-9"
        )}
        aria-label={`Notificacoes de relatorios${unreadCount > 0 ? ` (${unreadCount} pendentes)` : ""}`}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </PopoverTrigger>
  )

  return (
    <Popover onOpenChange={handleOpenChange}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{bellButton}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs font-medium px-2.5 py-1.5">
            Relatorios
            {unreadCount > 0 && ` (${unreadCount})`}
          </TooltipContent>
        </Tooltip>
      ) : (
        bellButton
      )}

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-lg"
      >
        <div className="px-3 py-2.5 border-b">
          <p className="text-sm font-semibold">Relatorios</p>
        </div>

        {!hasItems ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma notificacao</p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[360px]">
              <div className="py-1">
                {/* Em andamento */}
                {activeJobs.length > 0 && (
                  <Section title="Em andamento">
                    {activeJobs.map((job) => (
                      <JobItem key={job.id} job={job} onClick={handleJobClick} />
                    ))}
                  </Section>
                )}

                {/* Concluidos */}
                {completedJobs.length > 0 && (
                  <Section title="Concluidos">
                    {completedJobs.map((job) => (
                      <JobItem key={job.id} job={job} onClick={handleJobClick} />
                    ))}
                  </Section>
                )}

                {/* Com falhas */}
                {failedJobs.length > 0 && (
                  <Section title="Com falhas">
                    {failedJobs.map((job) => (
                      <JobItem key={job.id} job={job} onClick={handleJobClick} />
                    ))}
                  </Section>
                )}
              </div>
            </ScrollArea>
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => router.push(ROUTES.ADMIN.REPORT_JOBS.LIST)}
              >
                Ver todos os relatorios
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1">
      <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}

function JobItem({ job, onClick }: { job: ReportJob; onClick: (job: ReportJob) => void }) {
  const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued
  const Icon = config.icon
  const isClickable = job.status === "completed" || job.status === "partial"
  const isSpinning = job.status === "processing"

  // Build label from dates or period
  const label = job.start_date && job.end_date
    ? `${job.start_date} - ${job.end_date}`
    : job.period || "Relatorio"

  // Progress info for active jobs
  const progress = getProgressText(job)

  // Relative time
  const timeAgo = formatDistanceToNow(new Date(job.created_at), {
    addSuffix: true,
    locale: ptBR,
  })

  // Failure reason (truncated)
  const failureReason = job.progress?.failure_reason
    ? String(job.progress.failure_reason).slice(0, 60)
    : null

  return (
    <button
      type="button"
      onClick={() => isClickable && onClick(job)}
      disabled={!isClickable}
      className={cn(
        "flex items-start gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors",
        isClickable
          ? "hover:bg-accent cursor-pointer"
          : "cursor-default opacity-90"
      )}
    >
      <div className={cn("mt-0.5 shrink-0", config.className)}>
        <Icon
          className={cn("h-4 w-4", isSpinning && "animate-spin")}
          strokeWidth={1.8}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn("text-xs", config.className)}>
            {config.label}
          </span>
          {progress && (
            <span className="text-xs text-muted-foreground">
              ({progress})
            </span>
          )}
        </div>
        {failureReason && (
          <p className="text-xs text-red-400/80 mt-0.5 truncate">
            {failureReason}
          </p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
        {timeAgo}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProgressText(job: ReportJob): string | null {
  if (!ACTIVE_STATUSES.includes(job.status)) return null

  const result = job.result
  if (result && typeof result.stores_processed === "number") {
    const total = job.store_ids?.length ?? 0
    if (total > 0) return `${result.stores_processed}/${total} lojas`
  }

  // Try progress object for store-level detail
  const progress = job.progress
  if (progress && typeof progress === "object") {
    const storeKeys = Object.keys(progress).filter(
      (k) => !["invocation_count", "paused_reason", "paused_at", "failure_reason"].includes(k)
    )
    if (storeKeys.length > 0) {
      const done = storeKeys.filter(
        (k) => {
          const val = progress[k]
          return val && typeof val === "object" && "status" in val && (val as { status: string }).status === "completed"
        }
      ).length
      const total = job.store_ids?.length ?? storeKeys.length
      return `${done}/${total} lojas`
    }
  }

  return null
}
