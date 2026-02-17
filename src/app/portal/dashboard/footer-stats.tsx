import { Users, TrendingUp, RefreshCw } from "lucide-react"
import { GlowCard } from "@/components/ui/glow-card"
import { formatNumber, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData, ShopifyData } from "./types"

interface FooterStatsProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
  lastUpdated: string
}

export function FooterStats({ klaviyo, shopify, lastUpdated }: FooterStatsProps) {
  return (
    <GlowCard color="primary" intensity="moderate" surfaceClassName="p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground/80">Clientes: {formatNumber(shopify?.totalCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-sm text-foreground/80">Novos: {formatNumber(shopify?.newCustomers || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-foreground/80">Recorrentes: {formatPercent(shopify?.recurringCustomerRate || 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-foreground/80">Leads: {formatNumber(klaviyo?.totalLeads || 0)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/70">
          Última atualização: {lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "Agora"}
        </p>
      </div>
    </GlowCard>
  )
}
