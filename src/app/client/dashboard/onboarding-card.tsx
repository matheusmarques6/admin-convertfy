"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ClipboardCheck, ArrowRight, CheckCircle2, Circle, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface OnboardingStep {
  id: string
  name: string
  status: string
}

interface OnboardingData {
  id: string
  status: string
  progress_percent: number
  completed_steps: number
  total_steps: number
}

export function OnboardingCard() {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portal/onboarding")
        if (!res.ok) return
        const json = await res.json()
        if (json.onboarding) {
          setData(json.onboarding)
          // Flatten grouped steps to get pending ones
          const allSteps: OnboardingStep[] = []
          for (const group of json.grouped || []) {
            for (const step of group.steps || []) {
              allSteps.push(step)
            }
          }
          setSteps(allSteps)
        }
      } catch {
        // Ignore - card simply won't show
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Don't render if loading, no data, or 100% complete
  if (loading || !data) return null
  if (data.progress_percent >= 100 || data.status === "completed") return null

  const pendingSteps = steps.filter(s => s.status !== "completed" && s.status !== "skipped")
  const nextStep = pendingSteps[0]

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <ClipboardCheck className="h-4 w-4 text-cyan-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Onboarding</h3>
        </div>
        <span className="text-sm font-bold text-[#05AFF2]">{data.progress_percent}%</span>
      </div>

      <Progress value={data.progress_percent} className="h-2 mb-3" />

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {data.completed_steps} de {data.total_steps} etapas concluídas
      </p>

      {/* Show next 3 pending steps */}
      <div className="space-y-2 mb-3">
        {pendingSteps.slice(0, 3).map((step) => (
          <div key={step.id} className="flex items-center gap-2">
            {step.status === "in_progress" ? (
              <Loader2 className="h-3.5 w-3.5 text-[#05AFF2] animate-spin" />
            ) : step.status === "completed" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            )}
            <span className="text-sm text-slate-800 dark:text-slate-100">{step.name}</span>
          </div>
        ))}
      </div>

      {nextStep && (
        <Link
          href="/client/onboarding"
          className="inline-flex items-center gap-1 text-sm text-[#05AFF2] hover:text-[#05AFF2]/80 transition-colors"
        >
          Continuar setup
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}
