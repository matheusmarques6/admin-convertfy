"use client"

import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface AuthLayoutProps {
  children: React.ReactNode
  className?: string
}

/**
 * AuthLayout — DS v3.0
 *
 * Shared layout for all auth pages (login, register, forgot-password, reset-password, change-password).
 * - Centered card on bg-gray-50 / bg-[#0F1117]
 * - Logo: uses correct asset (white on dark, black on light)
 * - Card: max-w-[400px], p-6 sm:p-8
 * - Footer: copyright
 */
export function AuthLayout({ children, className }: AuthLayoutProps) {
  const { resolvedTheme } = useTheme()

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col items-center justify-center",
        "bg-gray-50 dark:bg-[#0F1117]",
        "px-4 py-8"
      )}
    >
      {/* Logo */}
      <div className="mb-8">
        <img
          src={
            resolvedTheme === "dark"
              ? "/images/logo da convertfy com escrito branco.png"
              : "/images/logo da convertfy com escrito preto.png"
          }
          alt="Convertfy"
          className="h-8"
        />
      </div>

      {/* Card */}
      <div
        className={cn(
          "w-full max-w-[400px] rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
          "bg-white dark:bg-[#1A1D27] p-6 sm:p-8",
          className
        )}
      >
        {children}
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-8">
        © {new Date().getFullYear()} Convertfy. Todos os direitos reservados.
      </p>
    </div>
  )
}
