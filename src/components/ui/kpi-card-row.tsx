import * as React from 'react'
import { cn } from '@/lib/utils'

interface KpiCardRowProps {
  children: React.ReactNode
  /** Número de cards no grid desktop */
  columns?: 3 | 4
}

export function KpiCardRow({ children, columns = 4 }: KpiCardRowProps) {
  return (
    <div className="relative">
      <div className={cn(
        // === MOBILE (xs: 0-489px) ===
        // Scroll horizontal com snap — 2 cards visíveis por vez
        'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2',
        '[&>*]:min-w-[160px] [&>*]:max-w-[200px] [&>*]:snap-start [&>*]:shrink-0',
        'scrollbar-hide',

        // === SM (490-767px) ===
        'sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0',
        'sm:[&>*]:min-w-0 sm:[&>*]:max-w-none sm:[&>*]:shrink',

        // === MD (768-1039px) ===
        'md:grid-cols-3',

        // === LG (1040px+) ===
        columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
      )}>
        {children}
      </div>

      {/* Gradient fade indicator — mobile only */}
      <div
        className="absolute right-0 top-0 bottom-2 w-8 pointer-events-none sm:hidden bg-gradient-to-r from-transparent to-[var(--gray-25,#FCFCFD)] dark:to-[#0F1117]"
        aria-hidden="true"
      />
    </div>
  )
}
