import * as React from 'react'
import { ArrowUp, ArrowDown, Minus, Info } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'

// ─── Types ───────────────────────────────────────────────

interface KpiCardProps {
  /** Label descritivo (ex: "Receita Total", "Clientes Ativos") */
  label: string
  /** Valor formatado como string (ex: "R$ 842.567", "248", "32.5%") */
  value: string
  /** Delta de variação */
  delta?: {
    /** Valor numérico da variação (ex: 16.4, -3.2, 0). `null` = referência
     *  indisponível/incompleta — renderiza "—" em vez de um % enganoso. */
    value: number | null
    /** Label opcional (ex: "vs mês anterior") */
    label?: string
  }
  /** Array de números para sparkline (últimos 7-30 pontos) */
  sparkData?: number[]
  /** Variante visual — MÁXIMO 1 gradient por página */
  variant?: 'default' | 'gradient'
  /** Estado de loading */
  loading?: boolean
  /** Tooltip descritivo exibido ao passar o mouse */
  tooltip?: string
}

// ─── Sparkline ───────────────────────────────────────────

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  variant?: 'default' | 'gradient'
}

function Sparkline({ data, width = 80, height = 24, variant = 'default' }: SparklineProps) {
  const gradientId = React.useId()

  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - ((value - min) / range) * (height - 4) - 2,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  const isGradient = variant === 'gradient'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {isGradient ? (
            <>
              <stop offset="0%" stopColor="white" stopOpacity={0.2} />
              <stop offset="100%" stopColor="white" stopOpacity={0.05} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--sparkline-color, #4E62D8)" stopOpacity={0.22} />
              <stop offset="50%" stopColor="var(--sparkline-color, #4E62D8)" stopOpacity={0.06} />
              <stop offset="100%" stopColor="var(--sparkline-color, #4E62D8)" stopOpacity={0.01} />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line stroke */}
      <path
        d={linePath}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          isGradient
            ? 'stroke-white'
            : 'stroke-[#4E62D8] dark:stroke-[#7B8CEA]'
        )}
      />
    </svg>
  )
}

// ─── Skeleton ────────────────────────────────────────────

function KpiCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'gradient' }) {
  const isGradient = variant === 'gradient'
  return (
    <div className={cn(
      'rounded-[8px] p-5 animate-pulse',
      isGradient
        ? 'bg-gradient-to-br from-[#4E62D8] via-[#2137B6] to-[#041366]'
        : 'bg-white border border-[rgba(0,0,0,0.08)] dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]',
    )}>
      {/* Label skeleton */}
      <div className={cn(
        'h-3 w-24 rounded',
        isGradient ? 'bg-white/20' : 'bg-gray-100 dark:bg-[#242836]',
      )} />
      {/* Value skeleton */}
      <div className={cn(
        'h-8 w-32 rounded mt-3',
        isGradient ? 'bg-white/20' : 'bg-gray-100 dark:bg-[#242836]',
      )} />
      {/* Delta + spark skeleton */}
      <div className="flex items-end justify-between mt-3">
        <div className={cn(
          'h-4 w-16 rounded',
          isGradient ? 'bg-white/20' : 'bg-gray-100 dark:bg-[#242836]',
        )} />
        <div className={cn(
          'h-6 w-20 rounded',
          isGradient ? 'bg-white/20' : 'bg-gray-100 dark:bg-[#242836]',
        )} />
      </div>
    </div>
  )
}

// ─── KpiCard ─────────────────────────────────────────────

export function KpiCard({ label, value, delta, sparkData, variant = 'default', loading, tooltip }: KpiCardProps) {
  const isGradient = variant === 'gradient'

  if (loading) return <KpiCardSkeleton variant={variant} />

  return (
    <div className={cn(
      'rounded-[8px] p-5 transition-colors duration-150',
      isGradient
        ? 'bg-gradient-to-br from-[#4E62D8] via-[#2137B6] to-[#041366] dark:from-[#7B8CEA] dark:via-[#5A6EE0] dark:to-[#3B50C8]'
        : 'bg-white border border-[rgba(0,0,0,0.08)] dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]',
    )}>
      {/* Label */}
      <div className="flex items-center gap-1.5">
        <p className={cn(
          'text-[13px] font-medium leading-tight',
          isGradient ? 'text-white/70' : 'text-gray-500 dark:text-[#8B92A5]',
        )}>
          {label}
        </p>
        {tooltip && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={cn(
                  'inline-flex shrink-0 rounded-full p-0.5 transition-colors',
                  isGradient
                    ? 'text-white/40 hover:text-white/70'
                    : 'text-gray-300 hover:text-gray-500 dark:text-[#5C6378] dark:hover:text-[#8B92A5]',
                )}>
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Value */}
      <p className={cn(
        'text-[32px] font-semibold tracking-[-0.03em] tabular-nums mt-2 leading-none',
        isGradient ? 'text-white' : 'text-gray-900 dark:text-[#EAEDF3]',
      )}>
        {value}
      </p>

      {/* Delta + Sparkline */}
      {(delta || (sparkData && sparkData.length > 1)) && (
        <div className="flex items-end justify-between mt-3 gap-4">
          {/* Delta (left) — value null = referência 90d incompleta */}
          {delta && delta.value === null && (
            <div className="flex flex-col">
              <span className={cn(
                'text-[13px] font-medium font-mono',
                isGradient ? 'text-white/60' : 'text-gray-400 dark:text-[#5C6378]',
              )}>
                —
              </span>
              <span className={cn(
                'text-[11px] mt-0.5',
                isGradient ? 'text-white/50' : 'text-gray-400 dark:text-[#5C6378]',
              )}>
                {delta.label ?? 'sem referência'}
              </span>
            </div>
          )}
          {delta && delta.value !== null && (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                {delta.value > 0 && (
                  <Icon
                    icon={ArrowUp}
                    customSize={14}
                    className={cn(
                      isGradient ? 'text-white' : 'text-[#065F46] dark:text-[#6EE7B7]'
                    )}
                  />
                )}
                {delta.value < 0 && (
                  <Icon
                    icon={ArrowDown}
                    customSize={14}
                    className={cn(
                      isGradient ? 'text-white' : 'text-[#991B1B] dark:text-[#FCA5A5]'
                    )}
                  />
                )}
                {delta.value === 0 && (
                  <Icon
                    icon={Minus}
                    customSize={14}
                    className={cn(
                      isGradient ? 'text-white/60' : 'text-gray-500 dark:text-[#5C6378]'
                    )}
                  />
                )}
                <span className={cn(
                  'text-[13px] font-medium font-mono tabular-nums',
                  isGradient
                    ? 'text-white'
                    : delta.value > 0
                      ? 'text-[#065F46] dark:text-[#6EE7B7]'
                      : delta.value < 0
                        ? 'text-[#991B1B] dark:text-[#FCA5A5]'
                        : 'text-gray-500 dark:text-[#5C6378]',
                )}>
                  {delta.value > 0 ? '+' : ''}{delta.value}%
                </span>
              </div>
              {delta.label && (
                <span className={cn(
                  'text-[11px] mt-0.5',
                  isGradient ? 'text-white/50' : 'text-gray-400 dark:text-[#5C6378]',
                )}>
                  {delta.label}
                </span>
              )}
            </div>
          )}

          {/* Sparkline (right) */}
          {sparkData && sparkData.length > 1 && (
            <Sparkline data={sparkData} width={80} height={24} variant={variant} />
          )}
        </div>
      )}
    </div>
  )
}
