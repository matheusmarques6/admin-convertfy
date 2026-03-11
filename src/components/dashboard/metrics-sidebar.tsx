"use client"

import { TrendingUp, TrendingDown, ShoppingCart, Repeat, CreditCard, RefreshCcw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface MetricItem {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ElementType
  color: string
}

interface MetricsSidebarProps {
  totalRevenue?: number
  averageTicket?: number
  orderBump?: number
  upsell?: number
  cartRecovery?: number
  refundRate?: number
}

export function MetricsSidebar({
  totalRevenue = 0,
  averageTicket = 0,
  orderBump = 0,
  upsell = 0,
  cartRecovery = 0,
  refundRate = 0,
}: MetricsSidebarProps) {
  const metrics: MetricItem[] = [
    {
      label: "Vendas",
      value: formatCurrency(totalRevenue),
      change: 12,
      changeLabel: "no periodo anterior",
      icon: ShoppingCart,
      color: "emerald",
    },
    {
      label: "Ticket Medio",
      value: formatCurrency(averageTicket),
      change: 8,
      changeLabel: "no periodo anterior",
      icon: CreditCard,
      color: "blue",
    },
    {
      label: "Order Bump",
      value: formatCurrency(orderBump),
      change: 15,
      changeLabel: "no periodo anterior",
      icon: TrendingUp,
      color: "violet",
    },
    {
      label: "Upsell",
      value: formatCurrency(upsell),
      change: -3,
      changeLabel: "no periodo anterior",
      icon: TrendingUp,
      color: "amber",
    },
    {
      label: "Recuperacao de Carrinho",
      value: formatCurrency(cartRecovery),
      change: 22,
      changeLabel: "no periodo anterior",
      icon: RefreshCcw,
      color: "cyan",
    },
    {
      label: "Taxa de Reembolso",
      value: `${refundRate.toFixed(1)}%`,
      change: -5,
      changeLabel: "no periodo anterior",
      icon: Repeat,
      color: "rose",
    },
  ]

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; icon: string }> = {
      emerald: {
        bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
        text: "text-emerald-500 dark:text-emerald-400",
        icon: "text-emerald-500 dark:text-emerald-400",
      },
      blue: {
        bg: "bg-blue-500/10 dark:bg-blue-500/20",
        text: "text-blue-500 dark:text-blue-400",
        icon: "text-blue-500 dark:text-blue-400",
      },
      violet: {
        bg: "bg-violet-500/10 dark:bg-violet-500/20",
        text: "text-violet-500 dark:text-violet-400",
        icon: "text-violet-500 dark:text-violet-400",
      },
      amber: {
        bg: "bg-amber-500/10 dark:bg-amber-500/20",
        text: "text-amber-500 dark:text-amber-400",
        icon: "text-amber-500 dark:text-amber-400",
      },
      cyan: {
        bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
        text: "text-cyan-500 dark:text-cyan-400",
        icon: "text-cyan-500 dark:text-cyan-400",
      },
      rose: {
        bg: "bg-rose-500/10 dark:bg-rose-500/20",
        text: "text-rose-500 dark:text-rose-400",
        icon: "text-rose-500 dark:text-rose-400",
      },
    }
    return colors[color] || colors.emerald
  }

  return (
    <div className="space-y-3">
      {metrics.map((metric) => {
        const colors = getColorClasses(metric.color)
        const Icon = metric.icon
        const isPositive = (metric.change || 0) >= 0

        return (
          <div
            key={metric.label}
            className="p-4 rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={cn("p-2 rounded-lg", colors.bg)}>
                <Icon className={cn("h-4 w-4", colors.icon)} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
            <p className="text-2xl font-bold text-foreground">{metric.value}</p>
            {metric.change !== undefined && (
              <div className="flex items-center gap-1.5 mt-2">
                {isPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    isPositive
                      ? "text-emerald-500 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  )}
                >
                  {isPositive ? "+" : ""}{metric.change}%
                </span>
                <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
