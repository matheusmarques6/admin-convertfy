"use client"

import { useState, useMemo } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip as InfoTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

// ─── Types ────────────────────────────────────────────────

type MetricKey =
  | "openRate"
  | "clickRate"
  | "ctor"
  | "placedOrder"
  | "rpe"
  | "deliverability"

interface MetricDefinition {
  key: MetricKey
  label: string
  value: string
  delta: number
  format: "percent" | "currency"
}

interface ChartPoint {
  day: string
  current: number
  previous: number
}

interface DashboardEmailPerfProps {
  loading?: boolean
}

// ─── Empty chart data (zeros — awaiting sync) ───────────

const DAYS = Array.from({ length: 30 }, (_, i) =>
  new Date(2026, 1, i + 1).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
)

const EMPTY_SERIES: Record<MetricKey, { current: number[]; previous: number[] }> = {
  openRate: { current: Array(30).fill(0), previous: Array(30).fill(0) },
  clickRate: { current: Array(30).fill(0), previous: Array(30).fill(0) },
  ctor: { current: Array(30).fill(0), previous: Array(30).fill(0) },
  placedOrder: { current: Array(30).fill(0), previous: Array(30).fill(0) },
  rpe: { current: Array(30).fill(0), previous: Array(30).fill(0) },
  deliverability: { current: Array(30).fill(0), previous: Array(30).fill(0) },
}

function getChartData(metric: MetricKey): ChartPoint[] {
  const series = EMPTY_SERIES[metric]
  return DAYS.map((day, i) => ({
    day,
    current: series.current[i],
    previous: series.previous[i],
  }))
}

// ─── Metric definitions (empty — filled by sync data) ───

const METRICS: MetricDefinition[] = [
  { key: "openRate", label: "Open Rate", value: "—", delta: 0, format: "percent" },
  { key: "clickRate", label: "Click Rate", value: "—", delta: 0, format: "percent" },
  { key: "ctor", label: "CTOR", value: "—", delta: 0, format: "percent" },
  { key: "placedOrder", label: "Placed Order", value: "—", delta: 0, format: "percent" },
  { key: "rpe", label: "RPE", value: "—", delta: 0, format: "currency" },
  { key: "deliverability", label: "Deliverability", value: "—", delta: 0, format: "percent" },
]

// ─── Footer stats ───────────────────────────────────────

const FOOTER_STATS = [
  { label: "Volume de Envios", value: "—" },
  { label: "Perfis Ativos", value: "—" },
  { label: "Engajados (90d)", value: "—" },
  { label: "Unsub Rate", value: "0.08%" },
]

// ─── Custom Tooltip ─────────────────────────────────────

function EmailPerfTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
  format: "percent" | "currency"
}) {
  if (!active || !payload?.length) return null

  const fmt = (v: number) =>
    format === "currency" ? `R$ ${v.toFixed(2)}` : `${v.toFixed(1)}%`

  return (
    <div
      className={cn(
        "rounded-[6px] px-3 py-2 shadow-lg",
        "bg-gray-900 dark:bg-[#242836]",
        "text-sm text-white dark:text-[#EAEDF3]",
      )}
    >
      <p className="text-xs text-gray-400 dark:text-[#5C6378] mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p
          key={i}
          className={cn(
            "font-mono tabular-nums font-medium",
            entry.dataKey === "previous" && "text-gray-400 dark:text-[#5C6378]",
          )}
        >
          {entry.dataKey === "current" ? "Atual: " : "Anterior: "}
          {fmt(entry.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Metric Tile ────────────────────────────────────────

function MetricTile({
  metric,
  selected,
  onClick,
}: {
  metric: MetricDefinition
  selected: boolean
  onClick: () => void
}) {
  const isPositive = metric.delta >= 0
  const deltaPrefix = isPositive ? "+" : ""
  const deltaSuffix = metric.format === "currency" ? "" : "%"

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-[6px] p-3 text-left transition-colors",
        "border",
        selected
          ? "border-[#7B8CEA] bg-[#4E62D8]/5 dark:border-[#7B8CEA] dark:bg-[#4E62D8]/10"
          : "border-black/[0.08] bg-transparent hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.03]",
      )}
    >
      <span
        className={cn(
          "text-xs leading-none",
          selected
            ? "text-[#4E62D8] dark:text-[#7B8CEA]"
            : "text-gray-500 dark:text-[#8B92A5]",
        )}
      >
        {metric.label}
      </span>
      <span
        className={cn(
          "mt-1.5 text-2xl font-semibold font-mono tabular-nums leading-none",
          selected
            ? "text-[#4E62D8] dark:text-[#7B8CEA]"
            : "text-gray-900 dark:text-[#EAEDF3]",
        )}
      >
        {metric.value}
      </span>
      <span
        className={cn(
          "mt-1.5 flex items-center gap-0.5 text-xs font-mono tabular-nums",
          isPositive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400",
        )}
      >
        <span className="text-[10px] leading-none">{isPositive ? "\u2191" : "\u2193"}</span>
        {deltaPrefix}
        {Math.abs(metric.delta).toFixed(1)}
        {deltaSuffix}
      </span>
    </button>
  )
}

// ─── Skeleton ───────────────────────────────────────────

function EmailPerfSkeleton() {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-black/[0.08] bg-white p-6",
        "dark:border-white/[0.08] dark:bg-[#1A1D27]",
      )}
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-4 w-44 rounded bg-gray-100 dark:bg-[#242836] animate-pulse" />
          <div className="mt-2 h-3 w-64 rounded bg-gray-100 dark:bg-[#242836] animate-pulse" />
        </div>
        <div className="h-3 w-36 rounded bg-gray-100 dark:bg-[#242836] animate-pulse" />
      </div>

      {/* Metric tiles skeleton */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[82px] rounded-[6px] bg-gray-50 dark:bg-[#242836] animate-pulse"
          />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="mt-5 h-[200px] rounded-[8px] bg-gray-50 dark:bg-[#242836] animate-pulse" />

      {/* Footer skeleton */}
      <div className="mt-5 border-t border-black/[0.08] dark:border-white/[0.08] pt-4">
        <div className="flex justify-between">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-3 w-20 rounded bg-gray-100 dark:bg-[#242836] animate-pulse" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-[#242836] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────

export function DashboardEmailPerf({ loading = false }: DashboardEmailPerfProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("openRate")

  const chartData = useMemo(() => getChartData(selectedMetric), [selectedMetric])
  const selectedDef = METRICS.find((m) => m.key === selectedMetric)!

  const domain = useMemo(() => {
    const allValues = chartData.flatMap((d) => [d.current, d.previous])
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.15
    return [
      Math.floor((min - padding) * 10) / 10,
      Math.ceil((max + padding) * 10) / 10,
    ] as [number, number]
  }, [chartData])

  if (loading) return <EmailPerfSkeleton />

  return (
    <div
      className={cn(
        "rounded-[8px] border border-black/[0.08] bg-white p-6",
        "dark:border-white/[0.08] dark:bg-[#1A1D27]",
      )}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-700 dark:text-[#C1C7D4]">
              Performance do Email
            </h3>
            <TooltipProvider delayDuration={200}>
              <InfoTooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                  Métricas consolidadas de email: abertura, clique, CTOR, taxa de pedidos, receita por email e deliverability. Inclui volume de envios, perfis ativos e engajados nos últimos 90 dias.
                </TooltipContent>
              </InfoTooltip>
            </TooltipProvider>
          </div>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-[#5C6378] font-mono tabular-nums">
            198.6K entregues &middot; R$ 847K receita atribuida
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500 dark:text-[#8B92A5]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0 border-t-2 border-[#4E62D8] dark:border-[#7B8CEA]" />
            Atual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0 border-t-2 border-dashed border-gray-300 dark:border-[#5C6378]" />
            Periodo anterior
          </span>
        </div>
      </div>

      {/* ── Metric Grid ────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {METRICS.map((metric) => (
          <MetricTile
            key={metric.key}
            metric={metric}
            selected={selectedMetric === metric.key}
            onClick={() => setSelectedMetric(metric.key)}
          />
        ))}
      </div>

      {/* ── Chart ──────────────────────────────────────── */}
      <div className="mt-5">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="emailPerfGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4E62D8" stopOpacity={0.18} />
                <stop offset="50%" stopColor="#4E62D8" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#4E62D8" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid
              horizontal
              vertical={false}
              stroke="#F3F4F6"
              className="dark:opacity-10"
            />

            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={domain}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              tickFormatter={(v: number) =>
                selectedDef.format === "currency"
                  ? `R$${v.toFixed(2)}`
                  : `${v.toFixed(1)}%`
              }
              width={58}
            />

            <Tooltip
              content={<EmailPerfTooltip format={selectedDef.format} />}
            />

            <Area
              type="monotone"
              dataKey="previous"
              stroke="#D1D5DB"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              fill="none"
              dot={false}
              opacity={0.45}
            />

            <Area
              type="monotone"
              dataKey="current"
              stroke="#4E62D8"
              strokeWidth={2}
              fill="url(#emailPerfGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#4E62D8",
                stroke: "#FFFFFF",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="mt-5 border-t border-black/[0.08] dark:border-white/[0.08] pt-4">
        <div className="flex items-center justify-between gap-4">
          {FOOTER_STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center text-center">
              <span className="text-[11px] text-gray-400 dark:text-[#5C6378]">
                {stat.label}
              </span>
              <span className="mt-0.5 text-[13px] font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
