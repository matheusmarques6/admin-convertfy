import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base — applied to ALL buttons
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8] dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[#4E62D8] text-white hover:bg-[#2137B6] active:bg-[#041366]",
        secondary:
          "bg-white border border-[rgba(0,0,0,0.08)] text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)] dark:text-[#EAEDF3] dark:hover:bg-[#242836]",
        ghost:
          "bg-transparent text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:text-[#8B92A5] dark:hover:bg-[#242836]",
        destructive:
          "bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] hover:bg-red-100 dark:bg-[#3B1111] dark:text-[#FCA5A5] dark:border-[rgba(252,165,165,0.15)]",
      },
      size: {
        sm: "h-7 px-3 text-xs gap-1.5 rounded-[6px]",
        md: "h-9 px-4 text-sm gap-2 rounded-[6px]",
        lg: "h-11 px-6 text-sm gap-2 rounded-[6px]",
        // Icon-only buttons (square)
        "icon-sm": "h-7 w-7 rounded-[6px]",
        "icon-md": "h-9 w-9 rounded-[6px]",
        icon: "h-9 w-9 rounded-[6px]",
        "icon-lg": "h-11 w-11 rounded-[6px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
