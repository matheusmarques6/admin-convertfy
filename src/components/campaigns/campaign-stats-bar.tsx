"use client"

import { Eye, CheckCircle, Users, DollarSign } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { formatCurrencyCompact } from "@/lib/utils/format"

// ============================================
// TYPES
// ============================================

export interface CampaignStats {
  total: number
  sent: number
  scheduled: number
  draft: number
  totalRevenue: number
  totalRecipients: number
  totalOpens: number
  totalClicks: number
  weightedOpenRate: number | null
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: string
  iconBgColor?: string
}

export interface CampaignStatsBarProps {
  stats: CampaignStats
}

// ============================================
// UTILITY
// ============================================

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("pt-BR").format(value)
}

// ============================================
// SUB-COMPONENT
// ============================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-emerald-600",
  iconBgColor = "bg-emerald-50 dark:bg-emerald-500/10",
}: StatCardProps) {
  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-3 ${iconBgColor}`}>
          <IconWrapper icon={Icon} size={24} className={iconColor} />
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENT
// ============================================

export function CampaignStatsBar({ stats }: CampaignStatsBarProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <StatCard
        title="Taxa de Abertura"
        value={stats.weightedOpenRate !== null ? `${stats.weightedOpenRate.toFixed(1)}%` : "--"}
        subtitle="media ponderada por destinatarios"
        icon={Eye}
        iconColor="text-amber-600"
        iconBgColor="bg-amber-50 dark:bg-amber-500/10"
      />
      <StatCard
        title="Enviadas"
        value={stats.sent}
        subtitle="no periodo"
        icon={CheckCircle}
        iconColor="text-emerald-600"
        iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
      />
      <StatCard
        title="Destinatarios"
        value={formatNumber(stats.totalRecipients)}
        subtitle="emails enviados"
        icon={Users}
        iconColor="text-[#05AFF2]"
        iconBgColor="bg-sky-50 dark:bg-sky-500/10"
      />
      <StatCard
        title="Receita"
        value={formatCurrencyCompact(stats.totalRevenue)}
        subtitle="atribuida as campanhas"
        icon={DollarSign}
        iconColor="text-emerald-600"
        iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
      />
    </div>
  )
}
