"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  showText?: boolean
}

const sizes = {
  xs: { height: 22, width: 95 },
  sm: { height: 26, width: 110 },
  md: { height: 30, width: 125 },
  lg: { height: 34, width: 145 },
  xl: { height: 48, width: 200 },
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
      src="/images/convertfy icon.png"
      alt="Convertfy"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority
    />
  )
}
