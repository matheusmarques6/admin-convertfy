import Link from "next/link"
import { type LucideIcon, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { Badge } from "@/components/ui/badge"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  badge?: string | number
  breadcrumb?: BreadcrumbItem[]
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

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
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumb.map((item, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 && (
                <IconWrapper icon={ChevronRight} size={16} />
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={index === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>
                  {item.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {IconProp && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconWrapper icon={IconProp} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {badge !== undefined && badge !== null && (
                <Badge variant="neutral" className="tabular-nums">
                  {badge}
                </Badge>
              )}
            </div>
          </div>

          {description && (
            <p className={cn("text-sm text-muted-foreground", IconProp && "pl-[52px]")}>
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
