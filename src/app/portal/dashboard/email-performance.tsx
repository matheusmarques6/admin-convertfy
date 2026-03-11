"use client"

import {
  Mail,
  Eye,
  MousePointerClick,
  Target,
  AlertCircle,
} from "lucide-react"
import { formatNumber, formatPercent } from "@/lib/utils/format"
import type { KlaviyoData } from "./types"

interface EmailPerformanceProps {
  klaviyo?: KlaviyoData
}

export function EmailPerformance({ klaviyo }: EmailPerformanceProps) {
  const openRate = klaviyo?.openRate || 0
  const clickRate = klaviyo?.clickRate || 0
  const clickToOpenRate = klaviyo?.clickToOpenRate || 0
  const bounceRate = klaviyo?.bounceRate || 0

  return (
    <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 p-5 shadow-sm dark:shadow-slate-900/20">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Mail className="h-4 w-4 text-blue-500" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Performance de Email
        </h3>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/30">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {formatNumber(klaviyo?.delivered || 0)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">
            Entregues
          </p>
        </div>
        <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/30">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {formatNumber(klaviyo?.opened || 0)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">
            Abertos
          </p>
        </div>
        <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/30">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {formatNumber(klaviyo?.clicked || 0)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">
            Clicados
          </p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="space-y-3">
        <FunnelMetric
          icon={Eye}
          label="Taxa de Abertura"
          value={openRate}
          maxValue={100}
          color="emerald"
        />
        <FunnelMetric
          icon={MousePointerClick}
          label="Taxa de Clique"
          value={clickRate}
          maxValue={20}
          color="blue"
        />
        <FunnelMetric
          icon={Target}
          label="Click-to-Open"
          value={clickToOpenRate}
          maxValue={30}
          color="violet"
        />
        <FunnelMetric
          icon={AlertCircle}
          label="Bounce Rate"
          value={bounceRate}
          maxValue={5}
          color="red"
          isNegative
        />
      </div>
    </div>
  )
}

function FunnelMetric({
  icon: Icon,
  label,
  value,
  maxValue,
  color,
  isNegative = false,
}: {
  icon: React.ElementType
  label: string
  value: number
  maxValue: number
  color: "emerald" | "blue" | "violet" | "red" | "amber"
  isNegative?: boolean
}) {
  const percent = Math.min((value / maxValue) * 100, 100)

  const colorClasses = {
    emerald: {
      bg: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      bgLight: "bg-emerald-500/10",
    },
    blue: {
      bg: "bg-blue-500",
      text: "text-blue-600 dark:text-blue-400",
      bgLight: "bg-blue-500/10",
    },
    violet: {
      bg: "bg-violet-500",
      text: "text-violet-600 dark:text-violet-400",
      bgLight: "bg-violet-500/10",
    },
    red: {
      bg: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
      bgLight: "bg-red-500/10",
    },
    amber: {
      bg: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      bgLight: "bg-amber-500/10",
    },
  }

  const colors = colorClasses[color]

  return (
    <div className="flex items-center gap-3">
      <div className={`w-7 h-7 rounded-lg ${colors.bgLight} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${colors.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
          <span className={`text-xs font-semibold ${isNegative && value > 2 ? "text-red-500" : colors.text}`}>
            {formatPercent(value)}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bg} rounded-full transition-all duration-500`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  )
}
