"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"

export interface OnboardingPhase {
  id: string
  title: string
  description: string
  status: "pending" | "in-progress" | "done"
  completedAt?: string | null
  order: number
}

const DEFAULT_PHASES: OnboardingPhase[] = [
  { id: "config", title: "Configuração", description: "Setup inicial da loja, credenciais e integrações", status: "pending", order: 0 },
  { id: "briefing", title: "Briefing", description: "Coleta de informações sobre público-alvo, tom de voz e diferenciais", status: "pending", order: 1 },
  { id: "setup-klaviyo", title: "Setup Klaviyo", description: "Configuração de listas, segmentos e templates no Klaviyo", status: "pending", order: 2 },
  { id: "first-campaign", title: "Primeira Campanha", description: "Envio e validação da primeira campanha de email", status: "pending", order: 3 },
  { id: "go-live", title: "Go Live", description: "Ativação de todos os flows e automações em produção", status: "pending", order: 4 },
  { id: "feedback-30d", title: "Feedback 30d", description: "Primeira reunião de feedback após 30 dias de operação", status: "pending", order: 5 },
]

interface OnboardingStepperProps {
  storeId: string
  initialPhases?: OnboardingPhase[]
}

export function OnboardingStepper({ storeId, initialPhases }: OnboardingStepperProps) {
  const { toast } = useToast()
  const [phases, setPhases] = useState<OnboardingPhase[]>(initialPhases ?? DEFAULT_PHASES)
  const [completing, setCompleting] = useState<string | null>(null)

  const handleCompletePhase = async (phaseId: string) => {
    setCompleting(phaseId)
    try {
      const res = await fetch(`/api/stores/${storeId}/onboarding-phases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseId, action: "complete" }),
      })

      if (res.ok) {
        setPhases((prev) => {
          const updated = prev.map((p) =>
            p.id === phaseId
              ? { ...p, status: "done" as const, completedAt: new Date().toISOString() }
              : p
          )
          // Auto-advance next pending phase to in-progress
          const doneIndex = updated.findIndex((p) => p.id === phaseId)
          const nextPending = updated.find((p, i) => i > doneIndex && p.status === "pending")
          if (nextPending) {
            return updated.map((p) =>
              p.id === nextPending.id ? { ...p, status: "in-progress" as const } : p
            )
          }
          return updated
        })
        toast({ title: "Fase concluída" })
      } else {
        toast({ title: "Erro ao concluir fase", variant: "destructive" })
      }
    } catch {
      // Optimistic update even on network failure for UX
      setPhases((prev) => {
        const updated = prev.map((p) =>
          p.id === phaseId
            ? { ...p, status: "done" as const, completedAt: new Date().toISOString() }
            : p
        )
        const doneIndex = updated.findIndex((p) => p.id === phaseId)
        const nextPending = updated.find((p, i) => i > doneIndex && p.status === "pending")
        if (nextPending) {
          return updated.map((p) =>
            p.id === nextPending.id ? { ...p, status: "in-progress" as const } : p
          )
        }
        return updated
      })
      toast({ title: "Fase concluída (offline)" })
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div className="space-y-0">
      {phases.map((phase, index) => {
        const isLast = index === phases.length - 1
        const isCurrent = phase.status === "in-progress"
        const isDone = phase.status === "done"
        const isCompleting = completing === phase.id

        return (
          <div key={phase.id} className="flex gap-4">
            {/* Numbered circle + connector */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                  "transition-colors duration-150",
                  isDone && "bg-[#ECFDF5] text-[#065F46] dark:bg-[#052E1C] dark:text-[#6EE7B7]",
                  isCurrent && "bg-[#4E62D8] text-white dark:bg-[#7B8CEA]",
                  !isDone && !isCurrent && "bg-gray-100 text-gray-400 dark:bg-[#242836] dark:text-[#5C6378]",
                )}
              >
                {isDone ? <Icon icon={Check} size={16} /> : index + 1}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-[40px]",
                    isDone
                      ? "bg-[#A7F3D0] dark:bg-[rgba(110,231,183,0.15)]"
                      : "bg-gray-200 dark:bg-[rgba(255,255,255,0.08)]",
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className="pb-8 flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4
                  className={cn(
                    "text-sm font-semibold",
                    isCurrent
                      ? "text-[#4E62D8] dark:text-[#7B8CEA]"
                      : isDone
                        ? "text-gray-900 dark:text-[#EAEDF3]"
                        : "text-gray-400 dark:text-[#5C6378]",
                  )}
                >
                  {phase.title}
                </h4>
                {isCurrent && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCompletePhase(phase.id)}
                    disabled={isCompleting}
                  >
                    {isCompleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Concluir"
                    )}
                  </Button>
                )}
                {isDone && <Badge variant="positive">Concluída</Badge>}
              </div>
              <p className="text-xs text-gray-500 dark:text-[#8B92A5] mt-1">
                {phase.description}
              </p>
              {phase.completedAt && (
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1 font-mono tabular-nums">
                  Concluída em{" "}
                  {new Date(phase.completedAt).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
