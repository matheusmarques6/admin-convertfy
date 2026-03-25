import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border text-[11px] font-semibold tracking-[0.02em] transition-colors duration-150",
  {
    variants: {
      variant: {
        positive:
          "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-[#052E1C] dark:text-[#6EE7B7] dark:border-[rgba(110,231,183,0.15)]",
        negative:
          "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA] dark:bg-[#3B1111] dark:text-[#FCA5A5] dark:border-[rgba(252,165,165,0.15)]",
        warning:
          "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] dark:bg-[#3B2506] dark:text-[#FCD34D] dark:border-[rgba(252,211,77,0.15)]",
        neutral:
          "bg-[#F3F4F6] text-[#374151] border-[#E5E7EB] dark:bg-[#242836] dark:text-[#8B92A5] dark:border-[rgba(255,255,255,0.08)]",
        info: "bg-[#EEF0FB] text-[#2137B6] border-[#C7CDEF] dark:bg-[#141C3D] dark:text-[#A8B8F0] dark:border-[rgba(168,184,240,0.15)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

const dotColors: Record<string, string> = {
  positive: "bg-[#065F46] dark:bg-[#6EE7B7]",
  negative: "bg-[#991B1B] dark:bg-[#FCA5A5]",
  warning: "bg-[#92400E] dark:bg-[#FCD34D]",
  neutral: "bg-[#6B7280] dark:bg-[#8B92A5]",
  info: "bg-[#4E62D8] dark:bg-[#7B8CEA]",
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Hide the status dot. Default: true */
  showDot?: boolean
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant = "neutral", showDot = true, children, ...props },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      >
        {showDot && (
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              dotColors[variant ?? "neutral"]
            )}
          />
        )}
        {children}
      </span>
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
