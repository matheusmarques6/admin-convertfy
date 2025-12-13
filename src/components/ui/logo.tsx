"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  sm: { icon: 32, text: "text-base" },
  md: { icon: 40, text: "text-lg" },
  lg: { icon: 48, text: "text-xl" },
  xl: { icon: 64, text: "text-2xl" },
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const sizeConfig = sizes[size]

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-shrink-0 relative">
        <Image
          src="/logo.png"
          alt="Convertfy"
          width={sizeConfig.icon}
          height={sizeConfig.icon}
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <span className={cn("font-bold text-foreground", sizeConfig.text)}>
          Convertfy
        </span>
      )}
    </div>
  )
}

export function LogoIcon({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="Convertfy"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority
    />
  )
}
