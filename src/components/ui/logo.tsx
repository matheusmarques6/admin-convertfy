"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  sm: { height: 28, width: 120 },
  md: { height: 36, width: 150 },
  lg: { height: 44, width: 180 },
  xl: { height: 56, width: 230 },
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
        className="object-contain"
        priority
      />
    </div>
  )
}

export function LogoIcon({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/images/logo da convertfy com escrito branco.png"
      alt="Convertfy"
      width={size * 2.5}
      height={size}
      className={cn("object-contain", className)}
      priority
    />
  )
}
