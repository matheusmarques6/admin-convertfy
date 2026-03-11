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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1f36] via-[#1e2642] to-[#0f1629] p-6 lg:p-8">
      {/* Subtle glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[300px] bg-[#5c6ac4]/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[200px] bg-[#5c6ac4]/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative">
        {/* Main content */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          {/* Left: Revenue info */}
          <div className="flex-1">
            <p className="text-sm text-slate-400 mb-2 font-medium">Receita Total da Loja</p>
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {formatCurrency(storeRevenue)}
              </h2>
              {storeRevenue > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-sm font-medium border border-emerald-500/20">
                  <TrendingUp className="h-3.5 w-3.5" />
                  12%
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Atribuido ao Klaviyo: <span className="text-white/90 font-semibold">{formatCurrency(totalRevenue)}</span>
              <span className="text-slate-500 ml-1">({formatPercent(attributionPercent)} do total)</span>
            </p>
          </div>

          {/* Right: Attribution circle */}
          <div className="flex flex-col items-center lg:items-end">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest font-semibold">Atribuicao Klaviyo</p>
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="7"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${(attributionPercent / 100) * 301.59} 301.59`}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#6ee7b7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{attributionPercent.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">do total</span>
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
            dotColor="#8b5cf6"
          />
          <RevenueCard
            label="Campanhas"
            value={campaignRevenue}
            percent={campaignPercent}
            dotColor="#22d3ee"
          />
          <RevenueCard
            label="SMS"
            value={smsRevenue}
            percent={smsPercent}
            dotColor="#f59e0b"
          />
          <RevenueCard
            label="Lucro Estimado"
            value={estimatedProfit}
            percent={30}
            dotColor="#10b981"
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
  dotColor,
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  dotColor: string
  isProfit?: boolean
}) {
  return (
    <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] p-4 hover:bg-white/[0.07] transition-colors duration-200">
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-xs text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-white mb-1">{formatCurrency(value)}</p>
      <p className="text-[11px] text-slate-500">
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
