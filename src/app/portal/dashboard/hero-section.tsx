"use client"

import { formatCurrency, formatPercent } from "@/lib/utils/format"
import { TrendingUp, TrendingDown, DollarSign, CreditCard, ShoppingBag, Zap } from "lucide-react"
import type { KlaviyoData } from "./types"

interface HeroSectionProps {
  klaviyo?: KlaviyoData
}

export function HeroSection({ klaviyo }: HeroSectionProps) {
  const storeRevenue = klaviyo?.storeRevenue || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const storeOrders = klaviyo?.storeOrders || 0
  const ticketMedio = storeOrders > 0 ? storeRevenue / storeOrders : 0
  const attributionPercent = storeRevenue > 0 ? (totalRevenue / storeRevenue) * 100 : 0
  const recoveryRate = klaviyo?.recoveryRate || 0

  return (
    <div className="space-y-4">
      {/* Main KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receita Líquida */}
        <KPICard
          icon={DollarSign}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          label="Receita Líquida"
          value={formatCurrency(storeRevenue)}
          trend={12}
          trendLabel="no período anterior"
          borderAccent="border-l-emerald-500"
        />

        {/* Atribuição Klaviyo */}
        <KPICard
          icon={Zap}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-500"
          label="Atribuição Klaviyo"
          value={`${attributionPercent.toFixed(1)}%`}
          subValue={formatCurrency(totalRevenue)}
          borderAccent="border-l-violet-500"
          isGauge
          gaugeValue={Math.min(attributionPercent, 100)}
        />

        {/* Ticket Médio */}
        <KPICard
          icon={ShoppingBag}
          iconBg="bg-cyan-500/10"
          iconColor="text-cyan-500"
          label="Ticket Médio"
          value={formatCurrency(ticketMedio)}
          trend={8.5}
          trendLabel="no período anterior"
          borderAccent="border-l-cyan-500"
        />

        {/* Recuperação de Carrinho - Card Destaque */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-5 text-white shadow-lg shadow-cyan-500/20">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-white/80">Recuperação de Carrinho</span>
            </div>
            <p className="text-xs text-white/70 mb-1">
              Valor recuperado com automações de carrinho abandonado
            </p>
            <p className="text-2xl font-bold">{formatPercent(recoveryRate)}</p>
          </div>
          {/* Decorative pattern */}
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-full blur-xl" />
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RevenueBreakdownCard
          label="Receita de Flows"
          value={flowRevenue}
          total={storeRevenue}
          color="violet"
        />
        <RevenueBreakdownCard
          label="Receita de Campanhas"
          value={campaignRevenue}
          total={storeRevenue}
          color="cyan"
        />
        <RevenueBreakdownCard
          label="Pedidos"
          value={storeOrders}
          isCount
          color="amber"
        />
        <RevenueBreakdownCard
          label="Leads Engajados"
          value={klaviyo?.engagedLeads || 0}
          isCount
          color="emerald"
        />
      </div>
    </div>
  )
}

function KPICard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  subValue,
  trend,
  trendLabel,
  borderAccent,
  isGauge,
  gaugeValue,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  label: string
  value: string
  subValue?: string
  trend?: number
  trendLabel?: string
  borderAccent: string
  isGauge?: boolean
  gaugeValue?: number
}) {
  return (
    <div className={`relative bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20 border-l-4 ${borderAccent}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        </div>
      </div>

      {isGauge && gaugeValue !== undefined ? (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
            {subValue && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subValue}</p>
            )}
          </div>
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${gaugeValue * 0.94} 100`}
                strokeLinecap="round"
                className="text-violet-500"
              />
            </svg>
          </div>
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">{value}</p>
          {trend !== undefined && (
            <div className="flex items-center gap-1.5">
              {trend >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )}
              <span className={`text-xs font-medium ${trend >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {trend >= 0 ? "+" : ""}{trend}%
              </span>
              {trendLabel && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{trendLabel}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RevenueBreakdownCard({
  label,
  value,
  total,
  isCount = false,
  color,
}: {
  label: string
  value: number
  total?: number
  isCount?: boolean
  color: "violet" | "cyan" | "amber" | "emerald"
}) {
  const percent = total && total > 0 ? (value / total) * 100 : 0

  const colorClasses = {
    violet: {
      bg: "bg-violet-500/10 dark:bg-violet-500/20",
      dot: "bg-violet-500",
      bar: "bg-violet-500",
      text: "text-violet-600 dark:text-violet-400",
    },
    cyan: {
      bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
      dot: "bg-cyan-500",
      bar: "bg-cyan-500",
      text: "text-cyan-600 dark:text-cyan-400",
    },
    amber: {
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      dot: "bg-amber-500",
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
    },
    emerald: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      dot: "bg-emerald-500",
      bar: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
    },
  }

  const colors = colorClasses[color]

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4 shadow-sm dark:shadow-slate-900/20">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>

      <p className={`text-lg font-bold ${colors.text}`}>
        {isCount ? value.toLocaleString("pt-BR") : formatCurrency(value)}
      </p>

      {!isCount && total && total > 0 && (
        <>
          <div className="mt-3 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            {percent.toFixed(1)}% da receita total
          </p>
        </>
      )}
    </div>
  )
}
