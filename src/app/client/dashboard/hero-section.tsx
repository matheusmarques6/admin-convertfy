import { TrendingUp, Zap, Send, MessageSquare, Wallet } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { formatCurrency } from "@/lib/utils/format"
import { VariationBadge } from "./components"
import type { KlaviyoData, PreviousPeriodData } from "./types"

interface HeroSectionProps {
  klaviyo?: KlaviyoData
  previousPeriod?: PreviousPeriodData
}

export function HeroSection({ klaviyo, previousPeriod }: HeroSectionProps) {
  const storeRevenue = klaviyo?.storeRevenue || 0
  const totalRevenue = klaviyo?.totalRevenue || 0
  const flowRevenue = klaviyo?.flowRevenue || 0
  const campaignRevenue = klaviyo?.campaignRevenue || 0
  const smsRevenue = klaviyo?.smsRevenue || 0
  const estimatedProfit = storeRevenue * 0.30

  const attributionPercent = storeRevenue > 0 ? (totalRevenue / storeRevenue) * 100 : 0
  const flowPercent = storeRevenue > 0 ? (flowRevenue / storeRevenue) * 100 : 0
  const campaignPercent = storeRevenue > 0 ? (campaignRevenue / storeRevenue) * 100 : 0
  const smsPercent = storeRevenue > 0 ? (smsRevenue / storeRevenue) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Main Revenue Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-stretch">
        {/* Store Revenue - Primary metric */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-[#0f1419] dark:via-[#151d28] dark:to-[#0f1419] p-6 lg:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/8 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/6 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/4" />

          <div className="relative">
            <p className="text-[13px] font-medium text-slate-400 mb-1.5 tracking-wide">Receita Total da Loja</p>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight tabular-nums">
                {formatCurrency(storeRevenue)}
              </h2>
              {previousPeriod && previousPeriod.storeRevenue > 0 && (
                <VariationBadge
                  value={((storeRevenue - previousPeriod.storeRevenue) / previousPeriod.storeRevenue) * 100}
                  type="percent"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/20">
                <Icon icon={TrendingUp} customSize={14} className="text-primary" />
                <span className="text-sm font-bold text-primary tabular-nums">{attributionPercent.toFixed(1)}%</span>
              </div>
              <span className="text-[13px] text-slate-400">
                atribuído via Klaviyo
                <span className="text-slate-500 ml-1.5">({formatCurrency(totalRevenue)})</span>
              </span>
            </div>
          </div>
        </div>

        {/* Attribution highlight card */}
        <div className="hidden lg:flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-primary/10 to-primary/5 dark:from-primary/15 dark:to-primary/5 border border-primary/15 dark:border-primary/20 px-8 min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70 mb-1">Atribuição</p>
          <p className="text-4xl font-bold text-primary tabular-nums">{attributionPercent.toFixed(1)}%</p>
          <p className="text-[11px] text-primary/60 mt-1">do faturamento</p>
        </div>
      </div>

      {/* Revenue breakdown cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BreakdownCard
          label="Flows"
          value={flowRevenue}
          percent={flowPercent}
          icon={Zap}
          accentClass="text-violet-500 dark:text-violet-400"
          bgClass="bg-violet-50 dark:bg-violet-500/10"
          borderClass="border-violet-100 dark:border-violet-500/15"
        />
        <BreakdownCard
          label="Campanhas"
          value={campaignRevenue}
          percent={campaignPercent}
          icon={Send}
          accentClass="text-cyan-600 dark:text-cyan-400"
          bgClass="bg-cyan-50 dark:bg-cyan-500/10"
          borderClass="border-cyan-100 dark:border-cyan-500/15"
        />
        <BreakdownCard
          label="SMS"
          value={smsRevenue}
          percent={smsPercent}
          icon={MessageSquare}
          accentClass="text-amber-600 dark:text-amber-400"
          bgClass="bg-amber-50 dark:bg-amber-500/10"
          borderClass="border-amber-100 dark:border-amber-500/15"
        />
        <BreakdownCard
          label="Lucro Estimado"
          value={estimatedProfit}
          percent={30}
          icon={Wallet}
          accentClass="text-emerald-600 dark:text-emerald-400"
          bgClass="bg-emerald-50 dark:bg-emerald-500/10"
          borderClass="border-emerald-100 dark:border-emerald-500/15"
          isProfit
        />
      </div>
    </div>
  )
}

function BreakdownCard({
  label,
  value,
  percent,
  icon: IconComponent,
  accentClass,
  bgClass,
  borderClass,
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  icon: React.ElementType
  accentClass: string
  bgClass: string
  borderClass: string
  isProfit?: boolean
}) {
  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-4 transition-all duration-200`}>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon icon={IconComponent} size={16} className={accentClass} strokeWidth={1.8} />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency(value)}</p>
      <p className={`text-[11px] mt-1 ${accentClass} font-medium`}>
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
