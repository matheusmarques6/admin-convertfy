"use client"

import { useState, useCallback, useRef } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────

interface RevenueDataPoint {
  month: string
  current: number
  previous: number
  fatAtribuido: number
  campanhas: number
  automacoes: number
  fatTotalLojas: number
  taxaReceita: number
}

interface DashboardRevenueChartProps {
  loading?: boolean
  period: string
}

// ─── Mock Data ────────────────────────────────────────────

const MOCK_DATA: RevenueDataPoint[] = [
  { month: "Jan", current: 42, previous: 35, fatAtribuido: 42000, campanhas: 24000, automacoes: 18000, fatTotalLojas: 210000, taxaReceita: 20.0 },
  { month: "Fev", current: 38, previous: 32, fatAtribuido: 38000, campanhas: 22000, automacoes: 16000, fatTotalLojas: 195000, taxaReceita: 19.5 },
  { month: "Mar", current: 55, previous: 40, fatAtribuido: 55000, campanhas: 31000, automacoes: 24000, fatTotalLojas: 260000, taxaReceita: 21.2 },
  { month: "Abr", current: 48, previous: 42, fatAtribuido: 48000, campanhas: 27000, automacoes: 21000, fatTotalLojas: 235000, taxaReceita: 20.4 },
  { month: "Mai", current: 62, previous: 45, fatAtribuido: 62000, campanhas: 35000, automacoes: 27000, fatTotalLojas: 290000, taxaReceita: 21.4 },
  { month: "Jun", current: 58, previous: 48, fatAtribuido: 58000, campanhas: 33000, automacoes: 25000, fatTotalLojas: 275000, taxaReceita: 21.1 },
  { month: "Jul", current: 70, previous: 52, fatAtribuido: 70000, campanhas: 40000, automacoes: 30000, fatTotalLojas: 320000, taxaReceita: 21.9 },
  { month: "Ago", current: 65, previous: 55, fatAtribuido: 65000, campanhas: 37000, automacoes: 28000, fatTotalLojas: 305000, taxaReceita: 21.3 },
  { month: "Set", current: 78, previous: 58, fatAtribuido: 78000, campanhas: 44000, automacoes: 34000, fatTotalLojas: 355000, taxaReceita: 22.0 },
  { month: "Out", current: 72, previous: 60, fatAtribuido: 72000, campanhas: 41000, automacoes: 31000, fatTotalLojas: 330000, taxaReceita: 21.8 },
  { month: "Nov", current: 88, previous: 65, fatAtribuido: 88000, campanhas: 50000, automacoes: 38000, fatTotalLojas: 395000, taxaReceita: 22.3 },
  { month: "Dez", current: 95, previous: 70, fatAtribuido: 95000, campanhas: 54000, automacoes: 41000, fatTotalLojas: 420000, taxaReceita: 22.6 },
]

// ─── Custom Tooltip ───────────────────────────────────────

interface TooltipPayloadEntry {
  value: number
  dataKey: string
  payload: RevenueDataPoint
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
  coordinate?: { x: number; y: number }
  viewBox?: { x: number; y: number; width: number; height: number }
}

