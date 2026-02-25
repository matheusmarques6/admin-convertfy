import { TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { GlowColor } from "@/components/ui/glow-card"

// Badge de variação (up/down)
export function VariationBadge({ value, type = "percent" }: { value: number; type?: "percent" | "currency" }) {
  const isPositive = value >= 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
      isPositive
        ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        : "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400"
    }`}>
      <Icon className="h-3 w-3" />
      {type === "percent" ? `${isPositive ? "+" : ""}${value.toFixed(1)}%` : formatCurrency(Math.abs(value))}
    </span>
  )
}

// Card de métrica
export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  highlight = false,
  glowColor,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  highlight?: boolean
  glowColor?: GlowColor
}) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
          highlight ? "bg-primary/10" : "bg-slate-100 dark:bg-slate-800"
        }`}>
          <Icon className={`h-3.5 w-3.5 ${highlight ? "text-primary" : "text-slate-500 dark:text-slate-400"}`} />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{title}</span>
      </div>
      <p className={`text-xl font-bold ${highlight ? "text-primary" : "text-slate-800 dark:text-slate-100"}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

// Item da lista de Top Flows
export function FlowListItem({
  name,
  value,
  percent,
  color,
}: {
  name: string
  value: number
  percent: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-700/30 last:border-0">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatCurrency(value)}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{percent.toFixed(0)}%</p>
      </div>
    </div>
  )
}

// Card de canal de receita
export function ChannelCard({
  title,
  percent,
  value,
  icon: Icon,
  color,
  active = false,
}: {
  title: string
  percent: number
  value: number
  icon: React.ElementType
  color: string
  active?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all cursor-pointer ${
      active
        ? "bg-primary/5 dark:bg-primary/10 border-primary/30 shadow-sm"
        : "bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 hover:border-slate-300 dark:hover:border-slate-600"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-slate-400 dark:text-slate-500"}`} />
        <span className="text-xs text-slate-500 dark:text-slate-400">{title}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        {percent.toFixed(1)}%
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatCurrency(value)}</p>
    </div>
  )
}

// Linha da tabela de performance
export function PerformanceRow({
  rank,
  name,
  delivered,
  openRate,
  clickRate,
  revenue,
  isTop = false,
}: {
  rank: number
  name: string
  delivered: number
  openRate: number
  clickRate: number
  revenue: number
  isTop?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 py-3 px-3 rounded-lg ${isTop ? "bg-emerald-50/50 dark:bg-emerald-500/5" : ""}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        rank <= 3 ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
      }`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{name}</p>
      </div>
      <div className="grid grid-cols-4 gap-4 text-right">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{formatNumber(delivered)}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Entregues</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Abertura</p>
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{clickRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Clique</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(revenue)}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Receita</p>
        </div>
      </div>
    </div>
  )
}

// Mini gráfico de barras horizontal
export function MiniBarChart({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 w-12 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

// Gráfico de linha simples (sparkline)
export function SimpleLineChart({ data, color = "emerald" }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 80 - 10
    return `${x},${y}`
  }).join(" ")

  const strokeColor = color === "emerald" ? "#05AFF2" : "#05AFF2"

  return (
    <div className="h-20 w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((value, index) => {
          const x = (index / (data.length - 1)) * 100
          const y = 100 - ((value - min) / range) * 80 - 10
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              fill={strokeColor}
              className="opacity-80"
            />
          )
        })}
      </svg>
    </div>
  )
}
