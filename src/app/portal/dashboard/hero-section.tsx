import { Zap, Send, MessageSquare } from "lucide-react"
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import { VariationBadge } from "./components"
import type { KlaviyoData, ShopifyData } from "./types"

interface HeroSectionProps {
  klaviyo?: KlaviyoData
  shopify?: ShopifyData
}

export function HeroSection({ klaviyo, shopify }: HeroSectionProps) {
  const totalShopifyRevenue = shopify?.totalRevenue || 0
  const totalKlaviyoRevenue = klaviyo?.totalRevenue || 0
  const attributionPercent = totalShopifyRevenue > 0 ? (totalKlaviyoRevenue / totalShopifyRevenue) * 100 : 0
  const estimatedProfit = totalKlaviyoRevenue * 0.30

  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const flowPercent = totalKlaviyoRevenue > 0 ? (flowRevenue / totalKlaviyoRevenue) * 100 : 0
  const campaignPercent = totalKlaviyoRevenue > 0 ? (campaignRevenue / totalKlaviyoRevenue) * 100 : 0
  const smsPercent = totalKlaviyoRevenue > 0 ? (smsRevenue / totalKlaviyoRevenue) * 100 : 0

  return (
    <div className="rounded-xl bg-gradient-to-r from-primary/80 via-primary/40 to-card border border-primary/20 p-6 relative overflow-hidden gradient-accent-border">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-info/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="relative flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-info/70 mb-1">Receita Convertfy</p>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-4xl font-bold text-foreground">{formatCurrency(totalKlaviyoRevenue)}</h2>
            <VariationBadge value={attributionPercent} type="percent" />
            {totalKlaviyoRevenue > 0 && (
              <VariationBadge value={totalKlaviyoRevenue * 0.08} type="currency" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            vs Receita Total: {formatCurrency(totalShopifyRevenue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">Atribuição</p>
          <p className="text-3xl font-bold text-info">{attributionPercent.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">do faturamento</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RevenueCard icon={Zap} label="Flows" value={flowRevenue} percent={flowPercent} color="violet" />
        <RevenueCard icon={Send} label="Campanhas" value={campaignRevenue} percent={campaignPercent} color="cyan" />
        <RevenueCard icon={MessageSquare} label="SMS" value={smsRevenue} percent={smsPercent} color="amber" />
        <div className="p-3 rounded-lg bg-black/30 border border-primary/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-xs text-muted-foreground">Lucro Estimado</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrencyCompact(estimatedProfit)}</p>
          <p className="text-xs text-purple-400">30% margem</p>
        </div>
      </div>
    </div>
  )
}

function RevenueCard({
  icon: Icon,
  label,
  value,
  percent,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  percent: number
  color: string
}) {
  return (
    <div className="p-3 rounded-lg bg-black/30 border border-primary/10">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full bg-${color}-500`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{formatCurrencyCompact(value)}</p>
      <p className={`text-xs text-${color}-400`}>{percent.toFixed(0)}% da receita</p>
    </div>
  )
}
