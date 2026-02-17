import { cn } from "@/lib/utils"

type StatusVariant = "success" | "warning" | "destructive" | "info" | "default" | "muted"

interface StatusBadgeProps {
  variant?: StatusVariant
  children: React.ReactNode
  showDot?: boolean
  className?: string
}

const variantStyles: Record<StatusVariant, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-success/10",
    text: "text-success",
    dot: "bg-success",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
  },
  destructive: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  info: {
    bg: "bg-primary/10",
    text: "text-primary",
    dot: "bg-primary",
  },
  default: {
    bg: "bg-secondary",
    text: "text-secondary-foreground",
    dot: "bg-secondary-foreground/50",
  },
  muted: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
}

export function StatusBadge({ variant = "default", children, showDot = true, className }: StatusBadgeProps) {
  const styles = variantStyles[variant]

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
      styles.bg,
      styles.text,
      className
    )}>
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
      )}
      {children}
    </span>
  )
}
