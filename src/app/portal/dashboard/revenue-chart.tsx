"use client"

import { useMemo } from "react"
import { formatCurrency } from "@/lib/utils/format"

interface RevenueDataPoint {
  date: string
  value: number
  previousValue?: number
}

interface RevenueChartProps {
  data?: RevenueDataPoint[]
  title?: string
  className?: string
}

export function RevenueChart({ data, title = "Receita no Período", className = "" }: RevenueChartProps) {
  // Generate sample data if none provided
  const chartData = useMemo(() => {
    if (data && data.length > 0) return data

    // Sample data for demonstration
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return months.map((month) => ({
      date: month,
      value: Math.floor(Math.random() * 50000) + 30000,
      previousValue: Math.floor(Math.random() * 45000) + 25000,
    }))
  }, [data])

  const maxValue = Math.max(...chartData.map(d => Math.max(d.value, d.previousValue || 0)))
  const minValue = Math.min(...chartData.map(d => Math.min(d.value, d.previousValue || d.value)))
  const range = maxValue - minValue || 1
  const padding = range * 0.1

  // Generate path for the area chart
  const generatePath = (values: number[], filled: boolean) => {
    const width = 100
    const height = 100
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - minValue + padding) / (range + padding * 2)) * height
      return { x, y }
    })

    const pathD = points
      .map((point, i) => {
        if (i === 0) return `M ${point.x} ${point.y}`

        // Use curved lines for smoother appearance
        const prev = points[i - 1]
        const cpX = (prev.x + point.x) / 2
        return `C ${cpX} ${prev.y} ${cpX} ${point.y} ${point.x} ${point.y}`
      })
      .join(" ")

    if (filled) {
      return `${pathD} L 100 100 L 0 100 Z`
    }
    return pathD
  }

  const currentPath = generatePath(chartData.map(d => d.value), false)
  const currentAreaPath = generatePath(chartData.map(d => d.value), true)
  const previousPath = chartData[0]?.previousValue !== undefined
    ? generatePath(chartData.map(d => d.previousValue || 0), false)
    : null

  return (
    <div className={`bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
          {title}
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-cyan-500 rounded-full" />
            <span className="text-slate-500 dark:text-slate-400">Período atual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
            <span className="text-slate-500 dark:text-slate-400">Período anterior</span>
          </div>
        </div>
      </div>

      {/* Y-axis labels */}
      <div className="flex gap-4">
        <div className="flex flex-col justify-between text-right py-2 w-16 flex-shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatCurrency(maxValue + padding)}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatCurrency((maxValue + minValue) / 2)}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatCurrency(minValue)}</span>
        </div>

        {/* Chart SVG */}
        <div className="flex-1 relative">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-48"
          >
            {/* Grid lines */}
            <defs>
              <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.3" className="text-slate-200 dark:text-slate-700" strokeDasharray="2,2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.3" className="text-slate-200 dark:text-slate-700" strokeDasharray="2,2" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.3" className="text-slate-200 dark:text-slate-700" strokeDasharray="2,2" />

            {/* Area fill */}
            <path
              d={currentAreaPath}
              fill="url(#areaGradient)"
            />

            {/* Previous period line */}
            {previousPath && (
              <path
                d={previousPath}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4,3"
                className="text-slate-300 dark:text-slate-600"
              />
            )}

            {/* Current period line */}
            <path
              d={currentPath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {chartData.map((_, index) => {
              const x = (index / (chartData.length - 1)) * 100
              const y = 100 - ((chartData[index].value - minValue + padding) / (range + padding * 2)) * 100
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="2"
                  fill="#06b6d4"
                  className="opacity-0 hover:opacity-100 transition-opacity"
                />
              )
            })}
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2">
            {chartData.map((point, i) => (
              <span
                key={i}
                className="text-[10px] text-slate-400 dark:text-slate-500"
                style={{
                  visibility: i % Math.ceil(chartData.length / 6) === 0 || i === chartData.length - 1 ? 'visible' : 'hidden'
                }}
              >
                {point.date}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
