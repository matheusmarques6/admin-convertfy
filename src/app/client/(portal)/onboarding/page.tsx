"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Settings,
  Link2,
  GraduationCap,
  Rocket,
  AlertCircle,
  PartyPopper,
} from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { OnboardingTimeline } from "@/components/portal/onboarding-timeline"

interface OnboardingStep {
  id: string
  name: string
  description: string
  category: string
  position: number
  status: "pending" | "in_progress" | "blocked" | "completed" | "skipped"
  started_at: string | null
  completed_at: string | null
  due_date: string | null
}

interface CategoryGroup {
  category: string
  label: string
  steps: OnboardingStep[]
  total: number
  completed: number
}

interface PhaseTimelineItem {
  id: string
  label: string
  completedAt?: string | null
}

interface OnboardingData {
  id: string
  status: string
  current_phase?: string
  progress_percent: number
  started_at: string | null
  target_completion_date: string | null
  completed_at: string | null
  total_steps: number
  completed_steps: number
}

const categoryIcons: Record<string, React.ElementType> = {
  setup: Settings,
  integration: Link2,
  training: GraduationCap,
  launch: Rocket,
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-slate-400" },
  in_progress: { label: "Em andamento", color: "text-[#4E62D8] dark:text-[#7B8CEA]" },
  blocked: { label: "Bloqueado", color: "text-red-600" },
  completed: { label: "Concluído", color: "text-emerald-600" },
  skipped: { label: "Pulado", color: "text-slate-400" },
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}

export default function PortalOnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null)
  const [grouped, setGrouped] = useState<CategoryGroup[]>([])
  const [phaseTimeline, setPhaseTimeline] = useState<PhaseTimelineItem[]>([])

  useEffect(() => {
    async function loadOnboarding() {
      try {
        const response = await fetch("/api/portal/onboarding")
        if (!response.ok) throw new Error("Failed to load")

        const data = await response.json()
        setOnboarding(data.onboarding || null)
        setGrouped(data.grouped || [])
        setPhaseTimeline(data.phase_timeline || [])
      } catch (error) {
        console.error("Error loading onboarding:", error)
      } finally {
        setLoading(false)
      }
    }

    loadOnboarding()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
      </div>
    )
  }

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Onboarding</h1>
        <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40">
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <AlertCircle className="h-7 w-7 text-slate-400 dark:text-slate-500 mb-4" />
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">Nenhum onboarding ativo</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Entre em contato com a equipe Convertfy para iniciar seu onboarding.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const isCompleted = onboarding.status === "completed"
  const progress = Math.round(onboarding.progress_percent || 0)

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Onboarding</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Acompanhe o progresso da configuração da sua conta
        </p>
      </div>

      {/* Progress Card */}
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-6">
        {isCompleted ? (
          <div className="flex items-center gap-4">
            <PartyPopper className="h-7 w-7 text-emerald-600" />
            <div>
              <h3 className="text-lg font-semibold text-emerald-600">
                Onboarding concluído!
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Todas as etapas foram finalizadas.
                {onboarding.completed_at && (
                  <> Concluído em {formatDate(onboarding.completed_at)}.</>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{progress}% concluído</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {onboarding.completed_steps} de {onboarding.total_steps} etapas
                  {onboarding.target_completion_date && (
                    <> &middot; Previsão: {formatDate(onboarding.target_completion_date)}</>
                  )}
                </p>
              </div>
            </div>
            <Progress value={progress} className="h-3" />
          </div>
        )}
      </div>

      {/* Phase Timeline */}
      {phaseTimeline.length > 0 && (
        <OnboardingTimeline
          currentPhase={onboarding.current_phase || onboarding.status}
          phases={phaseTimeline}
        />
      )}

      {/* Steps by Category */}
      <div className="space-y-4">
        {grouped.map((group) => {
          const Icon = categoryIcons[group.category] || Settings
          const allDone = group.completed === group.total

          return (
            <div key={group.category} className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-700/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <Icon className={cn("h-5 w-5", allDone ? "text-emerald-600" : "text-slate-400 dark:text-slate-500")} />
                    {group.label}
                  </CardTitle>
                  <Badge variant={allDone ? "info" : "neutral"} className={cn("text-xs", allDone && "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20")}>
                    {group.completed}/{group.total}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-700/30">
                  {group.steps.map((step) => {
                    const isDone = step.status === "completed" || step.status === "skipped"
                    const isIntegrationStep =
                      step.category === "integration" &&
                      (step.name === "Klaviyo Conectado" || step.name === "Acesso à Loja Configurado")

                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "flex items-center gap-3 py-3 px-3 rounded-lg",
                          isDone ? "opacity-70" : "bg-slate-50/50 dark:bg-slate-800/50"
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : step.status === "in_progress" ? (
                          <Clock className="h-5 w-5 text-[#4E62D8] dark:text-[#7B8CEA] shrink-0" />
                        ) : step.status === "blocked" ? (
                          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium text-slate-700 dark:text-slate-200",
                            isDone && "line-through text-slate-400 dark:text-slate-500"
                          )}>
                            {step.name}
                          </p>
                          {step.description && !isDone && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {step.description}
                            </p>
                          )}
                        </div>

                        {isDone && step.completed_at ? (
                          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                            {formatDate(step.completed_at)}
                          </span>
                        ) : isIntegrationStep && step.status === "pending" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="shrink-0 border-slate-200 dark:border-slate-700/40 text-slate-700 dark:text-slate-200"
                            onClick={() => router.push("/client/stores")}
                          >
                            Configurar
                          </Button>
                        ) : !isDone && step.status !== "pending" ? (
                          <Badge
                            variant="neutral"
                            className={cn("text-xs shrink-0", statusConfig[step.status]?.color)}
                          >
                            {statusConfig[step.status]?.label}
                          </Badge>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </div>
          )
        })}
      </div>
    </div>
  )
}
