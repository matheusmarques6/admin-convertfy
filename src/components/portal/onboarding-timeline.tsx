"use client"

import { Check, Clock, Palette, Code2, Sparkles, CircleDot } from "lucide-react"

interface TimelinePhase {
  id: string
  label: string
  completedAt?: string | null
  message?: string
}

interface OnboardingTimelineProps {
  currentPhase: string
  phases?: TimelinePhase[]
}

const DEFAULT_PHASES: TimelinePhase[] = [
  { id: "pending_approval", label: "Cadastro" },
  { id: "generating_copies", label: "Aprovado" },
  { id: "design", label: "Design" },
  { id: "implementation", label: "Implementação" },
  { id: "completed", label: "Concluído" },
]

const PHASE_ORDER = ["pending_approval", "generating_copies", "design", "implementation", "completed"]

const PHASE_ICONS: Record<string, React.ElementType> = {
  pending_approval: Clock,
  generating_copies: Sparkles,
  design: Palette,
  implementation: Code2,
  completed: Check,
}

const PHASE_MESSAGES: Record<string, string> = {
  pending_approval: "Seu cadastro está sendo analisado pela nossa equipe.",
  generating_copies: "Seu onboarding foi aprovado! Estamos preparando seus materiais.",
  design: "Nosso time de design está criando os materiais visuais para sua loja.",
  implementation: "Estamos implementando tudo na sua loja. Falta pouco!",
  completed: "Seu onboarding foi concluído! Sua loja está pronta.",
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ""
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  } catch {
    return ""
  }
}

export function OnboardingTimeline({ currentPhase, phases }: OnboardingTimelineProps) {
  const displayPhases = phases || DEFAULT_PHASES
  const currentIndex = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-[#151922] p-6 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6">Progresso do Onboarding</h3>

      {/* Desktop timeline */}
      <div className="hidden sm:flex items-center justify-between mb-4">
        {displayPhases.map((phase, index) => {
          const phaseIndex = PHASE_ORDER.indexOf(phase.id)
          const isCompleted = phaseIndex < currentIndex
          const isActive = phaseIndex === currentIndex
          const isFuture = phaseIndex > currentIndex
          const Icon = PHASE_ICONS[phase.id] || CircleDot

          return (
            <div key={phase.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors
                    ${isCompleted ? "bg-green-500 border-green-500 text-white" : ""}
                    ${isActive ? "bg-blue-500 border-blue-500 text-white animate-pulse" : ""}
                    ${isFuture ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500" : ""}
                  `}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span
                  className={`mt-2 text-xs font-medium text-center
                    ${isCompleted ? "text-green-700 dark:text-green-400" : ""}
                    ${isActive ? "text-blue-700 dark:text-blue-400" : ""}
                    ${isFuture ? "text-slate-400 dark:text-slate-500" : ""}
                  `}
                >
                  {phase.label}
                </span>
                {phase.completedAt && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {formatDate(phase.completedAt)}
                  </span>
                )}
              </div>
              {index < displayPhases.length - 1 && (
                <div
                  className={`h-0.5 w-full mx-2 mt-[-20px] ${
                    phaseIndex < currentIndex ? "bg-green-400" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile timeline (vertical) */}
      <div className="sm:hidden space-y-3">
        {displayPhases.map((phase) => {
          const phaseIndex = PHASE_ORDER.indexOf(phase.id)
          const isCompleted = phaseIndex < currentIndex
          const isActive = phaseIndex === currentIndex
          const isFuture = phaseIndex > currentIndex
          const Icon = PHASE_ICONS[phase.id] || CircleDot

          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2
                  ${isCompleted ? "bg-green-500 border-green-500 text-white" : ""}
                  ${isActive ? "bg-blue-500 border-blue-500 text-white" : ""}
                  ${isFuture ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500" : ""}
                `}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <span className={`text-sm font-medium ${isActive ? "text-blue-700 dark:text-blue-400" : isCompleted ? "text-green-700 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}`}>
                  {phase.label}
                </span>
                {phase.completedAt && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{formatDate(phase.completedAt)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Current phase message */}
      {currentPhase && PHASE_MESSAGES[currentPhase] && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${
          currentPhase === "completed" ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400" : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
        }`}>
          {PHASE_MESSAGES[currentPhase]}
        </div>
      )}
    </div>
  )
}
