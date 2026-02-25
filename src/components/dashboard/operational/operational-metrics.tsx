"use client"

import {
  Users,
  Store,
  ClipboardList,
  Rocket,
} from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import type { GlowColor } from "@/components/ui/glow-card"
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
    glowColor: GlowColor
  }> = [
    {
      title: "Clientes Ativos",
      value: formatNumber(metrics.activeClients),
      icon: Users,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      glowColor: "primary",
    },
    {
      title: "Lojas Ativas",
      value: formatNumber(metrics.activeStores),
      icon: Store,
      iconColor: "text-success",
      iconBg: "bg-success/10",
      glowColor: "success",
    },
    {
      title: "Tasks Pendentes",
      value: formatNumber(metrics.pendingTasks),
      icon: ClipboardList,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      glowColor: "warning",
    },
    {
      title: "Onboardings Ativos",
      value: formatNumber(metrics.activeOnboardings),
      icon: Rocket,
      iconColor: "text-info",
      iconBg: "bg-info/10",
      glowColor: "info",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <GlowCard key={card.title} color={card.glowColor} intensity="intense" surfaceClassName="p-6">
          <div className="flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {card.title}
            </span>
            <div className={cn("rounded-lg p-2", card.iconBg)}>
              <card.icon className={cn("h-4 w-4", card.iconColor)} />
            </div>
          </div>
          <div className="text-2xl font-bold">{card.value}</div>
          {card.subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          )}
        </GlowCard>
      ))}
    </div>
  )
}
