import { Zap } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"

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
      <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-500/10">
            <Icon icon={Zap} size={16} className="text-purple-600" />
          </div>
          <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Top Flow</span>
        </div>
        <EmptyState compact title="Nenhum flow ativo no período" link={{ label: "Ver flows", href: "/client/flows" }} />
      </div>
    )
  }

  // Best flow by revenue (already sorted from API)
  const topFlow = flows[0]
  const revenuePerRecipient = topFlow.delivered > 0 ? topFlow.revenue / topFlow.delivered : 0

  return (
    <div className="bg-white dark:bg-[#1A1D27] rounded-[8px] border border-slate-200/80 dark:border-slate-700/40 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-500/10">
          <Icon icon={Zap} size={16} className="text-purple-600" />
        </div>
        <span className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Top Flow</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate mb-1">{topFlow.name}</p>
      <p className="text-lg font-bold text-emerald-600 mb-2">{formatCurrency(topFlow.revenue)}</p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatNumber(topFlow.delivered)}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Entregas</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{topFlow.openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Abertura</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatCurrency(revenuePerRecipient)}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Rec/dest</p>
        </div>
      </div>
    </div>
  )
}
