"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// FilterSelect — DS v3.0
//
// A minimal inline select for filter bars. Renders as a compact button with
// a chevron, no heavy dropdown — uses the native <select> overlay trick for
// maximum compatibility and zero JS bundle for the menu.
//
// Desktop: inline in the filter row
// Mobile: full-width, 44px touch target
// ---------------------------------------------------------------------------

interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: FilterOption[]
  placeholder?: string
  className?: string
}

export function FilterSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: FilterSelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder ?? "Selecionar"

  return (
    <div className={cn("relative inline-flex", className)}>
      {/* Visual button */}
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5",
          "min-h-[36px] text-sm font-medium",
          "border-[rgba(0,0,0,0.08)] bg-white",
          "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]",
          "text-gray-700 dark:text-[#EAEDF3]",
          "cursor-pointer select-none",
          "transition-colors duration-150",
          "hover:border-gray-300 dark:hover:border-[rgba(255,255,255,0.15)]",
        )}
      >
        <span className="truncate max-w-[140px]">{selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-[#5C6378]" />
      </div>

      {/* Invisible native select on top for interaction */}
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={placeholder ?? "Filtro"}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
