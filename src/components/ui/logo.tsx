"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
}

const sizes = {
  sm: { height: 26, width: 120 },
  md: { height: 32, width: 150 },
  lg: { height: 36, width: 168 },
  xl: { height: 44, width: 206 },
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
        className="object-contain dark:hidden"
        style={{ height: sizeConfig.height, width: "auto" }}
        priority
      />
      {/* Dark mode logo */}
      <Image
        src="/images/logo da convertfy com escrito branco.png"
        alt="Convertfy"
        width={sizeConfig.width}
        height={sizeConfig.height}
        className="object-contain hidden dark:block"
        style={{ height: sizeConfig.height, width: "auto" }}
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
