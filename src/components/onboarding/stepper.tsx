"use client"

import { cn } from "@/lib/utils"
import { Check, type LucideIcon } from "lucide-react"
import { Icon } from "@/components/ui/icon"

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
          {/* Background line (full, muted) — centered on icon height */}
          <div className="absolute top-[15px] sm:top-[21px] left-[16px] sm:left-[28px] right-[16px] sm:right-[28px] h-[2px] bg-border" />
          {/* Progress line (filled, primary) */}
          <div
            className="absolute top-[15px] sm:top-[21px] left-[16px] sm:left-[28px] h-[2px] bg-primary transition-all duration-400"
            style={{ width: `calc(${progressFraction} * (100% - 32px))` }}
          />

          {steps.map((step, i) => {
            const StepIcon = step.icon
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
                className="relative z-10 flex flex-col items-center cursor-default min-w-[32px] sm:min-w-[48px] bg-transparent border-0 p-0"
              >
                {/* Icon container — active is larger, bg masks the line */}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg bg-background relative transition-all duration-300",
                    isActive && "w-10 h-10 sm:w-14 sm:h-14",
                    !isActive && "w-8 h-8 sm:w-11 sm:h-11",
                    isComplete && "cursor-pointer"
                  )}
                >
                  <Icon
                    icon={StepIcon}
                    customSize={isActive ? 20 : 16}
                    className={cn(
                      "transition-all duration-300",
                      isActive && "sm:!h-8 sm:!w-8 text-primary",
                      isComplete && "sm:!h-6 sm:!w-6 text-primary opacity-85",
                      !isActive && !isComplete && "sm:!h-6 sm:!w-6 text-muted-foreground/20"
                    )}
                  />
                  {/* Check badge for completed steps */}
                  {isComplete && (
                    <span className="absolute -bottom-0.5 -right-1 flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-emerald-500 border-2 border-background">
                      <Icon icon={Check} customSize={8} className="sm:!h-2.5 sm:!w-2.5 text-white [stroke-width:3]" />
                    </span>
                  )}
                </div>

                {/* Label — only visible on active step, hidden on mobile */}
                {isActive && (
                  <span className="mt-2 text-xs font-semibold text-primary text-center leading-tight max-w-[90px] hidden sm:block">
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
