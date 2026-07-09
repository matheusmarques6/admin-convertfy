"use client"

/**
 * Gráfico de custo por dia do dashboard de IA — isolado para que o
 * recharts saia do First Load JS da rota (carregado via next/dynamic
 * pelo ai-usage-dashboard).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface AiUsageCostChartPoint {
  day: string
  cost_usd: number
}

export function AiUsageCostChart({ data }: { data: AiUsageCostChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10 }}
          tickFormatter={(d: string) => d.slice(5)}
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
        <Tooltip
          formatter={(value) => [`$${Number(value ?? 0).toFixed(4)}`, "Custo"]}
        />
        <Bar dataKey="cost_usd" fill="#1F1F1F" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
