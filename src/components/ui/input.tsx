import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Size & layout
          "flex h-9 w-full rounded-[6px] px-3 py-2 text-sm",
          // Colors
          "bg-white text-gray-900 border border-[rgba(0,0,0,0.08)]",
          // Placeholder
          "placeholder:text-gray-400",
          // Focus — Rule 10 WCAG 2.4.7
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
          // Transitions
          "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Dark mode
          "dark:bg-[#1A1D27] dark:text-[#EAEDF3] dark:border-[rgba(255,255,255,0.08)]",
          "dark:placeholder:text-[#5C6378]",
          "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
