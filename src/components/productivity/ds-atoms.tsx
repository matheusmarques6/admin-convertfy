"use client"

import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PRIORITY_COLORS } from "@/types/productivity"

// ============================================================================
// DS Atoms — Produtividade
// Componentes atômicos seguindo DS v3.0
// ============================================================================

/** Status dot (quadrado arredondado) — prioridade */
export function PriorityDot({ priority }: { priority: number }) {
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-[2px] shrink-0"
      style={{ background: PRIORITY_COLORS[priority] || "#9CA3AF" }}
    />
  )
}

/** Status dot (circular) — status */
export function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}

/** Avatar iniciais */
export function Avatar({ initials, size = 24 }: { initials: string; size?: number }) {
  return (
    <div
      className="rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center font-semibold text-gray-600 dark:text-white/70 dark:text-white/80 shrink-0 border-[1.5px] border-white dark:border-white/20"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials}
    </div>
  )
}

/** Checkbox com animação de check */
export function Checkbox({ checked, onChange }: { checked: boolean; onChange?: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "w-[14px] h-[14px] rounded-[4px] shrink-0 flex items-center justify-center transition-all duration-fast ease-out-expo",
        checked
          ? "bg-positive-text border-none"
          : "bg-transparent border-[1.5px] border-gray-300 dark:border-white/30"
      )}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}

/** Progress bar horizontal */
export function ProgressBar({
  percentage,
  color,
  height = 4,
}: {
  percentage: number
  color: string
  height?: number
}) {
  return (
    <div
      className="bg-gray-100 dark:bg-[#242836] dark:bg-white/10 rounded-full overflow-hidden flex-1"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-fast ease-out-expo"
        style={{ width: `${Math.min(percentage, 100)}%`, background: color }}
      />
    </div>
  )
}

/** Progress circle (ring) */
export function ProgressCircle({
  percentage,
  color,
  size = 48,
  strokeWidth = 4,
  children,
}: {
  percentage: number
  color: string
  size?: number
  strokeWidth?: number
  children?: ReactNode
}) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--gray-100)" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - percentage / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-fast ease-out-expo"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}

/** Card container — border, não shadow */
export function Card({ children, className, style, onClick }: { children: ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div
      className={cn("bg-white dark:bg-[#1A1D27] rounded-md border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] px-6 py-4", className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/** Card header com ícone + título + right action */
export function CardHeader({
  icon,
  title,
  right,
}: {
  icon: ReactNode
  title: string
  right?: ReactNode
}) {
  return (
    <div className="flex justify-between items-center mb-3">
      <div className="flex items-center gap-2">
        <span className="text-gray-400 dark:text-white/50">{icon}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-white">{title}</span>
      </div>
      {right}
    </div>
  )
}

/** Badge semântico */
export function DSBadge({
  type = "info",
  children,
}: {
  type?: "info" | "positive" | "warning" | "brand"
  children: ReactNode
}) {
  const styles = {
    info: "bg-info-bg text-info-text",
    positive: "bg-positive-bg text-positive-text",
    warning: "bg-warning-bg text-warning-text",
    brand: "bg-brand-50 text-brand-400",
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-[2px] rounded-sm text-badge font-semibold",
      styles[type]
    )}>
      {children}
    </span>
  )
}

/** Section label — uppercase label para zonas */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-gray-400 dark:text-white/50 dark:text-white/40 tracking-[0.06em] uppercase mb-3">
      {children}
    </div>
  )
}

/** Outlined icon wrapper (SVG 24x24, 2px stroke) */
export function OIcon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

// ============================================================================
// Ícones inline — reutilizáveis
// ============================================================================

export function IconFlag({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </OIcon>
  )
}

export function IconCalendar({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </OIcon>
  )
}

export function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polyline points="20 6 9 17 4 12" />
    </OIcon>
  )
}

export function IconBolt({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </OIcon>
  )
}

export function IconChart({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </OIcon>
  )
}

export function IconTarget({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </OIcon>
  )
}

export function IconFire({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </OIcon>
  )
}

export function IconDoc({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </OIcon>
  )
}

export function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </OIcon>
  )
}

export function IconClose({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </OIcon>
  )
}

export function IconPlay({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </OIcon>
  )
}

export function IconPause({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </OIcon>
  )
}

export function IconRefresh({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </OIcon>
  )
}

export function IconSun({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
    </OIcon>
  )
}

export function IconMoon({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </OIcon>
  )
}

export function IconExtLink({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </OIcon>
  )
}

export function IconClock({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </OIcon>
  )
}

export function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polyline points="9 18 15 12 9 6" />
    </OIcon>
  )
}

export function IconChevronLeft({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <polyline points="15 18 9 12 15 6" />
    </OIcon>
  )
}

export function IconUsers({ size = 16 }: { size?: number }) {
  return (
    <OIcon size={size}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </OIcon>
  )
}
