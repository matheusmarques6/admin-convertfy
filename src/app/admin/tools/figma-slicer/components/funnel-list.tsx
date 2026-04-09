"use client"

import { ArrowLeft, CheckCircle2, Eye, FileText, RefreshCw, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  EmailResult,
  FigmaFileStructure,
  FigmaFunnel,
} from "@/types/slicer"

interface FunnelListProps {
  structure: FigmaFileStructure
  processedCache: Map<string, EmailResult[]>
  onProcessFunnel: (funnel: FigmaFunnel, forceReprocess?: boolean) => void
  onBack: () => void
}

export function FunnelList({
  structure,
  processedCache,
  onProcessFunnel,
  onBack,
}: FunnelListProps) {
  const allFunnels: FigmaFunnel[] = structure.pages.flatMap((p) => p.funnels)
  const totalFunnels = allFunnels.length
  const totalEmails = allFunnels.reduce((sum, f) => sum + f.emailCount, 0)
  const processedCount = allFunnels.filter((f) =>
    processedCache.has(f.id)
  ).length

  if (totalFunnels === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-[#242836] flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
              Nenhum funil encontrado
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-1">
              Verifique se o arquivo tem frames de emails (≥ 400 × 300px)
              dentro de frames de funil.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 dark:text-[#8B92A5] uppercase tracking-wide">
              Arquivo Figma
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
              {structure.name}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
              {totalFunnels} {totalFunnels === 1 ? "funil" : "funis"} ·{" "}
              {totalEmails} {totalEmails === 1 ? "email" : "emails"}
              {processedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {processedCount} processado{processedCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Trocar arquivo
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {allFunnels.map((funnel) => {
          const cached = processedCache.get(funnel.id)
          const isProcessed = cached !== undefined && cached.length > 0
          return (
            <Card
              key={funnel.id}
              className={cn(
                "transition-colors",
                isProcessed &&
                  "border-green-400 dark:border-green-700/60 bg-green-50/30 dark:bg-green-900/10"
              )}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
                        {funnel.name}
                      </h3>
                      {isProcessed && (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="info" showDot={false}>
                        {funnel.emailCount}{" "}
                        {funnel.emailCount === 1 ? "email" : "emails"}
                      </Badge>
                      {isProcessed && (
                        <Badge variant="positive" showDot={false}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Processado
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isProcessed ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onProcessFunnel(funnel)}
                        className="flex-1"
                      >
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        Ver resultados
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onProcessFunnel(funnel, true)}
                        aria-label="Reprocessar funil"
                        title="Reprocessar com IA"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onProcessFunnel(funnel)}
                      className="w-full"
                    >
                      <Zap className="mr-2 h-3.5 w-3.5" />
                      Processar funil
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
