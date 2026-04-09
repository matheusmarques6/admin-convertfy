"use client"

import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Download, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { EmailResult, FigmaFunnel } from "@/types/slicer"

interface ResultsDashboardProps {
  funnel: FigmaFunnel
  results: EmailResult[]
  onBack: () => void
  onEditEmail: (result: EmailResult) => void
  onDownloadZip: () => void
  isDownloading: boolean
}

function getStatusForCount(count: number): {
  label: string
  variant: "positive" | "warning" | "negative"
  icon: typeof CheckCircle2
} {
  if (count === 0) {
    return { label: "Erro", variant: "negative", icon: XCircle }
  }
  if (count >= 3 && count <= 8) {
    return { label: `${count} partes`, variant: "positive", icon: CheckCircle2 }
  }
  return { label: `${count} partes`, variant: "warning", icon: AlertTriangle }
}

export function ResultsDashboard({
  funnel,
  results,
  onBack,
  onEditEmail,
  onDownloadZip,
  isDownloading,
}: ResultsDashboardProps) {
  const validResults = results.filter(
    (r) => r.sections.length > 0 && r.imageBase64
  )
  const hasValidResults = validResults.length > 0
  const totalSlices = validResults.reduce(
    (sum, r) => sum + r.sections.length,
    0
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] uppercase tracking-wide">
              Funil processado
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
              {funnel.name}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
              {validResults.length}/{results.length} emails com sucesso ·{" "}
              {totalSlices} fatias no total
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos funis
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => {
          const hasError = result.sections.length === 0 || !result.imageBase64
          const status = getStatusForCount(result.sections.length)
          const StatusIcon = status.icon
          return (
            <button
              key={result.email.id}
              type="button"
              onClick={() => !hasError && onEditEmail(result)}
              disabled={hasError}
              className={cn(
                "text-left rounded-[8px] border bg-card p-3 space-y-2 transition-all",
                hasError
                  ? "border-red-300 dark:border-red-900/40 cursor-not-allowed opacity-75"
                  : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] hover:border-[#4E62D8] hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4E62D8] focus-visible:ring-offset-2"
              )}
            >
              <div className="h-32 rounded-[6px] overflow-hidden bg-gray-50 dark:bg-[#0F1117] relative">
                {result.imageBase64 ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`data:image/png;base64,${result.imageBase64}`}
                    alt={result.email.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-900 dark:text-[#EAEDF3] truncate flex-1">
                  {result.email.name}
                </p>
                <Badge variant={status.variant} showDot={false}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {status.label}
                </Badge>
              </div>
              {result.error && (
                <p className="text-[10px] text-red-600 dark:text-red-400 line-clamp-2">
                  {result.error}
                </p>
              )}
              {result.dimensions && (
                <p className="text-[10px] text-gray-400 font-mono">
                  {result.dimensions.width} × {result.dimensions.height}px
                </p>
              )}
            </button>
          )
        })}
      </div>

      <div className="sticky bottom-4 z-10">
        <Card>
          <CardContent className="p-4">
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={onDownloadZip}
              disabled={!hasValidResults || isDownloading}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando ZIP do funil...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar ZIP de {funnel.name} ({validResults.length} emails · {totalSlices} fatias)
                </>
              )}
            </Button>
            <p className="text-[11px] text-center text-gray-500 dark:text-[#8B92A5] mt-2">
              Estrutura: {funnel.name}/Nome_do_email/parte_1.png, parte_2.png...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
