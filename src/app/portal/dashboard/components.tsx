import { TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrencyCompact, formatNumber } from "@/lib/utils/format"

// Badge de variação (up/down)
export function VariationBadge({ value, type = "percent" }: { value: number; type?: "percent" | "currency" }) {
  const isPositive = value >= 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const bgColor = isPositive ? "bg-emerald-500/20" : "bg-red-500/20"
  const textColor = isPositive ? "text-emerald-400" : "text-red-400"

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${bgColor} ${textColor}`}>
      <Icon className="h-3 w-3" />
      {type === "percent" ? `${isPositive ? "+" : ""}${value.toFixed(1)}%` : formatCurrencyCompact(Math.abs(value))}
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
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all ${
      highlight
        ? "bg-emerald-500/10 border-emerald-500/30"
        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${highlight ? "text-emerald-400" : "text-zinc-400"}`} />
        <span className="text-xs text-zinc-400 uppercase tracking-wide">{title}</span>
      </div>
      <p className={`text-2xl font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
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
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-white">{formatCurrencyCompact(value)}</p>
        <p className="text-xs text-zinc-500">{percent.toFixed(0)}%</p>
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
        ? `${color} border-current`
        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${active ? "text-current" : "text-zinc-400"}`} />
        <span className="text-xs text-zinc-400">{title}</span>
      </div>
      <p className={`text-2xl font-bold ${active ? "text-white" : "text-zinc-300"}`}>
        {percent.toFixed(1)}%
      </p>
      <p className="text-xs text-zinc-500 mt-1">{formatCurrencyCompact(value)}</p>
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
    <div className={`flex items-center gap-4 py-3 px-2 rounded-lg ${isTop ? "bg-emerald-500/5" : ""}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        rank <= 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
      }`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{name}</p>
      </div>
      <div className="grid grid-cols-4 gap-4 text-right">
        <div>
          <p className="text-sm text-zinc-300">{formatNumber(delivered)}</p>
          <p className="text-[10px] text-zinc-600">Entregues</p>
        </div>
        <div>
          <p className="text-sm text-zinc-300">{openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-zinc-600">Abertura</p>
        </div>
        <div>
          <p className="text-sm text-zinc-300">{clickRate.toFixed(1)}%</p>
          <p className="text-[10px] text-zinc-600">Clique</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-400">{formatCurrencyCompact(revenue)}</p>
          <p className="text-[10px] text-zinc-600">Receita</p>
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
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-12 text-right">{value.toFixed(1)}%</span>
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

  const strokeColor = color === "emerald" ? "#10b981" : "#3b82f6"

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
