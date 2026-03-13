"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  sm: { height: 28, width: 130 },
  md: { height: 34, width: 160 },
  lg: { height: 40, width: 186 },
  xl: { height: 52, width: 240 },
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = sizes[size]

  return (
    <div className={cn("flex items-center", className)}>
      <Image
        src="/images/logo da convertfy com escrito branco.png"
        alt="Convertfy"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className="h-auto w-auto object-contain"
        style={{ maxHeight: sizeConfig.height, maxWidth: sizeConfig.width }}
        priority
      />
    </div>
  )
}

export function LogoIcon({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/images/convertfy icon.png"
      alt="Convertfy"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
      priority
    />
  )
}
