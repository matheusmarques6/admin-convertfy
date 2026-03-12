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
  // Progress line width: fraction of completed steps
  const progressFraction = steps.length > 1 ? currentIndex / (steps.length - 1) : 0

  return (
    <div className="w-full">
      <nav aria-label="Progresso do formulario">
        {/* Container with background line */}
        <div className="relative flex items-start justify-between">
          {/* Background line (full, muted) */}
          <div className="absolute top-[15px] left-[28px] right-[28px] h-0.5 bg-border" />
          {/* Progress line (filled, primary) */}
          <div
            className="absolute top-[15px] left-[28px] h-0.5 bg-primary transition-all duration-[400ms]"
            style={{ width: `calc(${progressFraction} * (100% - 56px))` }}
          />

          {steps.map((step, i) => {
            const Icon = step.icon
            const isActive = i === currentIndex
            const isComplete = i < currentIndex

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => isComplete && onNavigate(i)}
                disabled={!isComplete}
                aria-current={isActive ? "step" : undefined}
                aria-disabled={!isComplete && !isActive}
                className="relative z-10 flex flex-col items-center cursor-default min-w-[40px] bg-transparent border-0 p-0"
              >
                {/* Icon container — active is larger, bg masks the line */}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-md bg-background relative transition-all duration-300",
                    isActive && "w-10 h-10",
                    !isActive && "w-8 h-8",
                    isComplete && "cursor-pointer"
                  )}
                >
                  <Icon
                    className={cn(
                      "transition-all duration-300",
                      isActive && "h-7 w-7 text-primary drop-shadow-[0_0_8px_rgba(124,58,237,0.4)]",
                      isComplete && "h-5 w-5 text-primary opacity-85",
                      !isActive && !isComplete && "h-5 w-5 text-muted-foreground/20"
                    )}
                  />
                  {/* Check badge for completed steps */}
                  {isComplete && (
                    <span className="absolute -bottom-0.5 -right-1 flex items-center justify-center w-3 h-3 rounded-full bg-emerald-500 border-2 border-background">
                      <Check className="h-[7px] w-[7px] text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>

                {/* Label — only visible on active step */}
                {isActive && (
                  <span className="mt-1.5 text-[11px] font-semibold text-primary text-center leading-tight max-w-[80px]">
                    {step.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
      {/* Mobile step indicator */}
      <p className="text-center text-sm text-muted-foreground mt-2 sm:hidden">
        Passo {currentIndex + 1} de {steps.length} — {steps[currentIndex]?.label}
      </p>
    </div>
  )
}
