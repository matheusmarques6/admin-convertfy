"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Clock,
  Sparkles,
  Palette,
  Code2,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  CalendarClock,
  MessageCircle,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Types ──

interface OnboardingStep {
  id: string
  name: string
  status: string
  category: string
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
  target_completion_date: string | null
  completed_steps: number
  total_steps: number
}

interface OnboardingDashboardProps {
  firstName: string
}

// ── Phase config ──

const phaseConfig: Record<string, {
  icon: typeof Clock
  headline: string
  subtitle: string
  progress: number
}> = {
  not_started: {
    icon: Clock,
    headline: "Preparando seu cadastro",
    subtitle: "Seus dados estao sendo processados. Em breve iniciaremos a analise.",
    progress: 5,
  },
  pending_approval: {
    icon: Clock,
    headline: "Analisando seu cadastro",
    subtitle: "Nossa equipe esta revisando suas informacoes. Voce sera notificado assim que aprovado.",
    progress: 10,
  },
  generating_copies: {
    icon: Sparkles,
    headline: "Preparando seus conteudos",
    subtitle: "Estamos usando IA para criar os melhores textos para seus emails e automacoes.",
    progress: 30,
  },
  design: {
    icon: Palette,
    headline: "Criando seu visual",
    subtitle: "Nosso time de design esta trabalhando nos templates e materiais visuais da sua marca.",
    progress: 55,
  },
  implementation: {
    icon: Code2,
    headline: "Quase pronto!",
    subtitle: "Estamos implementando tudo na sua loja. Falta muito pouco para voce comecar a vender mais.",
    progress: 80,
  },
  completed: {
    icon: Check,
    headline: "Tudo pronto!",
    subtitle: "Seu onboarding foi concluido com sucesso. Bem-vindo ao seu painel!",
    progress: 100,
  },
}

const pipelinePhases = [
  { id: "pending_approval", label: "Cadastro", icon: Clock },
  { id: "generating_copies", label: "Aprovado", icon: Sparkles },
  { id: "design", label: "Design", icon: Palette },
  { id: "implementation", label: "Implementacao", icon: Code2 },
  { id: "completed", label: "Concluido", icon: Check },
]

// ── Circular Progress Ring ──

