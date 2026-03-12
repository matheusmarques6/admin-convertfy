"use client"

import { cn } from "@/lib/utils"
import { Check, type LucideIcon } from "lucide-react"

export interface StepperStep {
  id: string
  label: string
  icon: LucideIcon
}

interface OnboardingStepperProps {
  steps: StepperStep[]
  currentIndex: number
  onNavigate: (index: number) => void
}

export function OnboardingStepper({ steps, currentIndex, onNavigate }: OnboardingStepperProps) {
  return (
    <div className="w-full">
      <nav aria-label="Progresso do formulario">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = i === currentIndex
            const isComplete = i < currentIndex

            return (
              <div key={step.id} className="flex items-center">
                {/* Step circle + label wrapper */}
                <div className="relative flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => isComplete && onNavigate(i)}
                    disabled={!isComplete}
                    aria-current={isActive ? "step" : undefined}
                    aria-disabled={!isComplete && !isActive}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isComplete &&
                        "border-emerald-500 bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600 hover:border-emerald-600",
                      !isActive &&
                        !isComplete &&
                        "border-muted bg-muted text-muted-foreground cursor-default"
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </button>
                  {/* Desktop label below circle */}
                  <span
                    className={cn(
                      "hidden sm:block text-xs font-medium mt-1.5 whitespace-nowrap",
                      isActive && "text-primary",
                      isComplete && "text-emerald-600 dark:text-emerald-400",
                      !isActive && !isComplete && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 mx-1.5 sm:mx-3 flex-shrink-0",
                      "w-6 sm:w-12",
                      i < currentIndex ? "bg-emerald-500" : "bg-muted"
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </nav>
      {/* Mobile step indicator */}
      <p className="text-center text-sm text-muted-foreground mt-1 sm:hidden">
        Passo {currentIndex + 1} de {steps.length} — {steps[currentIndex]?.label}
      </p>
    </div>
  )
}
