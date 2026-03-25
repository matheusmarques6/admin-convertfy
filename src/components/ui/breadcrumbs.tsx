import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
  /** Max characters before truncating middle items (default: 24) */
  maxLength?: number
}

/**
 * Breadcrumbs — DS v3.0
 *
 * Separator: ChevronRight 14px, text-subtle
 * Font: 13px/500, text-muted-foreground
 * Last item: text-foreground font-semibold, no link
 * Hover: underline on links
 * Truncation: middle items collapse to "..." when > maxLength
 */
export function Breadcrumbs({ items, className, maxLength = 24 }: BreadcrumbsProps) {
  if (!items.length) return null

  const truncateLabel = (label: string) =>
    label.length > maxLength ? `${label.slice(0, maxLength)}…` : label

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1 text-[13px] font-medium text-muted-foreground", className)}
    >
      <ol className="flex items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground/50"
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span
                  className="text-foreground font-semibold"
                  aria-current="page"
                >
                  {truncateLabel(item.label)}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="hover:underline hover:text-foreground transition-colors"
                >
                  {truncateLabel(item.label)}
                </Link>
              ) : (
                <span>{truncateLabel(item.label)}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
