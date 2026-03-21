import { Users, TrendingUp, RefreshCw } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatNumber, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData, ShopifyData } from "./types"

interface FooterStatsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData | null
  lastUpdated: string
}

export function FooterStats({ klaviyo, shopify, lastUpdated }: FooterStatsProps) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <Icon icon={Users} size={16} className="text-slate-500 dark:text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300">Clientes: {formatNumber(shopify?.totalCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon icon={TrendingUp} size={16} className="text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-300">Novos: {formatNumber(shopify?.newCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon icon={RefreshCw} size={16} className="text-blue-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300">Recorrentes: {formatPercent(shopify?.recurringCustomerRate || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon icon={Users} size={16} className="text-purple-400" />
            <span className="text-sm text-slate-600 dark:text-slate-300">Leads: {formatNumber(klaviyo?.totalLeads || 0)}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Última atualização: {lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "Agora"}
        </p>
      </div>
    </div>
  )
}
