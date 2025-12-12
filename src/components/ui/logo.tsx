"use client"

import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  sm: { icon: "w-8 h-8", text: "text-base" },
  md: { icon: "w-10 h-10", text: "text-lg" },
  lg: { icon: "w-12 h-12", text: "text-xl" },
  xl: { icon: "w-16 h-16", text: "text-2xl" },
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const sizeConfig = sizes[size]

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-shrink-0 relative", sizeConfig.icon)}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#3a68fc" />
            </linearGradient>
          </defs>
          {/* C shape - filled */}
          <path
            d="M65 15C45 8 22 18 12 42C2 66 12 88 42 92C58 94 72 86 80 72L68 64C62 74 52 80 42 78C26 75 18 60 24 42C30 24 48 18 62 24L65 15Z"
            fill="url(#logoGradient)"
          />
          {/* Inner cursor/arrow element */}
          <path
            d="M55 35L75 50L55 65L55 52L40 52L40 48L55 48L55 35Z"
            fill="url(#logoGradient)"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-bold text-foreground", sizeConfig.text)}>
          Convertfy
        </span>
      )}
    </div>
  )
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-10", className)}
    >
      <defs>
        <linearGradient id="logoGradientIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3a68fc" />
        </linearGradient>
      </defs>
      {/* C shape - filled */}
      <path
        d="M65 15C45 8 22 18 12 42C2 66 12 88 42 92C58 94 72 86 80 72L68 64C62 74 52 80 42 78C26 75 18 60 24 42C30 24 48 18 62 24L65 15Z"
        fill="url(#logoGradientIcon)"
      />
      {/* Inner cursor/arrow element */}
      <path
        d="M55 35L75 50L55 65L55 52L40 52L40 48L55 48L55 35Z"
        fill="url(#logoGradientIcon)"
      />
    </svg>
  )
}
