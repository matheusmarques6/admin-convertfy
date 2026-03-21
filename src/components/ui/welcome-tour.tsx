"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Rocket,
  Users,
  Store,
  Kanban,
  Zap,
  BarChart3,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"

const WELCOME_TOUR_KEY = "convertfy-welcome-tour-completed"

interface TourStep {
  title: string
  description: string
  icon: React.ElementType
  color: string
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Bem-vindo ao Convertfy Admin!",
    description:
      "Este é o seu painel de controle para gerenciar clientes, campanhas e resultados. Vamos fazer um tour rápido pelas principais funcionalidades.",
    icon: Sparkles,
    color: "text-primary",
  },
  {
    title: "Gestão de Clientes",
    description:
      "Cadastre e acompanhe seus clientes, contratos, health score e histórico completo. Tudo centralizado em um só lugar.",
    icon: Users,
    color: "text-blue-500",
  },
  {
    title: "Controle de Lojas",
    description:
      "Monitore os resultados de cada loja, agende calls de feedback e receba alertas automáticos sobre performance.",
    icon: Store,
    color: "text-emerald-500",
  },
  {
    title: "Pipeline de Vendas",
    description:
      "Gerencie oportunidades com um kanban visual. Arraste deals entre etapas e acompanhe o funil de vendas em tempo real.",
    icon: Kanban,
    color: "text-violet-500",
  },
  {
    title: "Automações",
    description:
      "Automatize tarefas repetitivas como notificações, atualizações de status e lembretes. Economize tempo e reduza erros.",
    icon: Zap,
    color: "text-amber-500",
  },
  {
    title: "Relatórios e Métricas",
    description:
      "Acompanhe KPIs, receita atribuída e performance de campanhas. Dados atualizados para tomar decisões estratégicas.",
    icon: BarChart3,
    color: "text-rose-500",
  },
]

export function WelcomeTour() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    try {
      const completed = localStorage.getItem(WELCOME_TOUR_KEY)
      if (!completed) {
        // Small delay so the layout renders first
        const timer = setTimeout(() => setIsOpen(true), 800)
        return () => clearTimeout(timer)
      }
    } catch {
      // localStorage not available
    }
  }, [])

  const completeTour = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_TOUR_KEY, new Date().toISOString())
    } catch {
      // localStorage not available
    }
    setIsOpen(false)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      completeTour()
    }
  }, [currentStep, completeTour])

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1))
  }, [])

  const step = TOUR_STEPS[currentStep]
  const isLastStep = currentStep === TOUR_STEPS.length - 1

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) completeTour() }}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden rounded-2xl border">
        <DialogTitle className="sr-only">Tour de boas-vindas</DialogTitle>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-6">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-8 pb-6 text-center">
          <div
            className={cn(
              "mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl",
              "bg-primary/10"
            )}
          >
            <Icon icon={step.icon} customSize={32} className={step.color} />
          </div>

          <h2 className="text-xl font-bold tracking-tight mb-2">
            {step.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {step.description}
          </p>
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-2 text-center">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} de {TOUR_STEPS.length}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div>
            {currentStep > 0 ? (
              <Button variant="ghost" size="sm" onClick={prevStep}>
                Voltar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={completeTour}>
                Pular tour
              </Button>
            )}
          </div>
          <Button size="sm" onClick={nextStep} className="gap-2">
            {isLastStep ? (
              <>
                Começar <Icon icon={Check} size={16} />
              </>
            ) : (
              <>
                Próximo <Icon icon={ArrowRight} size={16} />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
