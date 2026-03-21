"use client"

import { Clock, Check, AlertTriangle, FileText } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { ReportHistoryCard } from "./report-history-card"
import type { ReportJob } from "@/types/report"

interface ReportHistoryListProps {
  jobs: ReportJob[]
  onRetry?: (job: ReportJob) => void
  onDownloadCsv?: (jobId: string) => void
}

interface Section {
  key: string
  title: string
  icon: React.ElementType
  jobs: ReportJob[]
}

export function ReportHistoryList({ jobs, onRetry, onDownloadCsv }: ReportHistoryListProps) {
  const pending = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing" || j.status === "paused"
  )
  const completed = jobs.filter((j) => j.status === "completed" || j.status === "partial")
  const failed = jobs.filter((j) => j.status === "failed")

  const sections: Section[] = [
    { key: "pending", title: "PENDENTES", icon: Clock, jobs: pending },
    { key: "completed", title: "CONCLUIDOS", icon: Check, jobs: completed },
    { key: "failed", title: "COM FALHAS", icon: AlertTriangle, jobs: failed },
  ].filter((s) => s.jobs.length > 0)

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Icon icon={FileText} customSize={48} className="text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-1">Nenhum relatorio gerado</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Gere seu primeiro relatorio clicando no botao acima para acompanhar o desempenho das lojas.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        return (
          <div key={section.key}>
            <div className="flex items-center gap-2 mb-3">
              <Icon icon={section.icon} size={16} className="text-muted-foreground" />
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {section.title} ({section.jobs.length})
              </h3>
            </div>
            <div className="space-y-2">
              {section.jobs.map((job) => (
                <ReportHistoryCard
                  key={job.id}
                  job={job}
                  onRetry={onRetry}
                  onDownloadCsv={onDownloadCsv}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
