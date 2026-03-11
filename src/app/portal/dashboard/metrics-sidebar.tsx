"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData } from "./types"

interface MetricsSidebarProps {
  klaviyo?: KlaviyoData
  storeOrders: number
}

export function MetricsSidebar({ klaviyo, storeOrders }: MetricsSidebarProps) {
  const storeRevenue = klaviyo?.storeRevenue || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const ticketMedio = storeOrders > 0 ? storeRevenue / storeOrders : 0
  const recoveryRate = klaviyo?.recoveryRate || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0

  const metrics = [
    {
      label: "Vendas",
      value: formatCurrency(storeRevenue),
      change: 12,
      trend: "up" as const,
    },
    {
      label: "Ticket Medio",
      value: formatCurrency(ticketMedio),
      change: 8,
      trend: "up" as const,
    },
    {
      label: "Receita Flows",
      value: formatCurrency(flowRevenue),
      change: 15,
      trend: "up" as const,
    },
    {
      label: "Receita Campanhas",
      value: formatCurrency(campaignRevenue),
      change: 5,
      trend: "up" as const,
    },
    {
      label: "Recuperacao de Carrinho",
      value: formatPercent(recoveryRate),
      change: 3,
      trend: "up" as const,
    },
    {
      label: "Atribuicao Klaviyo",
      value: formatCurrency(totalRevenue),
      change: 10,
      trend: "up" as const,
    },
  ]

  return (
    <div className="space-y-3">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  )
}

function MetricCard({
  label,
  value,
  change,
  trend,
}: {
  label: string
  value: string
  change: number
  trend: "up" | "down"
}) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20">
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2">{label}</p>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">{value}</p>
      <div className="flex items-center gap-1.5">
        {trend === "up" ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
        )}
        <span className={`text-xs font-medium ${trend === "up" ? "text-emerald-500" : "text-red-500"}`}>
          {change}%
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">vs periodo anterior</span>
      </div>
    </div>
  )
}
