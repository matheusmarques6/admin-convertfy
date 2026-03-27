import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Size & layout
          "flex min-h-[80px] w-full rounded-[6px] px-3 py-2 text-sm resize-y",
          // Colors
          "bg-white text-gray-900 border border-[rgba(0,0,0,0.08)]",
          // Placeholder
          "placeholder:text-gray-400",
          // Focus — Rule 10 WCAG 2.4.7
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
          // Transitions
          "transition-colors duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
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
Textarea.displayName = "Textarea"

export { Textarea }