function ProgressRing({ percent }: { percent: number }) {
  const [animated, setAnimated] = useState(0)
  const size = 160
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(percent), 100)
    return () => clearTimeout(timer)
  }, [percent])

  return (
    <div className="relative h-28 w-28 sm:h-40 sm:w-40">
      <svg
        className="transform -rotate-90"
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#05AFF2"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1200 ease-out"
          style={{ filter: "drop-shadow(0 0 8px rgba(5,175,242,0.4))" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  )
}

// ── Phase Pipeline (Desktop) ──

function PipelineDesktop({ phases, currentPhase }: { phases: PhaseTimelineItem[]; currentPhase: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const currentIndex = pipelinePhases.findIndex(p => p.id === currentPhase)

  return (
    <div className="hidden md:flex items-start justify-between">
      {pipelinePhases.map((phase, i) => {
        const timeline = phases.find(p => p.id === phase.id)
        const isComplete = i < currentIndex
        const isActive = i === currentIndex
        const Icon = phase.icon

        return (
          <div key={phase.id} className="flex items-start flex-1">
            {/* Node */}
            <div className="flex flex-col items-center relative z-10">
              <div className="relative">
                {/* Sonar ping for active */}
                {isActive && (
                  <span className="absolute inset-[-4px] rounded-full bg-[#05AFF2]/15 animate-ping" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all duration-300",
                    isComplete && "h-11 w-11 bg-emerald-500 text-white",
                    isActive && "h-13 w-13 bg-[#05AFF2] text-white shadow-[0_0_20px_rgba(5,175,242,0.3)] ring-4 ring-[#05AFF2]/20",
                    !isComplete && !isActive && "h-11 w-11 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500"
                  )}
                  style={isActive ? { width: 52, height: 52 } : { width: 44, height: 44 }}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Fase ${phase.label} - ${isComplete ? "concluida" : isActive ? "em andamento" : "pendente"}`}
                >
                  {isComplete ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className={cn("h-5 w-5", isActive && "h-6 w-6")} />
                  )}
                </div>
              </div>

              <span className={cn(
                "mt-2 text-xs font-medium text-center leading-tight max-w-[80px]",
                isComplete && "text-emerald-600 dark:text-emerald-400",
                isActive && "font-semibold text-[#05AFF2]",
                !isComplete && !isActive && "text-slate-400 dark:text-slate-500"
              )}>
                {phase.label}
              </span>

              {timeline?.completedAt && (
                <span className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(timeline.completedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
              )}
              {isActive && !timeline?.completedAt && (
                <span className="text-[10px] text-[#05AFF2] mt-0.5">agora</span>
              )}
            </div>

            {/* Connecting line */}
            {i < pipelinePhases.length - 1 && (
              <div className="flex-1 mx-2 mt-[22px] relative h-0.5">
                <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700/50 rounded-full" />
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out",
                    isComplete && "bg-emerald-400",
                    isActive && "bg-gradient-to-r from-emerald-400 to-[#05AFF2]",
                  )}
                  style={{
                    width: mounted
                      ? isComplete ? "100%" : isActive ? "50%" : "0%"
                      : "0%",
                    transitionDelay: `${i * 150}ms`,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Phase Pipeline (Mobile) ──

function PipelineMobile({ phases, currentPhase }: { phases: PhaseTimelineItem[]; currentPhase: string }) {
  const currentIndex = pipelinePhases.findIndex(p => p.id === currentPhase)

  return (
    <div className="md:hidden space-y-0">
      {pipelinePhases.map((phase, i) => {
        const timeline = phases.find(p => p.id === phase.id)
        const isComplete = i < currentIndex
        const isActive = i === currentIndex
        const Icon = phase.icon

        return (
          <div key={phase.id}>
            <div className="flex items-center gap-3 py-2">
              <div className="relative">
                {isActive && (
                  <span className="absolute inset-[-3px] rounded-full bg-[#05AFF2]/15 animate-ping" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full",
                    isComplete && "h-9 w-9 bg-emerald-500 text-white",
                    isActive && "h-10 w-10 bg-[#05AFF2] text-white shadow-[0_0_16px_rgba(5,175,242,0.3)]",
                    !isComplete && !isActive && "h-9 w-9 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-400"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
              </div>

              <div className="flex-1">
                <span className={cn(
                  "text-sm font-medium",
                  isComplete && "text-emerald-600 dark:text-emerald-400",
                  isActive && "font-semibold text-[#05AFF2]",
                  !isComplete && !isActive && "text-slate-400 dark:text-slate-500"
                )}>
                  {phase.label}
                </span>
              </div>

              <span className="text-xs text-slate-400">
                {timeline?.completedAt
                  ? new Date(timeline.completedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                  : isActive ? "agora" : ""}
              </span>
            </div>

            {/* Vertical line */}
            {i < pipelinePhases.length - 1 && (
              <div className="ml-[17px] h-4 w-0.5 rounded-full"
                style={{
                  background: isComplete
                    ? "rgb(52, 211, 153)"
                    : isActive
                    ? "linear-gradient(to bottom, #05AFF2, rgba(148,163,184,0.3))"
                    : "rgba(148,163,184,0.3)"
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ──

export function OnboardingDashboard({ firstName }: OnboardingDashboardProps) {
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null)
  const [phases, setPhases] = useState<PhaseTimelineItem[]>([])
  const [grouped, setGrouped] = useState<CategoryGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portal/onboarding")
        if (!res.ok) return
        const data = await res.json()
        if (data.onboarding) {
          setOnboarding(data.onboarding)
          setPhases(data.phase_timeline || [])
          setGrouped(data.grouped || [])
        }
      } catch {
        // Silently fail — show normal dashboard
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Don't render if loading, no data, or completed
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!onboarding || onboarding.status === "completed") {
    return null // Signal to parent to show normal dashboard
  }

  const currentPhase = onboarding.current_phase || onboarding.status
  const config = phaseConfig[currentPhase] || phaseConfig.pending_approval
  const PhaseIcon = config.icon
  const progress = config.progress

  // Get current phase steps
  const currentSteps: OnboardingStep[] = []
  for (const group of grouped) {
    for (const step of group.steps) {
      currentSteps.push(step)
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Bem-vindo{firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe o progresso do seu onboarding
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#05AFF2]/10 text-[#05AFF2] text-xs font-semibold self-start">
          <span className="w-1.5 h-1.5 rounded-full bg-[#05AFF2] animate-pulse" />
          Onboarding
        </span>
      </div>

      {/* Hero Progress */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B0E14] via-[#12152B] to-[#1A1040] p-6 md:p-8 lg:p-10 shadow-xl">
        {/* Decorative orbs */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/20 rounded-full blur-[80px]" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-[#05AFF2]/15 rounded-full blur-[60px]" />

        <div className="relative flex flex-col items-center text-center">
          <p className="text-sm text-slate-400 mb-6">Estamos preparando tudo</p>

          <ProgressRing percent={progress} />

          <h2 className="text-xl lg:text-2xl font-semibold text-white mt-6 mb-2">
            {config.headline}
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            {config.subtitle}
          </p>
        </div>
      </div>

      {/* Phase Pipeline */}
      <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm dark:shadow-slate-900/20">
        <PipelineDesktop phases={phases} currentPhase={currentPhase} />
        <PipelineMobile phases={phases} currentPhase={currentPhase} />
      </div>

      {/* Current Phase Detail */}
      {currentSteps.length > 0 && (
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 border-l-4 border-l-[#05AFF2] p-6 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center gap-2 mb-1">
            <PhaseIcon className="h-4 w-4 text-[#05AFF2]" />
            <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
              O que esta acontecendo agora
            </span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            {config.headline}
          </h3>

          <div className="space-y-1">
            {currentSteps.slice(0, 6).map((step) => (
              <div key={step.id} className="flex items-center gap-3 py-2">
                {step.status === "completed" || step.status === "skipped" ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                ) : step.status === "in_progress" ? (
                  <Loader2 className="h-4.5 w-4.5 text-[#05AFF2] animate-spin shrink-0" />
                ) : (
                  <Circle className="h-4.5 w-4.5 text-slate-300 dark:text-slate-600 shrink-0" />
                )}
                <span className={cn(
                  "text-sm",
                  (step.status === "completed" || step.status === "skipped")
                    ? "text-slate-400 line-through"
                    : step.status === "in_progress"
                    ? "text-slate-800 dark:text-slate-100 font-medium"
                    : "text-slate-500 dark:text-slate-400"
                )}>
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ETA Card */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#05AFF2]/10 mb-4">
            <CalendarClock className="h-5 w-5 text-[#05AFF2]" />
          </div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
            Previsao de conclusao
          </span>
          {onboarding.target_completion_date ? (
            <>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {new Date(onboarding.target_completion_date).toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Aproximadamente 5 dias uteis
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 italic">
              Estamos trabalhando no seu projeto. Atualizaremos a previsao em breve.
            </p>
          )}
        </div>

        {/* Support CTA */}
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-6 shadow-sm dark:shadow-slate-900/20">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/10 mb-4">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Precisa de ajuda?
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Fale com seu gerente de conta ou acesse o suporte.
          </p>
          <Button
            className="bg-[#05AFF2] hover:bg-[#05AFF2]/85 text-white rounded-lg px-4 py-2 text-sm font-medium"
            asChild
          >
            <a href="mailto:suporte@convertfy.me">Falar com suporte</a>
          </Button>
          <Link
            href="/client/onboarding"
            className="mt-3 inline-flex items-center gap-1 text-sm text-[#05AFF2] hover:text-[#05AFF2]/80 transition-colors"
          >
            Ver detalhes completos do onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
