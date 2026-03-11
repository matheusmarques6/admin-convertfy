import { TrendingUp, Workflow, Mail, MessageSquare, TrendingDown } from "lucide-react"
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
    <div className="relative overflow-hidden rounded-2xl bg-[#0f172a] p-6 lg:p-8">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-transparent to-slate-900/80" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#05AFF2]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
      </div>

      <div className="relative">
        {/* Main content */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          {/* Left: Revenue info */}
          <div className="flex-1">
            <p className="text-sm text-slate-400 mb-2 font-medium tracking-wide">Receita Total da Loja</p>
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {formatCurrency(storeRevenue)}
              </h2>
              {storeRevenue > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 text-sm font-semibold border border-emerald-500/20">
                  <TrendingUp className="h-3.5 w-3.5" />
                  12%
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Atribuido ao Klaviyo: <span className="text-slate-300 font-semibold">{formatCurrency(totalRevenue)}</span>
              <span className="text-slate-600 ml-1.5">({formatPercent(attributionPercent)} do total)</span>
            </p>
          </div>

          {/* Right: Attribution circle */}
          <div className="flex flex-col items-center lg:items-end">
            <p className="text-[11px] text-slate-500 mb-3 uppercase tracking-widest font-semibold">Atribuicao Klaviyo</p>
            <div className="relative w-32 h-32">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="10"
                />
                {/* Progress circle */}
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(attributionPercent / 100) * 339.29} 339.29`}
                  className="transition-all duration-1000 ease-out"
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
                <span className="text-3xl font-bold text-white">{attributionPercent.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">do total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue breakdown cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={Workflow}
            label="Flows"
            value={flowRevenue}
            percent={flowPercent}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/10"
          />
          <MetricCard
            icon={Mail}
            label="Campanhas"
            value={campaignRevenue}
            percent={campaignPercent}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/10"
          />
          <MetricCard
            icon={MessageSquare}
            label="SMS"
            value={smsRevenue}
            percent={smsPercent}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/10"
          />
          <MetricCard
            icon={TrendingUp}
            label="Lucro Estimado"
            value={estimatedProfit}
            percent={30}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/10"
            isProfit
          />
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  percent,
  iconColor,
  iconBg,
  isProfit = false,
}: {
  icon: React.ElementType
  label: string
  value: number
  percent: number
  iconColor: string
  iconBg: string
  isProfit?: boolean
}) {
  return (
    <div className="bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-xl p-4 transition-all duration-200">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} />
        </div>
        <span className="text-sm text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-white mb-1">{formatCurrency(value)}</p>
      <p className="text-xs text-slate-500">
        {isProfit ? "30% margem estimada" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
