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
    icon: React.ElementType
    iconColor: string
    iconBg: string
    accentColor: string
  }> = [
    {
      title: "Faturamento",
      value: formatCurrency(metrics.totalRevenue),
      change: "+12.5%",
      changeType: "positive" as const,
      icon: DollarSign,
      iconColor: "text-success",
      iconBg: "bg-success/10",
      accentColor: "border-t-success",
    },
    {
      title: "Clientes Ativos",
      value: formatNumber(metrics.activeClients),
      change: "+3",
      changeType: "positive" as const,
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accentColor: "border-t-primary",
    },
    {
      title: "Pipeline",
      value: formatCurrency(metrics.pipelineValue),
      subtitle: `${metrics.totalDeals} deals ativos`,
      icon: Target,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      accentColor: "border-t-warning",
    },
    {
      title: "A Receber",
      value: formatCurrency(metrics.pendingPayments),
      icon: Clock,
      iconColor: "text-muted-foreground",
      iconBg: "bg-muted",
      accentColor: "border-t-muted-foreground",
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            "rounded-xl border border-border bg-card p-5 border-t-2 transition-shadow hover:shadow-sm",
            card.accentColor
          )}
        >
          <div className="flex flex-row items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {card.title}
            </span>
            <div className={cn("rounded-lg p-1.5", card.iconBg)}>
              <card.icon className={cn("h-3.5 w-3.5", card.iconColor)} />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{card.value}</div>
          {card.change && (
            <p className={cn(
              "text-xs flex items-center gap-1 mt-1.5",
              card.changeType === "positive" ? "text-success" : "text-destructive"
            )}>
              {card.changeType === "positive" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {card.change} vs mes anterior
            </p>
          )}
          {card.subtitle && (
            <p className="text-xs text-muted-foreground mt-1.5">{card.subtitle}</p>
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
              Voce tem {formatCurrency(metrics.overduePayments)} em pagamentos vencidos
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
