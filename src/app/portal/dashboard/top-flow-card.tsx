import { Zap, ArrowRight } from "lucide-react"
import Link from "next/link"
import { formatCurrency, formatNumber } from "@/lib/utils/format"

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
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50">
            <Zap className="h-4 w-4 text-purple-600" />
          </div>
          <span className="text-[13px] text-slate-500 uppercase tracking-wide">Top Flow</span>
        </div>
        <p className="text-sm text-slate-500">Nenhum flow ativo no período</p>
        <Link
          href="/portal/flows"
          className="inline-flex items-center gap-1 text-xs text-[#05AFF2] hover:text-[#05AFF2]/80 mt-2 transition-colors"
        >
          Ver flows
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // Best flow by revenue (already sorted from API)
  const topFlow = flows[0]
  const revenuePerRecipient = topFlow.delivered > 0 ? topFlow.revenue / topFlow.delivered : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-purple-50">
          <Zap className="h-4 w-4 text-purple-600" />
        </div>
        <span className="text-[13px] text-slate-500 uppercase tracking-wide">Top Flow</span>
      </div>

      <p className="text-sm font-semibold text-slate-800 truncate mb-1">{topFlow.name}</p>
      <p className="text-lg font-bold text-emerald-600 mb-2">{formatCurrency(topFlow.revenue)}</p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">{formatNumber(topFlow.delivered)}</p>
          <p className="text-[10px] text-slate-400">Entregas</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">{topFlow.openRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400">Abertura</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">{formatCurrency(revenuePerRecipient)}</p>
          <p className="text-[10px] text-slate-400">Rec/dest</p>
        </div>
      </div>
    </div>
  )
}
