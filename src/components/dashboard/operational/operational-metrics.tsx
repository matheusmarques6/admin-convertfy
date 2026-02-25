"use client"

import {
  Users,
  Store,
  ClipboardList,
  Rocket,
} from "lucide-react"
import { formatNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface OperationalMetricsProps {
  metrics: {
    activeClients: number
    activeStores: number
    pendingTasks: number
    activeOnboardings: number
  }
}

export function OperationalMetrics({ metrics }: OperationalMetricsProps) {
  const cards: Array<{
    title: string
    value: string
    subtitle?: string
    icon: React.ElementType
    iconColor: string
    iconBg: string
    accentColor: string
  }> = [
    {
      title: "Clientes Ativos",
      value: formatNumber(metrics.activeClients),
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accentColor: "border-t-primary",
    },
    {
      title: "Lojas Ativas",
      value: formatNumber(metrics.activeStores),
      icon: Store,
      iconColor: "text-success",
      iconBg: "bg-success/10",
      accentColor: "border-t-success",
    },
    {
      title: "Tasks Pendentes",
      value: formatNumber(metrics.pendingTasks),
      icon: ClipboardList,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      accentColor: "border-t-warning",
    },
    {
      title: "Onboardings Ativos",
      value: formatNumber(metrics.activeOnboardings),
      icon: Rocket,
      iconColor: "text-info",
      iconBg: "bg-info/10",
      accentColor: "border-t-info",
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
          <div className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {card.title}
            </span>
            <div className={cn("rounded-lg p-1.5", card.iconBg)}>
              <card.icon className={cn("h-3.5 w-3.5", card.iconColor)} />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{card.value}</div>
          {card.subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  )
}
