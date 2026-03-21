import { AlertCircle, RefreshCw, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"

interface ErrorStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  icon: IconProp = AlertCircle,
  title = "Algo deu errado",
  description = "Ocorreu um erro inesperado. Tente novamente.",
  onRetry,
  retryLabel = "Tentar novamente",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center py-12 px-6",
      "border border-destructive/20 rounded-xl bg-destructive/5",
      className
    )}>
      <IconWrapper icon={IconProp} customSize={32} className="mb-4 text-destructive" />
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <IconWrapper icon={RefreshCw} size={16} className="mr-2" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
