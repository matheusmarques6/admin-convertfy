"use client"

import { Download, ScanSearch, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { ProcessingStatus as Status } from "@/types/slicer"

interface ProcessingStatusProps {
  status: Status
  funnelName: string
}

export function ProcessingStatus({ status, funnelName }: ProcessingStatusProps) {
  const progressValue =
    status.total > 0 ? (status.current / status.total) * 100 : 0

  const isExporting = status.phase === "exporting"
  const isAnalyzing = status.phase === "analyzing"

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs text-gray-500 dark:text-[#8B92A5] uppercase tracking-wide">
            Processando funil
          </p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3]">
            {funnelName}
          </h3>
        </div>

        <div className="space-y-4">
          {/* Fase 1: Exportar do Figma */}
          <PhaseCard
            icon={Download}
            title="Exportando do Figma"
            subtitle={
              isExporting
                ? `Baixando ${status.total} imagens em alta resolução...`
                : "Concluído"
            }
            active={isExporting}
            done={!isExporting}
          />

          {/* Fase 2: Analisar pixels */}
          <PhaseCard
            icon={ScanSearch}
            title="Analisando cortes"
            subtitle={
              isAnalyzing
                ? `Processando email ${status.current} de ${status.total}...`
                : isExporting
                ? "Aguardando..."
                : "Concluído"
            }
            active={isAnalyzing}
            done={false}
          />
        </div>

        {isAnalyzing && (
          <div className="space-y-2">
            <Progress value={progressValue} className="h-2" />
            <p className="text-[11px] text-center text-gray-500 dark:text-[#8B92A5] font-mono">
              {status.current} / {status.total}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PhaseCard({
  icon: Icon,
  title,
  subtitle,
  active,
  done,
}: {
  icon: typeof Download
  title: string
  subtitle: string
  active: boolean
  done: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[8px] border p-3 transition-colors",
        active
          ? "border-[#4E62D8] bg-[#4E62D8]/5"
          : done
          ? "border-green-400 bg-green-50/30 dark:bg-green-900/10"
          : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]"
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
          active
            ? "bg-[#4E62D8] text-white"
            : done
            ? "bg-green-500 text-white"
            : "bg-gray-100 dark:bg-[#242836] text-gray-400"
        )}
      >
        {done ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Icon className={cn("h-4 w-4", active && "animate-pulse")} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
          {title}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate">
          {subtitle}
        </p>
      </div>
    </div>
  )
}
