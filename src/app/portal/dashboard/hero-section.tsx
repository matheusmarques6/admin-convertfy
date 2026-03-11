import { formatCurrency } from "@/lib/utils/format"
import { VariationBadge } from "./components"
import type { KlaviyoData } from "./types"

interface HeroSectionProps {
  klaviyo?: KlaviyoData
}

export function HeroSection({ klaviyo }: HeroSectionProps) {
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B0E14] via-[#12152B] to-[#1A1040] p-6 lg:p-8 shadow-xl">
      {/* Decorative orbs */}
      <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/20 rounded-full blur-[80px]" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-[#05AFF2]/15 rounded-full blur-[60px]" />

      <div className="relative">
        {/* Top row */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between mb-8 gap-4">
          <div>
            <p className="text-sm text-slate-400 mb-1">Receita Total da Loja</p>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">{formatCurrency(storeRevenue)}</h2>
              {storeRevenue > 0 && <VariationBadge value={storeRevenue * 0.08} type="currency" />}
            </div>
            <p className="text-sm text-slate-400">
              Atribuição Klaviyo: <span className="text-white font-medium">{formatCurrency(totalRevenue)}</span>{" "}
              <span className="text-slate-500">{`(${attributionPercent.toFixed(1)}% do total)`}</span>
            </p>
          </div>

          <div className="lg:text-right">
            <p className="text-xs text-slate-500 mb-1">Atribuição Klaviyo</p>
            <p className="text-3xl font-bold text-[#05AFF2]">{attributionPercent.toFixed(1)}%</p>
            <p className="text-xs text-slate-500">do faturamento</p>
          </div>
        </div>

        {/* Revenue breakdown cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RevenueCard label="Flows" value={flowRevenue} percent={flowPercent} dotColor="bg-violet-400" accentColor="text-violet-300" />
          <RevenueCard label="Campanhas" value={campaignRevenue} percent={campaignPercent} dotColor="bg-cyan-400" accentColor="text-cyan-300" />
          <RevenueCard label="SMS" value={smsRevenue} percent={smsPercent} dotColor="bg-amber-400" accentColor="text-amber-300" />
          <RevenueCard label="Lucro Estimado" value={estimatedProfit} percent={30} dotColor="bg-emerald-400" accentColor="text-emerald-300" isProfit />
        </div>
      </div>
    </div>
  )
}

function RevenueCard({
  label,
  value,
  percent,
  dotColor,
  accentColor,
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  dotColor: string
  accentColor: string
  isProfit?: boolean
}) {
  return (
    <div className="rounded-xl bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{formatCurrency(value)}</p>
      <p className={`text-xs ${accentColor} mt-0.5`}>
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
