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
      <div className={cn("flex-shrink-0 relative", sizeConfig.icon)}>
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="logoGradient" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#3a68fc" />
            </linearGradient>
          </defs>
          {/* Outer C arc */}
          <path
            d="M150 45C110 15 50 25 30 80C10 135 40 185 95 185C130 185 155 165 170 140"
            stroke="url(#logoGradient)"
            strokeWidth="28"
            strokeLinecap="round"
            fill="none"
          />
          {/* Inner arc with chat bubble */}
          <path
            d="M145 75C125 50 85 45 60 65C35 85 35 125 50 155"
            stroke="url(#logoGradient)"
            strokeWidth="24"
            strokeLinecap="round"
            fill="none"
          />
          {/* Chat bubble accent */}
          <path
            d="M50 155L40 175L70 160"
            stroke="url(#logoGradient)"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-bold text-white", sizeConfig.text)}>
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
        <linearGradient id="logoGradientIcon" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3a68fc" />
        </linearGradient>
      </defs>
      <path
        d="M150 45C110 15 50 25 30 80C10 135 40 185 95 185C130 185 155 165 170 140"
        stroke="url(#logoGradientIcon)"
        strokeWidth="28"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M145 75C125 50 85 45 60 65C35 85 35 125 50 155"
        stroke="url(#logoGradientIcon)"
        strokeWidth="24"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M50 155L40 175L70 160"
        stroke="url(#logoGradientIcon)"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
