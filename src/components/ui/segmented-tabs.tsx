"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// SegmentedTabs — DS v3.0 (Dashboard segmented control)
//
// Use for: period toggles (7d/15d/30d), view switchers (grid/list)
// Container: bg-muted rounded-lg p-1
// Item active: bg-background shadow-sm text-foreground
// Item inactive: text-muted-foreground hover:text-foreground
// Touch target: min-h-[36px] on mobile (44px tap area with padding)
// Focus: ring-2 ring-ring ring-offset-2
// Transition: 150ms
// ---------------------------------------------------------------------------

interface SegmentedTabsProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  className?: string
  children: React.ReactNode
}

interface SegmentedTabItemProps<T extends string = string> {
  value: T
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

const SegmentedTabsContext = React.createContext<{
  value: string
  onValueChange: (v: string) => void
}>({ value: "", onValueChange: () => {} })

export function SegmentedTabs<T extends string = string>({
  value,
  onValueChange,
  className,
  children,
}: SegmentedTabsProps<T>) {
  return (
    <SegmentedTabsContext.Provider
      value={{ value, onValueChange: onValueChange as (v: string) => void }}
    >
      <div
        role="tablist"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-lg bg-muted p-1",
          className,
        )}
      >
        {children}
      </div>
    </SegmentedTabsContext.Provider>
  )
}

export function SegmentedTabItem<T extends string = string>({
  value,
  children,
  className,
  disabled = false,
}: SegmentedTabItemProps<T>) {
  const ctx = React.useContext(SegmentedTabsContext)
  const isActive = ctx.value === value

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5",
        "min-h-[36px] text-sm font-medium",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  )
}
