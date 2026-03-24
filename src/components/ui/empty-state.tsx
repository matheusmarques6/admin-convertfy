import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  link?: {
    label: string
    href: string
  }
  compact?: boolean
  className?: string
}

export function EmptyState({ icon: IconProp, title, description, action, link, compact, className }: EmptyStateProps) {
  if (compact) {
    return (
      <div className={cn("flex flex-col items-center justify-center text-center py-6", className)}>
        {IconProp && <IconWrapper icon={IconProp} customSize={32} className="mb-2 text-muted-foreground/40" />}
        <p className="text-sm text-muted-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground/70 mt-0.5">{description}</p>}
        {link && (
          <Link href={link.href} className="inline-flex items-center gap-1 text-xs text-[#4E62D8] dark:text-[#7B8CEA] hover:text-[#4E62D8]/80 dark:hover:text-[#7B8CEA]/80 mt-2 transition-colors">
            {link.label}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center py-12 px-6",
      "border-2 border-dashed border-border rounded-[8px] bg-muted/30",
      className
    )}>
      {IconProp && (
        <IconWrapper icon={IconProp} customSize={32} className="mb-4 text-muted-foreground" />
      )}
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}
