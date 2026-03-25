"use client"

import {
  Users,
  Store,
  ClipboardList,
  Rocket,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
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
    icon: LucideIcon
    iconColor: string
    iconBg: string
  }> = [
    {
      title: "Clientes Ativos",
      value: formatNumber(metrics.activeClients),
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      title: "Lojas Ativas",
      value: formatNumber(metrics.activeStores),
      icon: Store,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
    },
    {
      title: "Tasks Pendentes",
      value: formatNumber(metrics.pendingTasks),
      icon: ClipboardList,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-500/10",
    },
    {
      title: "Onboardings Ativos",
      value: formatNumber(metrics.activeOnboardings),
      icon: Rocket,
      iconColor: "text-info",
      iconBg: "bg-info/10",
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-[8px] border border-border bg-card p-4"
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
          {card.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1">{card.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  )
}
