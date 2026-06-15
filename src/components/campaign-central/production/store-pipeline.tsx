"use client"

import { PenLine, Layers, Eye, Calendar, Check } from "lucide-react"
import { PRODUCTION_STEPS } from "@/types/campaign-production"

const STEP_ICONS = [PenLine, Layers, Eye, Calendar] as const

/** Mini-pipeline de uma peça: copy → design → revisão → agendado. */
export function StorePipeline({ stage }: { stage: number }) {
  return (
    <div className="flex items-center">
      {PRODUCTION_STEPS.map((step, i) => {
        const done = i < stage
        const active = i === stage
        const Icon = STEP_ICONS[i] ?? PenLine
        return (
          <div key={step.key} className="flex items-center">
            <div className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex size-5 items-center justify-center rounded-full border ${
                  done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                    : active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground/50"
                }`}
              >
                {done ? <Check size={11} /> : <Icon size={10} />}
              </span>
              <span
                className={`text-[11px] ${
                  active
                    ? "font-semibold text-primary"
                    : done
                      ? "font-medium text-muted-foreground"
                      : "text-muted-foreground/50"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < PRODUCTION_STEPS.length - 1 && (
              <span
                className={`mx-1.5 h-0.5 w-3.5 rounded-full ${
                  i < stage ? "bg-emerald-300" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
