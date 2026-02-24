import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format"
import { VariationBadge } from "./components"
import type { KlaviyoData } from "./types"

interface HeroSectionProps {
  klaviyo?: KlaviyoData
}

export function HeroSection({ klaviyo }: HeroSectionProps) {
  // storeRevenue = total store revenue (all Placed Order events from Klaviyo metric-aggregates)
  // totalRevenue = flow + campaign attributed revenue only
  const storeRevenue = klaviyo?.storeRevenue || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const estimatedProfit = totalRevenue * 0.30

  // Attribution: % of total store revenue attributed to Klaviyo (flows + campaigns)
  const attributionPercent = storeRevenue > 0 ? (totalRevenue / storeRevenue) * 100 : 0

  // Channel percentages relative to total store revenue
  const flowPercent = storeRevenue > 0 ? (flowRevenue / storeRevenue) * 100 : 0
  const campaignPercent = storeRevenue > 0 ? (campaignRevenue / storeRevenue) * 100 : 0
  const smsPercent = storeRevenue > 0 ? (smsRevenue / storeRevenue) * 100 : 0

  return (
    <div className="rounded-xl bg-gradient-to-r from-primary/80 via-primary/40 to-card border border-primary/20 p-6 relative overflow-hidden gradient-accent-border">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-info/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="relative flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-info/70 mb-1">Receita Total da Loja</p>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-4xl font-bold text-foreground">{formatCurrency(storeRevenue)}</h2>
            {storeRevenue > 0 && (
              <VariationBadge value={storeRevenue * 0.08} type="currency" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Klaviyo: {formatCurrency(totalRevenue)} · Flows: {formatCurrency(flowRevenue)} · Campanhas: {formatCurrency(campaignRevenue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">Atribuição Klaviyo</p>
          <p className="text-3xl font-bold text-info">{attributionPercent.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground">do faturamento</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RevenueCard label="Flows" value={flowRevenue} percent={flowPercent} color="violet" />
        <RevenueCard label="Campanhas" value={campaignRevenue} percent={campaignPercent} color="cyan" />
        <RevenueCard label="SMS" value={smsRevenue} percent={smsPercent} color="amber" />
        <div className="p-3 rounded-lg bg-purple-500/15 border border-purple-500/20">
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
  label,
  value,
  percent,
  color,
}: {
  label: string
  value: number
  percent: number
  color: string
}) {
  const bgClasses: Record<string, string> = { violet: "bg-purple-500/15", cyan: "bg-info/15", amber: "bg-warning/15" }
  const borderClasses: Record<string, string> = { violet: "border-purple-500/20", cyan: "border-info/20", amber: "border-warning/20" }
  const textClasses: Record<string, string> = { violet: "text-purple-400", cyan: "text-info", amber: "text-warning" }
  const dotClasses: Record<string, string> = { violet: "bg-purple-500", cyan: "bg-info", amber: "bg-warning" }

  return (
    <div className={`p-3 rounded-lg border ${bgClasses[color] || bgClasses.violet} ${borderClasses[color] || borderClasses.violet}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${dotClasses[color] || dotClasses.violet}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{formatCurrencyCompact(value)}</p>
      <p className={`text-xs ${textClasses[color] || textClasses.violet}`}>{percent.toFixed(0)}% da receita</p>
    </div>
  )
}
