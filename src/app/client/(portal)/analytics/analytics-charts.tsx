"use client"

import { useMemo } from "react"
import { DollarSign, Users } from "lucide-react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import type { KlaviyoData } from "../dashboard/types"

// ─── Revenue Area Chart ─────────────────────────────────

export function RevenueAreaChart({ klaviyo }: { klaviyo?: KlaviyoData }) {
  // Build mock time-series from available data
  // In production this would come from a series endpoint
  const chartData = useMemo(() => {
    if (!klaviyo) return []
    const totalRevenue = klaviyo.totalRevenue || 0
    const storeRevenue = klaviyo.storeRevenue || 0
    // Generate 6 data points simulating distribution
    const labels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"]
    const base = totalRevenue / 4
    const storeBase = storeRevenue / 4
    return labels.map((label, _i) => {
      const variance = 0.7 + Math.random() * 0.6
      return {
        name: label,
        atribuida: Math.round(base * variance),
        loja: Math.round(storeBase * variance),
      }
    })
  }, [klaviyo])

  if (!klaviyo || chartData.length === 0) {
    return (
      <EmptyState compact icon={DollarSign} title="Nenhum dado de receita disponível" className="py-12" />
    )
  }

  return (
    <div className="h-[200px] sm:h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fillAtribuida" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4E8FFF" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#4E8FFF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillLoja" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          />
          <RechartsTooltip
            contentStyle={{
              background: "#1F2937",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
              color: "#F9FAFB",
            }}
            formatter={(value) => [formatCurrency(Number(value)), undefined]}
          />
          <Area
            type="monotone"
            dataKey="loja"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#fillLoja)"
            name="Receita Loja"
          />
          <Area
            type="monotone"
            dataKey="atribuida"
            stroke="#4E8FFF"
            strokeWidth={2}
            fill="url(#fillAtribuida)"
            name="Receita Atribuída"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Audience Donut ─────────────────────────────────────

const DONUT_COLORS = ["#10B981", "#F59E0B", "#9CA3AF"]

export function AudienceDonut({ klaviyo }: { klaviyo?: KlaviyoData }) {
  const totalLeads = klaviyo?.totalLeads || 0
  const engagedLeads = klaviyo?.engagedLeads || 0
  const suppressedEstimate = Math.round(totalLeads * (klaviyo?.unsubscribeRate || 0) / 100)
  const nonEngaged = Math.max(0, totalLeads - engagedLeads - suppressedEstimate)

  const donutData = [
    { name: "Engajados", value: engagedLeads },
    { name: "Não-engajados", value: nonEngaged },
    { name: "Suprimidos", value: suppressedEstimate },
  ].filter((d) => d.value > 0)

  if (totalLeads === 0) {
    return (
      <EmptyState compact icon={Users} title="Nenhum dado de audiência" className="py-12" />
    )
  }

  return (
    <div className="flex items-center gap-6">
      <div className="w-[120px] h-[120px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {donutData.map((_, index) => (
                <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 flex-1">
        {donutData.map((item, i) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i] }} />
            <span className="text-xs text-gray-400 dark:text-[#5C6378] flex-1">{item.name}</span>
            <span className="text-xs font-bold text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
              {formatNumber(item.value)}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-[#5C6378] w-10 text-right font-mono tabular-nums">
              {totalLeads > 0 ? ((item.value / totalLeads) * 100).toFixed(1) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
