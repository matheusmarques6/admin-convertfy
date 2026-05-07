"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { X, CheckCircle2, AlertTriangle } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import {
  buildBannerText,
  formatTimeRemaining,
} from "./report-generation-banner-helpers"

// Re-export for callers that imported from the .tsx historically.
export { formatTimeRemaining }

interface ReportGenerationBannerProps {
  startDate: string
  endDate: string
  completedCount: number
  totalCount: number
  failedCount: number
  onDismiss?: () => void
}

export function ReportGenerationBanner({
  startDate,
  endDate,
  completedCount,
  totalCount,
  failedCount,
  onDismiss,
}: ReportGenerationBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const startTimeRef = useRef(Date.now())
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const isAllDone = totalCount > 0 && completedCount === totalCount
  const isPartial = isAllDone && failedCount > 0
  const isComplete = isAllDone && failedCount === 0

  const elapsedMs = Date.now() - startTimeRef.current
  const timeStr = formatTimeRemaining(completedCount, totalCount, elapsedMs)

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    onDismiss?.()
  }, [onDismiss])

  // Auto-dismiss after 3s when fully complete (zero failures)
  useEffect(() => {
    if (isComplete && !dismissed) {
      autoDismissRef.current = setTimeout(() => {
        handleDismiss()
      }, 3000)
    }
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    }
  }, [isComplete, dismissed, handleDismiss])

  // Reset start time when inputs change (new generation)
  useEffect(() => {
    startTimeRef.current = Date.now()
    setDismissed(false)
  }, [startDate, endDate, totalCount])

  if (dismissed) return null
  if (totalCount === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Progresso da geracao de relatorio"
      className="rounded-lg border bg-muted/50 p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isComplete && (
            <Icon icon={CheckCircle2} size={16} className="text-green-500" aria-hidden="true" />
          )}
          {isPartial && (
            <Icon icon={AlertTriangle} size={16} className="text-amber-500" aria-hidden="true" />
          )}
          <span>
            {buildBannerText({
              isAllDone,
              isPartial,
              startDate,
              endDate,
              completedCount,
              failedCount,
              totalCount,
              timeStr,
            })}
          </span>
        </div>
        {(isAllDone || onDismiss) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
            aria-label="Fechar banner"
          >
            <Icon icon={X} size={16} />
          </Button>
        )}
      </div>
      <Progress
        value={progress}
        className="h-2"
        aria-valuenow={Math.round(progress)}
      />
      {!isAllDone && (
        <p className="text-xs text-muted-foreground mt-1">
          Voce pode sair. Avisaremos quando concluir.
        </p>
      )}
      {isPartial && (
        <p className="text-xs text-amber-500 mt-1">
          {failedCount} {failedCount === 1 ? "loja falhou" : "lojas falharam"}.
          Resultados parciais exibidos.
        </p>
      )}
    </div>
  )
}
