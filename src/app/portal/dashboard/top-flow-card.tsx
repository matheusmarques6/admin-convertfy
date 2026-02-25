import { Zap, ArrowRight } from "lucide-react"
import Link from "next/link"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { GlowCard } from "@/components/ui/glow-card"

interface Flow {
  id: string
  name: string
  revenue: number
  delivered: number
  openRate: number
  clickRate: number
}

interface TopFlowCardProps {
  flows?: Flow[]
}

export function TopFlowCard({ flows }: TopFlowCardProps) {
  if (!flows || flows.length === 0) {
    return (
      <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-purple-400" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Top Flow</span>
        </div>
        <p className="text-sm text-muted-foreground">Nenhum flow ativo no período</p>
        <Link
          href="/portal/flows"
          className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 mt-2 transition-colors"
        >
          Ver flows
          <ArrowRight className="h-3 w-3" />
        </Link>
      </GlowCard>
    )
  }

  // Best flow by revenue (already sorted from API)
  const topFlow = flows[0]
  const revenuePerRecipient = topFlow.delivered > 0 ? topFlow.revenue / topFlow.delivered : 0

  return (
    <GlowCard color="primary" intensity="subtle" surfaceClassName="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-purple-400" />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Top Flow</span>
      </div>

      <p className="text-sm font-semibold text-foreground truncate mb-1">{topFlow.name}</p>
      <p className="text-lg font-bold text-success mb-2">{formatCurrency(topFlow.revenue)}</p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{formatNumber(topFlow.delivered)}</p>
          <p className="text-[10px] text-muted-foreground">Entregas</p>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{topFlow.openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground">Abertura</p>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{formatCurrency(revenuePerRecipient)}</p>
          <p className="text-[10px] text-muted-foreground">Rec/dest</p>
        </div>
      </div>
    </GlowCard>
  )
}
