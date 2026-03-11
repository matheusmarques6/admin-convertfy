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
    <div className="relative overflow-hidden rounded-xl p-5 lg:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-bl from-emerald-500/30 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      </div>

      <div className="relative">
        {/* Main content */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          {/* Left: Revenue info */}
          <div className="flex-1">
            <p className="text-xs text-slate-300 mb-1.5 font-medium tracking-wide uppercase">Receita Total da Loja</p>
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
                {formatCurrency(storeRevenue)}
              </h2>
              {storeRevenue > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                  <TrendingUp className="h-3 w-3" />
                  12%
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              Atribuido ao Klaviyo: <span className="text-white font-semibold">{formatCurrency(totalRevenue)}</span>
              <span className="text-slate-500 ml-1">({formatPercent(attributionPercent)} do total)</span>
            </p>
          </div>

          {/* Right: Attribution circle */}
          <div className="flex flex-col items-center lg:items-end">
            <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-widest font-semibold">Atribuicao Klaviyo</p>
            <div className="relative w-24 h-24">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                />
                {/* Progress circle */}
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(attributionPercent / 100) * 251.33} 251.33`}
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
                <span className="text-xl font-bold text-white">{attributionPercent.toFixed(1)}%</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">do total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue breakdown cards - Clean Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
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
      bg: "bg-white/[0.06]",
      border: "border-white/[0.1]",
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-300",
      dot: "bg-purple-400",
    },
    blue: {
      bg: "bg-white/[0.06]",
      border: "border-white/[0.1]",
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-300",
      dot: "bg-blue-400",
    },
    cyan: {
      bg: "bg-white/[0.06]",
      border: "border-white/[0.1]",
      iconBg: "bg-cyan-500/20",
      iconColor: "text-cyan-300",
      dot: "bg-cyan-400",
    },
    emerald: {
      bg: "bg-white/[0.06]",
      border: "border-white/[0.1]",
      iconBg: "bg-emerald-500/20",
      iconColor: "text-emerald-300",
      dot: "bg-emerald-400",
    },
  }

  const config = colorConfig[color]

  return (
    <div className={`rounded-lg ${config.bg} border ${config.border} backdrop-blur-sm p-3 hover:bg-white/[0.08] transition-colors`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className="text-[11px] text-slate-300 font-medium">{label}</span>
        </div>
        <div className={`w-6 h-6 rounded-md ${config.iconBg} flex items-center justify-center`}>
          <Icon className={`h-3 w-3 ${config.iconColor}`} />
        </div>
      </div>
      <p className="text-lg font-bold text-white mb-0.5">{formatCurrency(value)}</p>
      <p className="text-[10px] text-slate-400 font-medium">
        {isProfit ? "30% margem" : `${percent.toFixed(1)}% da receita`}
      </p>
    </div>
  )
}
