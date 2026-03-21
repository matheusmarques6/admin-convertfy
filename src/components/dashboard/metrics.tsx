"use client"

import {
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Target,
  Clock,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface DashboardMetricsProps {
  metrics: {
    activeClients: number
    totalRevenue: number
    pendingPayments: number
    overduePayments: number
    pipelineValue: number
    totalDeals: number
  }
}

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  const cards: Array<{
    title: string
    value: string
    change?: string
    changeType?: "positive" | "negative"
    subtitle?: string
    icon: LucideIcon
    iconColor: string
    iconBg: string
  }> = [
    {
      title: "Faturamento",
      value: formatCurrency(metrics.totalRevenue),
      change: "+12.5%",
      changeType: "positive" as const,
      icon: DollarSign,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
    },
    {
      title: "Clientes Ativos",
      value: formatNumber(metrics.activeClients),
      change: "+3",
      changeType: "positive" as const,
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      title: "Pipeline",
      value: formatCurrency(metrics.pipelineValue),
      subtitle: `${metrics.totalDeals} deals ativos`,
      icon: Target,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
    },
    {
      title: "A Receber",
      value: formatCurrency(metrics.pendingPayments),
      icon: Clock,
      iconColor: "text-muted-foreground",
      iconBg: "bg-muted",
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">
              {card.title}
            </span>
            <div className={cn("rounded-full p-1.5", card.iconBg)}>
              <card.icon className={cn("h-3 w-3", card.iconColor)} />
            </div>
          </div>
          <div className="text-xl font-semibold tracking-tight text-foreground">{card.value}</div>
          {card.change && (
            <p className={cn(
              "text-xs flex items-center gap-1 mt-1",
              card.changeType === "positive" ? "text-emerald-500" : "text-red-500"
            )}>
              {card.changeType === "positive" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {card.change} vs mês anterior
            </p>
          )}
          {card.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1">{card.subtitle}</p>
          )}
        </div>
      ))}

      {/* Overdue Alert Card */}
      {metrics.overduePayments > 0 && (
        <div className="col-span-2 lg:col-span-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-3 flex items-center gap-4">
          <div className="rounded-lg p-2 bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-medium text-destructive">Pagamentos em Atraso</p>
            <p className="text-xs text-muted-foreground">
              Você tem {formatCurrency(metrics.overduePayments)} em pagamentos vencidos
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
