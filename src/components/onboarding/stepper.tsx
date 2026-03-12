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
          {/* Background line (full, muted) — centered on inactive icon height (44px / 2 = 22px) */}
          <div className="absolute top-[21px] left-[28px] right-[28px] h-[2px] bg-border" />
          {/* Progress line (filled, primary) */}
          <div
            className="absolute top-[21px] left-[28px] h-[2px] bg-primary transition-all duration-[400ms]"
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
                className="relative z-10 flex flex-col items-center cursor-default min-w-[48px] bg-transparent border-0 p-0"
              >
                {/* Icon container — active is larger, bg masks the line */}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg bg-background relative transition-all duration-300",
                    isActive && "w-14 h-14",
                    !isActive && "w-11 h-11",
                    isComplete && "cursor-pointer"
                  )}
                >
                  <Icon
                    className={cn(
                      "transition-all duration-300",
                      isActive && "h-8 w-8 text-primary drop-shadow-[0_0_10px_rgba(124,58,237,0.4)]",
                      isComplete && "h-6 w-6 text-primary opacity-85",
                      !isActive && !isComplete && "h-6 w-6 text-muted-foreground/20"
                    )}
                  />
                  {/* Check badge for completed steps */}
                  {isComplete && (
                    <span className="absolute -bottom-0.5 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 border-2 border-background">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>

                {/* Label — only visible on active step */}
                {isActive && (
                  <span className="mt-2 text-xs font-semibold text-primary text-center leading-tight max-w-[90px]">
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
