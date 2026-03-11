"use client"

import { formatCurrency, formatPercent } from "@/lib/utils/format"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { KlaviyoData, ShopifyData } from "./types"

interface MetricsSidebarProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
}

export function MetricsSidebar({ klaviyo }: MetricsSidebarProps) {
  const storeRevenue = klaviyo?.storeRevenue || 0
  const storeOrders = klaviyo?.storeOrders || 0
  const ticketMedio = storeOrders > 0 ? storeRevenue / storeOrders : 0
  const openRate = klaviyo?.openRate || 0
  const clickRate = klaviyo?.clickRate || 0
  const conversionRate = klaviyo?.conversionRate || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0

  const metrics = [
    {
      label: "Vendas",
      value: formatCurrency(storeRevenue),
      trend: 12,
      color: "emerald",
    },
    {
      label: "Ticket Médio",
      value: formatCurrency(ticketMedio),
      trend: 8.5,
      color: "cyan",
    },
    {
      label: "Receita de Flows",
      value: formatCurrency(flowRevenue),
      trend: 15,
      color: "violet",
    },
    {
      label: "Receita de Campanhas",
      value: formatCurrency(campaignRevenue),
      trend: -5.2,
      color: "amber",
    },
    {
      label: "Taxa de Abertura",
      value: formatPercent(openRate),
      trend: 3.2,
      color: "blue",
    },
    {
      label: "Taxa de Clique",
      value: formatPercent(clickRate),
      trend: 2.1,
      color: "pink",
    },
    {
      label: "Taxa de Conversão",
      value: formatPercent(conversionRate),
      trend: 1.8,
      color: "indigo",
    },
  ]

  return (
    <div className="space-y-3">
      {metrics.map((metric, index) => (
        <MetricItem
          key={index}
          label={metric.label}
          value={metric.value}
          trend={metric.trend}
        />
      ))}
    </div>
  )
}

function MetricItem({
  label,
  value,
  trend,
}: {
  label: string
  value: string
  trend: number
}) {
  const isPositive = trend >= 0

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <div className={`flex items-center gap-1 text-xs font-medium ${
          isPositive ? "text-emerald-500" : "text-red-500"
        }`}>
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>{isPositive ? "+" : ""}{trend}%</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">no período anterior</p>
    </div>
  )
}
