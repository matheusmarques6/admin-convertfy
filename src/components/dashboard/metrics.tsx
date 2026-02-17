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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  const cards = [
    {
      title: "Faturamento",
      value: formatCurrency(metrics.totalRevenue),
      change: "+12.5%",
      changeType: "positive" as const,
      icon: DollarSign,
      iconColor: "text-success",
      iconBg: "bg-success/10",
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
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={cn("rounded-lg p-2", card.iconBg)}>
              <card.icon className={cn("h-4 w-4", card.iconColor)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.change && (
              <p className={cn(
                "text-xs flex items-center gap-1 mt-1",
                card.changeType === "positive" ? "text-success" : "text-destructive"
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
              <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Overdue Alert Card */}
      {metrics.overduePayments > 0 && (
        <Card className="md:col-span-2 lg:col-span-4 border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="rounded-lg p-2 bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-medium text-destructive">Pagamentos em Atraso</p>
              <p className="text-sm text-muted-foreground">
                Você tem {formatCurrency(metrics.overduePayments)} em pagamentos vencidos
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
