"use client"

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────

export interface AlertBannerProps {
  /** Variante visual */
  variant: 'success' | 'error' | 'warning' | 'info'
  /** Título (opcional, bold) */
  title?: string
  /** Descrição / mensagem principal */
  description: string
  /** CTA button (opcional) — suporta onClick ou href */
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** Callback ao fechar — se não fornecido, não mostra botão de fechar */
  onDismiss?: () => void
  /** Ícone customizado (opcional — se não informado, usa default da variante) */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  className?: string
}

// ─── Variant Config ──────────────────────────────────────

const VARIANT_CONFIG = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-[#ECFDF5] dark:bg-[#052E1C]',
    border: 'border-[#A7F3D0] dark:border-[rgba(110,231,183,0.15)]',
    text: 'text-[#065F46] dark:text-[#6EE7B7]',
    iconColor: 'text-[#065F46] dark:text-[#6EE7B7]',
    ctaBg: 'bg-[#065F46] hover:bg-[#064E3B] dark:bg-[#6EE7B7] dark:hover:bg-[#5DD6A8]',
    ctaText: 'text-white dark:text-[#052E1C]',
  },
  error: {
    icon: XCircle,
    bg: 'bg-[#FEF2F2] dark:bg-[#3B1111]',
    border: 'border-[#FECACA] dark:border-[rgba(252,165,165,0.15)]',
    text: 'text-[#991B1B] dark:text-[#FCA5A5]',
    iconColor: 'text-[#991B1B] dark:text-[#FCA5A5]',
    ctaBg: 'bg-[#991B1B] hover:bg-[#7F1D1D] dark:bg-[#FCA5A5] dark:hover:bg-[#F87171]',
    ctaText: 'text-white dark:text-[#3B1111]',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-[#FFFBEB] dark:bg-[#3B2506]',
    border: 'border-[#FDE68A] dark:border-[rgba(252,211,77,0.15)]',
    text: 'text-[#92400E] dark:text-[#FCD34D]',
    iconColor: 'text-[#92400E] dark:text-[#FCD34D]',
    ctaBg: 'bg-[#92400E] hover:bg-[#78350F] dark:bg-[#FCD34D] dark:hover:bg-[#FBBF24]',
    ctaText: 'text-white dark:text-[#3B2506]',
  },
  info: {
    icon: Info,
    bg: 'bg-[#EEF0FB] dark:bg-[#141C3D]',
    border: 'border-[#C7CDEF] dark:border-[rgba(168,184,240,0.15)]',
    text: 'text-[#2137B6] dark:text-[#A8B8F0]',
    iconColor: 'text-[#2137B6] dark:text-[#A8B8F0]',
    ctaBg: 'bg-[#2137B6] hover:bg-[#1A2D96] dark:bg-[#A8B8F0] dark:hover:bg-[#7B8CEA]',
    ctaText: 'text-white dark:text-[#141C3D]',
  },
} as const

// ─── Component ───────────────────────────────────────────

export function AlertBanner({
  variant,
  title,
  description,
  action,
  onDismiss,
  icon: CustomIcon,
  className,
}: AlertBannerProps) {
  const config = VARIANT_CONFIG[variant]
  const AlertIcon = CustomIcon ?? config.icon

  const ctaClasses = cn(
    'inline-flex items-center justify-center px-3 h-8 rounded-[6px] text-xs font-semibold',
    'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]',
    'dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]',
    config.ctaBg,
    config.ctaText,
    'w-full sm:w-auto',
  )

  return (
    <div
      role="alert"
      className={cn(
        'rounded-[8px] border p-4',
        config.bg,
        config.border,
        'animate-in fade-in slide-in-from-top-2 duration-300',
        className,
      )}
    >
      {/* Desktop: 1 row | Mobile: stacked */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Icon + Text */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Ícone — INLINE NAKED, sem círculo (Regra 1 e 17) */}
          <AlertIcon
            size={16}
            strokeWidth={2}
            className={cn('shrink-0 mt-0.5', config.iconColor)}
          />
          <div className="min-w-0">
            {title && (
              <p className={cn('text-sm font-semibold', config.text)}>
                {title}
              </p>
            )}
            <p className={cn(
              'text-sm',
              config.text,
              title && 'mt-0.5',
              !title && 'font-medium',
            )}>
              {description}
            </p>
          </div>
        </div>

        {/* Actions: CTA + Close */}
        {(action || onDismiss) && (
          <div className="flex items-center gap-2 shrink-0 sm:ml-auto pl-7 sm:pl-0">
            {action && (
              action.href ? (
                <Link href={action.href} className={ctaClasses}>
                  {action.label}
                </Link>
              ) : (
                <button onClick={action.onClick} className={ctaClasses}>
                  {action.label}
                </button>
              )
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                aria-label="Fechar alerta"
                className={cn(
                  'p-1 rounded-[6px]',
                  'transition-colors duration-150',
                  'hover:bg-black/5 dark:hover:bg-white/5',
                  'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]',
                  'dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]',
                  config.iconColor,
                )}
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
