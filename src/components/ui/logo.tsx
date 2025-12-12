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
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("flex-shrink-0", sizeConfig.icon)}>
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          {/* Outer C arc */}
          <path
            d="M140 40C95 10 40 35 25 90C10 145 45 190 100 190C125 190 145 180 160 165"
            stroke="url(#logoGradient)"
            strokeWidth="24"
            strokeLinecap="round"
            fill="none"
          />
          {/* Inner arc with chat bubble hint */}
          <path
            d="M150 70C130 50 100 45 75 60C50 75 45 110 55 140C60 155 75 165 95 170"
            stroke="url(#logoGradient)"
            strokeWidth="20"
            strokeLinecap="round"
            fill="none"
          />
          {/* Small accent connector */}
          <path
            d="M95 170L85 185L110 175"
            stroke="url(#logoGradient)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-semibold gradient-text", sizeConfig.text)}>
          Convertfy
        </span>
      )}
    </div>
  )
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-10 h-10", className)}
    >
      <defs>
        <linearGradient id="logoGradientIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <path
        d="M140 40C95 10 40 35 25 90C10 145 45 190 100 190C125 190 145 180 160 165"
        stroke="url(#logoGradientIcon)"
        strokeWidth="24"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M150 70C130 50 100 45 75 60C50 75 45 110 55 140C60 155 75 165 95 170"
        stroke="url(#logoGradientIcon)"
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M95 170L85 185L110 175"
        stroke="url(#logoGradientIcon)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
