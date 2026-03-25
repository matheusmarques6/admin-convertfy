"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// UnderlineTabs — DS v3.0 Rule 18
//
// Use for: content tabs on detail pages (Overview, Campaigns, Flows...)
// NO container bg — tabs sit directly on page background
// Active: text-foreground, border-b-2 border-primary
// Inactive: text-muted-foreground, hover:text-foreground
// Font: 14px/500
// Touch target: min-h-[44px] on mobile
// Border: 1px border-b border-border under the tab row
// Mobile: horizontal scroll, no wrap (Rule 23)
// Focus: ring-2 ring-ring ring-offset-2
// Transition: 150ms colors, border
// ---------------------------------------------------------------------------

interface UnderlineTabsProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  className?: string
  children: React.ReactNode
}

interface UnderlineTabItemProps<T extends string = string> {
  value: T
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

const UnderlineTabsContext = React.createContext<{
  value: string
  onValueChange: (v: string) => void
}>({ value: "", onValueChange: () => {} })

export function UnderlineTabs<T extends string = string>({
  value,
  onValueChange,
  className,
  children,
}: UnderlineTabsProps<T>) {
  return (
    <UnderlineTabsContext.Provider
      value={{ value, onValueChange: onValueChange as (v: string) => void }}
    >
      <div
        role="tablist"
        className={cn(
          "flex items-stretch overflow-x-auto border-b border-border",
          "scrollbar-none -mb-px",
          className,
        )}
      >
        {children}
      </div>
    </UnderlineTabsContext.Provider>
  )
}

export function UnderlineTabItem<T extends string = string>({
  value,
  children,
  className,
  disabled = false,
}: UnderlineTabItemProps<T>) {
  const ctx = React.useContext(UnderlineTabsContext)
  const isActive = ctx.value === value

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap",
        "px-4 min-h-[44px] text-sm font-medium",
        "border-b-2 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
        className,
      )}
    >
      {children}
    </button>
  )
}
