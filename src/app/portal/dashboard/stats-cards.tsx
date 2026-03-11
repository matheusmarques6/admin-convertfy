"use client"

import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/format"
import { Users, ShoppingCart, Repeat, CreditCard, TrendingUp, TrendingDown } from "lucide-react"
import type { KlaviyoData, ShopifyData } from "./types"

interface StatsCardsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
}

export function StatsCards({ klaviyo }: StatsCardsProps) {
  const storeOrders = klaviyo?.storeOrders || 0
  const engagedLeads = klaviyo?.engagedLeads || 0
  const conversionRate = klaviyo?.conversionRate || 0
  const recoveryRate = klaviyo?.recoveryRate || 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={ShoppingCart}
        label="Pedidos"
        value={formatNumber(storeOrders)}
        trend={8}
        iconColor="text-blue-500"
        iconBg="bg-blue-500/10"
      />
      <StatCard
        icon={Users}
        label="Leads Engajados"
        value={formatNumber(engagedLeads)}
        trend={15}
        iconColor="text-violet-500"
        iconBg="bg-violet-500/10"
      />
      <StatCard
        icon={Repeat}
        label="Conversão"
        value={formatPercent(conversionRate)}
        trend={3.2}
        iconColor="text-emerald-500"
        iconBg="bg-emerald-500/10"
      />
      <StatCard
        icon={CreditCard}
        label="Recuperação"
        value={formatPercent(recoveryRate)}
        trend={-2.1}
        iconColor="text-amber-500"
        iconBg="bg-amber-500/10"
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  iconColor,
  iconBg,
}: {
  icon: React.ElementType
  label: string
  value: string
  trend: number
  iconColor: string
  iconBg: string
}) {
  const isPositive = trend >= 0

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">{value}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`flex items-center gap-0.5 text-xs font-medium ${
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
    </div>
  )
}

// Donut Chart Component for revenue distribution
export function RevenueDonutChart({ klaviyo }: { klaviyo?: KlaviyoData }) {
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const total = flowRevenue + campaignRevenue + smsRevenue

  if (total === 0) return null

  const segments = [
    { label: "Flows", value: flowRevenue, color: "#8b5cf6" },
    { label: "Campanhas", value: campaignRevenue, color: "#06b6d4" },
    { label: "SMS", value: smsRevenue, color: "#f59e0b" },
  ]

  // Calculate percentages and angles
  let currentAngle = 0
  const paths = segments.map((segment) => {
    const percent = (segment.value / total) * 100
    const angle = (percent / 100) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const start = polarToCartesian(50, 50, 40, startAngle)
    const end = polarToCartesian(50, 50, 40, endAngle)
    const largeArc = angle > 180 ? 1 : 0

    const d = [
      `M ${start.x} ${start.y}`,
      `A 40 40 0 ${largeArc} 1 ${end.x} ${end.y}`,
    ].join(" ")

    return { ...segment, d, percent }
  })

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
        Distribuição de Receita
      </h3>

      <div className="flex items-center gap-6">
        {/* Donut Chart */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {paths.map((path, i) => (
              <path
                key={i}
                d={path.d}
                fill="none"
                stroke={path.color}
                strokeWidth="16"
                strokeLinecap="round"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {formatCurrency(total)}
              </p>
              <p className="text-[10px] text-slate-400">Total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {paths.map((segment, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {segment.label}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {formatCurrency(segment.value)}
                </span>
                <span className="text-xs text-slate-400 ml-2">
                  {segment.percent.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Helper function for donut chart
function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Flow Performance Bars
export function FlowPerformanceBars({ flows }: { flows?: KlaviyoData["topFlows"] }) {
  if (!flows || flows.length === 0) return null

  const maxRevenue = Math.max(...flows.map(f => f.revenue))

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">
        Performance por Flow
      </h3>

      <div className="space-y-4">
        {flows.slice(0, 5).map((flow) => {
          const percent = (flow.revenue / maxRevenue) * 100

          return (
            <div key={flow.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-[60%]">
                  {flow.name}
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {formatCurrency(flow.revenue)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
