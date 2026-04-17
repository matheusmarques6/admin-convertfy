"use client"

import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

// Flows mostrados como empty-state ate endpoint real estar disponivel.
// Nao renderizar dados ficticios — apenas os benchmarks de referencia.
const FLOW_TEMPLATES = [
  { title: "Recuperação de Carrinho", benchmark: 10 },
  { title: "Abandono de Navegação", benchmark: 4 },
  { title: "Win-back", benchmark: 2.5 },
] as const

function FlowCardSkeleton() {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-4",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      <div className="mb-2 h-3 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-2 flex items-center justify-between">
        <div className="h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mb-3 h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-[rgba(255,255,255,0.06)]">
        <div className="mb-2 h-2.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-1.5 flex items-center justify-between">
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  )
}

function FlowCardEmpty({ title, benchmark }: { title: string; benchmark: number }) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-4",
        "dark:border-[rgba(255,255,255,0.08)]"
      )}
    >
      {/* Title */}
      <p className="mb-1 text-[13px] font-medium leading-tight text-gray-500 dark:text-white/60">
        {title}
      </p>

      {/* Rate empty */}
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[24px] font-semibold tabular-nums text-gray-400 dark:text-white/40">
          —
        </span>
      </div>

      {/* Benchmark */}
      <p className="mb-1 text-[11px] text-gray-400 dark:text-white/50">
        Benchmark: {benchmark}%
      </p>

      {/* Empty message */}
      <div className="mt-3 border-t border-[rgba(0,0,0,0.06)] pt-3 dark:border-[rgba(255,255,255,0.06)]">
        <p className="text-[11px] text-gray-400 dark:text-white/50">
          Aguardando sincronização de dados dos flows.
        </p>
      </div>
    </div>
  )
}

interface DashboardFlowPerfProps {
  loading?: boolean
}

export function DashboardFlowPerf({ loading = false }: DashboardFlowPerfProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
          Performance dos Flows
        </h3>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
              Taxa de conversão e receita dos principais flows automáticos. Passe o mouse em cada card para ver detalhes como emails enviados, conversões e ticket médio.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <FlowCardSkeleton key={i} />
            ))
          : FLOW_TEMPLATES.map((tmpl) => (
              <FlowCardEmpty key={tmpl.title} title={tmpl.title} benchmark={tmpl.benchmark} />
            ))}
      </div>
    </div>
  )
}
