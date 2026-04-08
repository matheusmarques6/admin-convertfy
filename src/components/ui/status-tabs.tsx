"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CountBadge } from "@/components/ui/count-badge"

// ---------------------------------------------------------------------------
// StatusTabs — DS v3.0 Rule 18 (Status variant)
//
// Use for: list page filters (All, Active, Prospect, Churned...)
// Visually segmented (like SegmentedTabs) + count pills
// Container: bg-muted rounded-lg p-1
// Active item: bg-background shadow-sm text-foreground
// Active badge: CountBadge active=true (brand colors)
// Inactive badge: CountBadge active=false (neutral)
// Touch target: min-h-[36px]
// Mobile: horizontal scroll (Rule 23)
// Focus: ring-2 ring-ring ring-offset-2
// ---------------------------------------------------------------------------

interface StatusTabItem<T extends string = string> {
  value: T
  label: string
  count?: number
}

interface StatusTabsProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  items: StatusTabItem<T>[]
  className?: string
}

export function StatusTabs<T extends string = string>({
  value,
  onValueChange,
  items,
  className,
}: StatusTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1",
        "scrollbar-none",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = value === item.value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5",
              "min-h-[36px] text-sm font-medium",
              "transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <CountBadge count={item.count} active={isActive} />
            )}
          </button>
        )
      })}
    </div>
  )
}
