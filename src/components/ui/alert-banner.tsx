"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const variantConfig = {
  destructive: {
    icon: AlertCircle,
    container:
      "bg-red-500/10 border-red-500/30 text-red-400",
    iconClass: "text-red-400",
    actionVariant: "destructive" as const,
  },
  warning: {
    icon: AlertTriangle,
    container:
      "bg-amber-500/10 border-amber-500/30 text-amber-400",
    iconClass: "text-amber-400",
    actionVariant: "warning" as const,
  },
  info: {
    icon: Info,
    container:
      "bg-blue-500/10 border-blue-500/30 text-blue-400",
    iconClass: "text-blue-400",
    actionVariant: "default" as const,
  },
  success: {
    icon: CheckCircle2,
    container:
      "bg-green-500/10 border-green-500/30 text-green-400",
    iconClass: "text-green-400",
    actionVariant: "success" as const,
  },
} as const

export interface AlertBannerProps {
  variant?: "destructive" | "warning" | "info" | "success"
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

export function AlertBanner({
  variant = "info",
  icon,
  title,
  description,
  action,
  dismissible = true,
  onDismiss,
  className,
}: AlertBannerProps) {
  const [dismissed, setDismissed] = React.useState(false)
  const [animating, setAnimating] = React.useState(false)

  const config = variantConfig[variant]
  const IconComponent = icon ?? config.icon

  const handleDismiss = React.useCallback(() => {
    setAnimating(true)
    const timeout = setTimeout(() => {
      setDismissed(true)
      onDismiss?.()
    }, 300)
    return () => clearTimeout(timeout)
  }, [onDismiss])

  if (dismissed) {
    return null
  }

  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        animating
          ? "grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
        className
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3",
            config.container
          )}
        >
          <IconComponent className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconClass)} />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium leading-tight">{title}</p>
            {description && (
              <p className="text-sm leading-snug opacity-80">{description}</p>
            )}
          </div>

          {action && (
            <div className="shrink-0">
              {action.href ? (
                <Button
                  variant={config.actionVariant}
                  size="sm"
                  asChild
                >
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ) : (
                <Button
                  variant={config.actionVariant}
                  size="sm"
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              )}
            </div>
          )}

          {dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                "shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                config.iconClass
              )}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
