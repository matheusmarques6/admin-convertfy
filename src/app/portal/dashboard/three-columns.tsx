import { Zap, ChevronDown, BarChart3, Award, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlowCard } from "@/components/ui/glow-card"
import { formatCurrencyCompact } from "@/lib/utils/format"
import { FlowListItem, PerformanceRow } from "./components"
import type { KlaviyoData } from "./types"

interface ThreeColumnsProps {
  klaviyo?: KlaviyoData
  totalKlaviyoRevenue: number
}

export function ThreeColumns({ klaviyo, totalKlaviyoRevenue }: ThreeColumnsProps) {
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const flowPercent = totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0
  const campaignPercent = totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Top Flows */}
      <GlowCard color="success" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Top Flows
          </h3>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 px-2">
            Filtros <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </div>

        <div className="space-y-1">
          {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
            klaviyo.topFlows.slice(0, 5).map((flow, index) => {
              const percent = totalKlaviyoRevenue > 0 ? (flow.revenue / totalKlaviyoRevenue) * 100 : 0
              const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-purple-500", "bg-pink-500"]
              return (
                <FlowListItem
                  key={flow.id}
                  name={flow.name}
                  value={flow.revenue}
                  percent={percent}
                  color={colors[index % colors.length]}
                />
              )
            })
          ) : (
            <div className="text-center py-8">
              <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum flow com receita</p>
            </div>
          )}
        </div>
      </GlowCard>

      {/* Distribution Chart */}
      <GlowCard color="info" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-info" />
            Distribuição
          </h3>
        </div>

        <div className="flex items-center justify-center h-48">
          <div className="relative">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="60" fill="none" stroke="hsl(var(--border))" strokeWidth="20" />
              <circle
                cx="80" cy="80" r="60" fill="none" stroke="hsl(var(--primary))" strokeWidth="20"
                strokeDasharray={`${flowPercent * 3.77} 377`} strokeDashoffset="0"
                transform="rotate(-90 80 80)"
              />
              <circle
                cx="80" cy="80" r="60" fill="none" stroke="hsl(var(--info))" strokeWidth="20"
                strokeDasharray={`${campaignPercent * 3.77} 377`}
                strokeDashoffset={`${-flowPercent * 3.77}`}
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-foreground">{formatCurrencyCompact(totalKlaviyoRevenue)}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">Receita por categoria</p>
      </GlowCard>

      {/* Performance Table */}
      <GlowCard color="primary" intensity="moderate" surfaceClassName="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Performance
          </h3>
          <div className="flex gap-1">
            <span className="px-2 py-1 rounded bg-success/20 text-success text-xs flex items-center gap-1">
              <Flame className="h-3 w-3" /> Top revenue
            </span>
          </div>
        </div>

        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {klaviyo?.topFlows && klaviyo.topFlows.length > 0 ? (
            klaviyo.topFlows.slice(0, 5).map((flow, index) => (
              <PerformanceRow
                key={flow.id}
                rank={index + 1}
                name={flow.name}
                delivered={flow.delivered || 0}
                openRate={flow.openRate || 0}
                clickRate={flow.clickRate || 0}
                revenue={flow.revenue || 0}
                isTop={index === 0}
              />
            ))
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Sem dados de performance</p>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  )
}
