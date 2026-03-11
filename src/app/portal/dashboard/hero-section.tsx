import { TrendingUp, Zap, Mail, MessageSquare, Wallet } from "lucide-react"
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
    <div className="relative overflow-hidden rounded-2xl p-6 lg:p-8" style={{ background: 'linear-gradient(90deg, #4e62d8, #2137b6, #041366)' }}>
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-emerald-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-blue-500/10 to-transparent rounded-full blur-2xl translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="relative">
        {/* Main content */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          {/* Left: Revenue info */}
          <div className="flex-1">
            <p className="text-sm text-slate-400 mb-2 font-medium tracking-wide">Receita Total da Loja</p>
            <div className="flex items-baseline gap-4 mb-3">
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
              <span className="text-slate-600 ml-1">({formatPercent(attributionPercent)} do total)</span>
            </p>
          </div>

          {/* Right: Attribution circle */}
          <div className="flex flex-col items-center lg:items-end">
            <p className="text-[11px] text-slate-500 mb-3 uppercase tracking-widest font-semibold">Atribuicao Klaviyo</p>
            <div className="relative w-28 h-28">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="46"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="10"
                />
                {/* Progress circle */}
                <circle
                  cx="56"
                  cy="56"
                  r="46"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(attributionPercent / 100) * 289.03} 289.03`}
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
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">do total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue breakdown cards - Clean Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <RevenueCard
            label="Flows"
            value={flowRevenue}
            percent={flowPercent}
            icon={Zap}
            color="purple"
          />
          <RevenueCard
            label="Campanhas"
            value={campaignRevenue}
            percent={campaignPercent}
            icon={Mail}
            color="blue"
          />
          <RevenueCard
            label="SMS"
            value={smsRevenue}
            percent={smsPercent}
            icon={MessageSquare}
            color="cyan"
          />
          <RevenueCard
            label="Lucro Estimado"
            value={estimatedProfit}
            percent={30}
            icon={Wallet}
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
  icon: Icon,
  color,
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  icon: React.ComponentType<{ className?: string }>
  color: "purple" | "blue" | "cyan" | "emerald"
  isProfit?: boolean
}) {
  const colorConfig = {
    purple: {
      bg: "bg-white/[0.03]",
      border: "border-white/[0.06]",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
      dot: "bg-purple-400",
    },
    blue: {
      bg: "bg-white/[0.03]",
      border: "border-white/[0.06]",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      dot: "bg-blue-400",
    },
    cyan: {
      bg: "bg-white/[0.03]",
      border: "border-white/[0.06]",
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-400",
      dot: "bg-cyan-400",
    },
    emerald: {
      bg: "bg-white/[0.03]",
      border: "border-white/[0.06]",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      dot: "bg-emerald-400",
    },
  }

  const config = colorConfig[color]

  return (
    <div className={`rounded-xl ${config.bg} border ${config.border} backdrop-blur-sm p-4 hover:bg-white/[0.05] transition-colors`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className="text-xs text-slate-400 font-medium">{label}</span>
        </div>
        <div className={`w-7 h-7 rounded-lg ${config.iconBg} flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-white mb-1">{formatCurrency(value)}</p>
      <p className="text-[11px] text-slate-500 font-medium">
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
