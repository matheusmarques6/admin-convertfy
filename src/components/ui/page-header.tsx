import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { CountBadge } from "@/components/ui/count-badge"
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs"

interface PageHeaderProps {
  title: string
  description?: string
  /** Inline icon — rendered naked beside title, NO circle/bg (DS v3.0 Rule 12) */
  icon?: LucideIcon
  /** Count badge next to title (uses CountBadge) */
  badge?: number
  breadcrumb?: BreadcrumbItem[]
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * PageHeader — DS v3.0 Rule 14
 *
 * Layout: Breadcrumbs → Title row (icon + h1 + count + actions) → Description
 * Title: text-[22px] font-semibold leading-tight
 * Description: text-sm text-muted-foreground, mt-1
 * Icon: 24px inline, naked (NO circle, NO bg — Rule 12)
 * Actions: right-aligned on desktop, full-width stack on mobile
 * Responsive: column on mobile, row on sm+
 */
export function PageHeader({
  title,
  description,
  icon: IconProp,
  badge,
  breadcrumb,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumbs items={breadcrumb} className="mb-2" />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {IconProp && (
              <IconWrapper
                icon={IconProp}
                size={24}
                className="text-muted-foreground"
              />
            )}
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {badge !== undefined && badge !== null && (
              <CountBadge count={badge} />
            )}
          </div>

          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {children}
    </div>
  )
}
