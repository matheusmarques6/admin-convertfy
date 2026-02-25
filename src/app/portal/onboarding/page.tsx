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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
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
  pending: { label: "Pendente", color: "text-muted-foreground" },
  in_progress: { label: "Em andamento", color: "text-info" },
  blocked: { label: "Bloqueado", color: "text-destructive" },
  completed: { label: "Concluído", color: "text-success" },
  skipped: { label: "Pulado", color: "text-muted-foreground" },
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum onboarding ativo</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Entre em contato com a equipe Convertfy para iniciar seu onboarding.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isCompleted = onboarding.status === "completed"
  const progress = Math.round(onboarding.progress_percent || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <p className="text-muted-foreground">
          Acompanhe o progresso da configuração da sua conta
        </p>
      </div>

      {/* Progress Card */}
      <GlowCard color="primary" intensity="subtle">
        <CardContent className="pt-6">
          {isCompleted ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-success/20">
                <PartyPopper className="h-7 w-7 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-success">
                  Onboarding concluído!
                </h3>
                <p className="text-sm text-muted-foreground">
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
                  <h3 className="text-lg font-semibold">{progress}% concluído</h3>
                  <p className="text-sm text-muted-foreground">
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
        </CardContent>
      </GlowCard>

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
            <GlowCard key={group.category} color="primary" intensity="subtle">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={cn("h-5 w-5", allDone ? "text-success" : "text-muted-foreground")} />
                    {group.label}
                  </CardTitle>
                  <Badge variant={allDone ? "default" : "secondary"} className="text-xs">
                    {group.completed}/{group.total}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
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
                          isDone ? "opacity-70" : "bg-muted/30"
                        )}
                      >
                        {/* Status icon */}
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                        ) : step.status === "in_progress" ? (
                          <Clock className="h-5 w-5 text-info shrink-0" />
                        ) : step.status === "blocked" ? (
                          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                        )}

                        {/* Step info */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium",
                            isDone && "line-through text-muted-foreground"
                          )}>
                            {step.name}
                          </p>
                          {step.description && !isDone && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {step.description}
                            </p>
                          )}
                        </div>

                        {/* Right side: date or action */}
                        {isDone && step.completed_at ? (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDate(step.completed_at)}
                          </span>
                        ) : isIntegrationStep && step.status === "pending" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => router.push("/portal/stores")}
                          >
                            Configurar
                          </Button>
                        ) : !isDone && step.status !== "pending" ? (
                          <Badge
                            variant="outline"
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
            </GlowCard>
          )
        })}
      </div>
    </div>
  )
}
