"use client"

import { Fragment } from "react"
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
        <div className="flex items-center mb-2">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = i === currentIndex
            const isComplete = i < currentIndex

            return (
              <Fragment key={step.id}>
                {/* Step circle + label */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => isComplete && onNavigate(i)}
                    disabled={!isComplete}
                    aria-current={isActive ? "step" : undefined}
                    aria-disabled={!isComplete && !isActive}
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 transition-colors",
                      "w-8 h-8 sm:w-10 sm:h-10",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isComplete &&
                        "border-emerald-500 bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600 hover:border-emerald-600",
                      !isActive &&
                        !isComplete &&
                        "border-muted bg-muted text-muted-foreground cursor-default"
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </button>
                  {/* Desktop label below circle */}
                  <span
                    className={cn(
                      "hidden sm:block text-xs font-medium mt-1.5 text-center leading-tight max-w-[80px]",
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
                      "h-0.5 flex-1 mx-1 sm:mx-2 self-start mt-4 sm:mt-5",
                      i < currentIndex ? "bg-emerald-500" : "bg-muted"
                    )}
                  />
                )}
              </Fragment>
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
