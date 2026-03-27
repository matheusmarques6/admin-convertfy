"use client"

import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils"
import type { PipelineStage, DealWithRelations } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface PipelineSummaryProps {
  stages: PipelineStage[]
  deals: DealWithRelations[]
}

interface MiniKpiProps {
  label: string
  value: string
  isLast?: boolean
}

// ─── MiniKpi ──────────────────────────────────────────────

function MiniKpi({ label, value, isLast }: MiniKpiProps) {
  return (
    <div className={cn(
      "text-center sm:text-left",
      !isLast && "sm:border-r sm:border-[rgba(0,0,0,0.08)] sm:dark:border-[rgba(255,255,255,0.08)]",
      "sm:px-4 first:sm:pl-0 last:sm:pr-0",
    )}>
      <p className="text-[12px] font-medium text-gray-500 dark:text-[#5C6378] uppercase tracking-[0.04em]">
        {label}
      </p>
      <p className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mt-0.5 font-mono tabular-nums">
        {value}
      </p>
    </div>
  )
}

// ─── PipelineSummary ──────────────────────────────────────

export function PipelineSummary({ stages, deals }: PipelineSummaryProps) {
  const totalDeals = deals.length
  const totalValue = deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0)

  // Weighted pipeline: sum(value * probability) / 100
  const weightedValue = deals.reduce(
    (sum, d) => sum + (Number(d.value) || 0) * (Number(d.probability) || 0) / 100,
    0,
  )

  // Conversion rate: deals in last stage / total deals
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
  const wonDeals = lastStage
    ? deals.filter((d) => d.stage_id === lastStage.id).length
    : 0
  const conversionRate = totalDeals > 0
    ? Math.round((wonDeals / totalDeals) * 100)
    : 0

  return (
    <div className={cn(
      "rounded-[8px] border p-5",
      "border-[rgba(0,0,0,0.08)] bg-white",
      "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
      "grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0",
    )}>
      <MiniKpi label="Deals" value={totalDeals.toString()} />
      <MiniKpi label="Valor Total" value={totalValue > 0 ? formatCurrency(totalValue) : "—"} />
      <MiniKpi label="Ponderado" value={weightedValue > 0 ? formatCurrency(weightedValue) : "—"} />
      <MiniKpi label="Conversão" value={`${conversionRate}%`} isLast />
    </div>
  )
}
