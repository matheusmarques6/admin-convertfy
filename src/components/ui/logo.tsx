"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

const sizes = {
  sm: { height: 24, width: 110 },
  md: { height: 28, width: 130 },
  lg: { height: 32, width: 150 },
  xl: { height: 40, width: 186 },
}

/**
 * Full Convertfy logo — automatically switches between light/dark versions.
 * Light mode: black text logo
 * Dark mode: white text logo
 */
export function Logo({ className, size = "md" }: LogoProps) {
  const sizeConfig = sizes[size]

  return (
    <div className={cn("flex items-center", className)}>
      {/* Light mode logo */}
      <Image
        src="/images/logo da convertfy com escrito preto.png"
        alt="Convertfy"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className="h-auto w-auto object-contain dark:hidden"
        style={{ maxHeight: sizeConfig.height, maxWidth: sizeConfig.width }}
        priority
      />
      {/* Dark mode logo */}
      <Image
        src="/images/logo da convertfy com escrito branco.png"
        alt="Convertfy"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className="h-auto w-auto object-contain hidden dark:block"
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
