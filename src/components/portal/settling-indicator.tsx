"use client"

import { Info } from "lucide-react"
import {
  isSettlingPeriod,
  ATTRIBUTION_SETTLING_DAYS,
} from "@/lib/shared/data-status"

interface SettlingIndicatorProps {
  period: string
}

/**
 * AK-14.2 — Subtle info note when viewing periods where Klaviyo
 * attribution data is still settling (1d, 7d).
 */
export function SettlingIndicator({ period }: SettlingIndicatorProps) {
  if (!isSettlingPeriod(period)) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
      <span>
        Atribuicao de receita e preliminar — valores finais estabilizam em ate{" "}
        {ATTRIBUTION_SETTLING_DAYS} dias.
      </span>
    </div>
  )
}
