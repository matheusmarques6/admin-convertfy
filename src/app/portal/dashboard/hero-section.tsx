import { formatCurrency } from "@/lib/utils/format"
import { VariationBadge } from "./components"
import type { KlaviyoData } from "./types"
import { TrendingUp, Mail, GitBranch, MessageSquare, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const flowPercent = totalRevenue > 0 ? (flowRevenue / totalRevenue) * 100 : 0
  const campaignPercent = totalRevenue > 0 ? (campaignRevenue / totalRevenue) * 100 : 0
  const smsPercent = totalRevenue > 0 ? (smsRevenue / totalRevenue) * 100 : 0

  return (
    <div className="relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>
      
      {/* Gradient Orbs */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-[#05AFF2]/10 rounded-full blur-[100px]" />
      <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-violet-500/10 rounded-full blur-[100px]" />

      <div className="relative p-6 lg:p-8">
        {/* Top Section */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div>
            <p className="text-sm text-zinc-500 font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Receita Total da Loja
            </p>
            <div className="flex items-baseline gap-4 mb-3">
              <h2 className="text-4xl lg:text-5xl font-bold text-zinc-100 tracking-tight">
                {formatCurrency(storeRevenue)}
              </h2>
              {storeRevenue > 0 && <VariationBadge value={storeRevenue * 0.08} type="currency" />}
            </div>
            <p className="text-sm text-zinc-500">
              Atribuição Klaviyo:{" "}
              <span className="text-zinc-200 font-semibold">{formatCurrency(totalRevenue)}</span>
              <span className="text-zinc-600 ml-1">({attributionPercent.toFixed(1)}% do total)</span>
            </p>
          </div>

          {/* Attribution Highlight */}
          <div className="lg:text-right">
            <div className="inline-flex flex-col items-end px-5 py-4 rounded-xl bg-gradient-to-br from-[#05AFF2]/10 to-[#05AFF2]/5 border border-[#05AFF2]/20">
              <p className="text-xs text-[#05AFF2]/80 font-medium mb-1">Atribuição Klaviyo</p>
              <p className="text-4xl font-bold text-[#05AFF2]">{attributionPercent.toFixed(1)}%</p>
              <p className="text-xs text-zinc-500 mt-1">do faturamento total</p>
            </div>
          </div>
        </div>

        {/* Revenue Breakdown Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RevenueCard
            label="Flows"
            value={flowRevenue}
            percent={flowPercent}
            icon={GitBranch}
            accentColor="violet"
          />
          <RevenueCard
            label="Campanhas"
            value={campaignRevenue}
            percent={campaignPercent}
            icon={Mail}
            accentColor="cyan"
          />
          <RevenueCard
            label="SMS"
            value={smsRevenue}
            percent={smsPercent}
            icon={MessageSquare}
            accentColor="amber"
          />
          <RevenueCard
            label="Lucro Estimado"
            value={estimatedProfit}
            percent={30}
            icon={Wallet}
            accentColor="emerald"
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
  accentColor,
  isProfit = false,
}: {
  label: string
  value: number
  percent: number
  icon: React.ElementType
  accentColor: "violet" | "cyan" | "amber" | "emerald"
  isProfit?: boolean
}) {
  const colorClasses = {
    violet: {
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      icon: "text-violet-400",
      text: "text-violet-400",
    },
    cyan: {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      icon: "text-cyan-400",
      text: "text-cyan-400",
    },
    amber: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      icon: "text-amber-400",
      text: "text-amber-400",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      icon: "text-emerald-400",
      text: "text-emerald-400",
    },
  }

  const colors = colorClasses[accentColor]

  return (
    <div className={cn(
      "group rounded-xl p-4 transition-all duration-300 hover:scale-[1.02]",
      colors.bg,
      "border",
      colors.border
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("h-4 w-4", colors.icon)} />
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-zinc-100 mb-1">{formatCurrency(value)}</p>
      <p className={cn("text-xs font-medium", colors.text)}>
        {isProfit ? "30% margem estimada" : `${percent.toFixed(1)}% da receita atribuída`}
      </p>
    </div>
  )
}