function CustomTooltip({ active, payload, label, coordinate, viewBox }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const data = payload[0]?.payload
  if (!data) return null

  const currentValue = data.current
  const previousValue = data.previous

  // Determine tooltip position: left or right of cursor
  const chartWidth = viewBox?.width ?? 600
  const cursorX = (coordinate?.x ?? 0) - (viewBox?.x ?? 0)
  const showOnLeft = cursorX > chartWidth / 2

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-50",
        "rounded-[6px] px-3.5 py-3 shadow-lg",
        "bg-gray-900 dark:bg-[#242836]",
        "text-[12px] leading-[18px] text-white dark:text-[#EAEDF3]",
        "min-w-[180px]",
      )}
      style={{
        transform: showOnLeft ? "translateX(-110%)" : "translateX(10%)",
      }}
    >
      <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-1.5 font-medium">
        {label}
      </p>

      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-0.5 rounded-full bg-[#4E62D8]" />
            Atual
          </span>
          <span className="font-mono tabular-nums font-medium">
            R$ {currentValue}K
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-0.5 rounded-full bg-gray-400 opacity-45" />
            Anterior
          </span>
          <span className="font-mono tabular-nums font-medium text-gray-400">
            R$ {previousValue}K
          </span>
        </div>
      </div>

      <div className="my-2 h-px bg-gray-700 dark:bg-[#3A3F50]" />

      <div className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 dark:text-[#8B92A5]">Fat. Atribuido</span>
          <span className="font-mono tabular-nums">
            R$ {(data.fatAtribuido / 1000).toFixed(0)}K
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 dark:text-[#8B92A5]">Campanhas</span>
          <span className="font-mono tabular-nums">
            R$ {(data.campanhas / 1000).toFixed(0)}K
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 dark:text-[#8B92A5]">Automacoes</span>
          <span className="font-mono tabular-nums">
            R$ {(data.automacoes / 1000).toFixed(0)}K
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 dark:text-[#8B92A5]">Fat. Total Lojas</span>
          <span className="font-mono tabular-nums">
            R$ {(data.fatTotalLojas / 1000).toFixed(0)}K
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 dark:text-[#8B92A5]">Taxa Receita</span>
          <span className="font-mono tabular-nums">
            {data.taxaReceita.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Custom Cursor (vertical dashed line + dots) ──────────

interface CustomCursorProps {
  points?: Array<{ x: number; y: number }>
  height?: number
  payload?: TooltipPayloadEntry[]
}

function CustomCursor({ points, height, payload }: CustomCursorProps) {
  if (!points?.length || !height) return null

  const x = points[0].x
  const data = payload?.[0]?.payload

  if (!data) return null

  return (
    <g>
      {/* Vertical dashed line */}
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="rgba(78,98,216,0.35)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
    </g>
  )
}

// ─── Skeleton Loading ─────────────────────────────────────

function ChartSkeleton() {
  return (
    <div
      className={cn(
        "rounded-[8px] p-6",
        "bg-white dark:bg-[#1A1D27]",
        "border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
      )}
    >
      {/* Header skeleton */}
      <div className="mb-5">
        <div className="h-4 w-36 bg-gray-100 dark:bg-[#242836] rounded animate-pulse" />
        <div className="h-3 w-52 bg-gray-50 dark:bg-[#1E2130] rounded animate-pulse mt-1.5" />
      </div>

      {/* Legend skeleton */}
      <div className="flex items-center gap-6 mb-4">
        <div className="h-3 w-16 bg-gray-100 dark:bg-[#242836] rounded animate-pulse" />
        <div className="h-3 w-28 bg-gray-50 dark:bg-[#1E2130] rounded animate-pulse" />
      </div>

      {/* Chart area skeleton */}
      <div
        className={cn(
          "h-[280px] bg-gray-50 dark:bg-[#1E2130] rounded-[8px] animate-pulse",
          "flex items-end justify-between px-6 pb-6 gap-3",
        )}
      >
        {[35, 55, 45, 70, 50, 65, 80, 60, 75, 85, 68, 90].map((h, i) => (
          <div
            key={i}
            className="w-full bg-gray-100 dark:bg-[#242836] rounded-t-[3px]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────

export function DashboardRevenueChart({ loading, period: _period }: DashboardRevenueChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = useCallback((state: any) => {
    if (state?.activeTooltipIndex !== undefined && state?.isTooltipActive) {
      setActiveIndex(state.activeTooltipIndex as number)
    } else {
      setActiveIndex(null)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null)
  }, [])

  if (loading) {
    return <ChartSkeleton />
  }

  return (
    <div
      ref={chartRef}
      className={cn(
        "rounded-[8px] p-6",
        "bg-white dark:bg-[#1A1D27]",
        "border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
      )}
    >
      {/* Header */}
      <div className="mb-1">
        <h3 className="text-[14px] font-medium leading-5 text-gray-700 dark:text-[#C8CDD8]">
          Receita Atribuida
        </h3>
        <p className="text-[12px] text-gray-400 dark:text-[#5C6378] mt-0.5">
          Atual vs anterior (milhares R$)
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 mt-3">
        <span className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-[#A0A7B8]">
          <svg width="16" height="2" viewBox="0 0 16 2" className="shrink-0">
            <line x1="0" y1="1" x2="16" y2="1" stroke="#4E62D8" strokeWidth="2" />
          </svg>
          Atual
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-gray-400 dark:text-[#5C6378]">
          <svg width="16" height="2" viewBox="0 0 16 2" className="shrink-0">
            <line
              x1="0" y1="1" x2="16" y2="1"
              stroke="#D1D5DB"
              strokeWidth="2"
              strokeDasharray="4 3"
              className="dark:stroke-[#5C6378]"
            />
          </svg>
          Periodo anterior
        </span>
      </div>

      {/* Chart */}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={MOCK_DATA}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="revenueAttrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4E62D8" stopOpacity={0.22} />
                <stop offset="50%" stopColor="#4E62D8" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#4E62D8" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="revenueAttrGradientDark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4E62D8" stopOpacity={0.12} />
                <stop offset="50%" stopColor="#4E62D8" stopOpacity={0.04} />
                <stop offset="100%" stopColor="#4E62D8" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines only */}
            <CartesianGrid
              horizontal={true}
              vertical={false}
              stroke="rgba(0,0,0,0.06)"
              className="dark:hidden"
            />
            <CartesianGrid
              horizontal={true}
              vertical={false}
              stroke="rgba(255,255,255,0.06)"
              className="hidden dark:block"
            />

            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              dy={8}
              className="[&_text]:dark:fill-[#5C6378]"
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9CA3AF", fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
              tickFormatter={(value: number) => `${value}K`}
              width={42}
              className="[&_text]:dark:fill-[#5C6378]"
            />

            <RechartsTooltip
              content={<CustomTooltip />}
              cursor={<CustomCursor />}
              isAnimationActive={false}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 50 }}
            />

            {/* Active index reference line (vertical dashed) */}
            {activeIndex !== null && MOCK_DATA[activeIndex] && (
              <ReferenceLine
                x={MOCK_DATA[activeIndex].month}
                stroke="rgba(78,98,216,0.25)"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            )}

            {/* Previous period area (dashed, muted) */}
            <Area
              type="monotone"
              dataKey="previous"
              name="previous"
              stroke="#D1D5DB"
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeOpacity={0.45}
              fill="none"
              dot={false}
              activeDot={{
                r: 3.5,
                fill: "#D1D5DB",
                stroke: "#FFFFFF",
                strokeWidth: 1.5,
                opacity: 0.7,
              }}
              className="dark:[&_path]:stroke-[#5C6378]"
            />

            {/* Current period area (solid, brand) */}
            <Area
              type="monotone"
              dataKey="current"
              name="current"
              stroke="#4E62D8"
              strokeWidth={2.5}
              fill="url(#revenueAttrGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#4E62D8",
                stroke: "#FFFFFF",
                strokeWidth: 2,
              }}
              className="dark:[&_path[fill]]:fill-[url(#revenueAttrGradientDark)]"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
