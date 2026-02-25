import { Users, TrendingUp, RefreshCw } from "lucide-react"
import { formatNumber, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData, ShopifyData } from "./types"

interface FooterStatsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
  lastUpdated: string
}

export function FooterStats({ klaviyo, shopify, lastUpdated }: FooterStatsProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-800/80">Clientes: {formatNumber(shopify?.totalCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-slate-800/80">Novos: {formatNumber(shopify?.newCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-slate-800/80">Recorrentes: {formatPercent(shopify?.recurringCustomerRate || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-slate-800/80">Leads: {formatNumber(klaviyo?.totalLeads || 0)}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400/70">
          Última atualização: {lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "Agora"}
        </p>
      </div>
    </div>
  )
}
