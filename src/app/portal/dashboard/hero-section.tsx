import { TrendingUp } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/utils/format"
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#4e62d8] via-[#2137b6] to-[#041366] p-6 lg:p-8">
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="relative">
        {/* Main content */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
          {/* Left: Revenue info */}
          <div className="flex-1">
            <p className="text-sm text-white/70 mb-1.5 font-medium">Receita Total da Loja</p>
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {formatCurrency(storeRevenue)}
              </h2>
              {storeRevenue > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-medium">
                  <TrendingUp className="h-3.5 w-3.5" />
                  12%
                </span>
              )}
            </div>
            <p className="text-sm text-white/60">
              Atribuido ao Klaviyo: <span className="text-white font-semibold">{formatCurrency(totalRevenue)}</span>
              <span className="text-white/40 ml-1">({formatPercent(attributionPercent)} do total)</span>
            </p>
          </div>

          {/* Right: Attribution circle */}
          <div className="flex flex-col items-center lg:items-end">
            <p className="text-xs text-white/50 mb-2 uppercase tracking-wider font-medium">Atribuicao Klaviyo</p>
            <div className="relative w-28 h-28">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                />
                {/* Progress circle */}
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(attributionPercent / 100) * 301.59} 301.59`}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{attributionPercent.toFixed(1)}%</span>
                <span className="text-[10px] text-white/50 uppercase tracking-wide">do total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue breakdown cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RevenueCard
            label="Flows"
            value={flowRevenue}
            percent={flowPercent}
            color="violet"
          />
          <RevenueCard
            label="Campanhas"
            value={campaignRevenue}
            percent={campaignPercent}
            color="cyan"
          />
          <RevenueCard
            label="SMS"
            value={smsRevenue}
            percent={smsPercent}
            color="amber"
          />
          <RevenueCard
            label="Lucro Estimado"
            value={estimatedProfit}
            percent={30}
            color="emerald"
            isProfit
          />
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
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  color: "violet" | "cyan" | "amber" | "emerald"
  isProfit?: boolean
}) {
  const colorClasses = {
    violet: "bg-violet-500/30 border-violet-400/20",
    cyan: "bg-cyan-500/30 border-cyan-400/20",
    amber: "bg-amber-500/30 border-amber-400/20",
    emerald: "bg-emerald-500/30 border-emerald-400/20",
  }

  const dotColors = {
    violet: "bg-violet-400",
    cyan: "bg-cyan-400",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
  }

  return (
    <div className={`rounded-xl ${colorClasses[color]} border backdrop-blur-sm p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${dotColors[color]}`} />
        <span className="text-xs text-white/70 font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{formatCurrency(value)}</p>
      <p className="text-xs text-white/50 mt-0.5">
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
