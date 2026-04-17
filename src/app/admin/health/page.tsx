"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import {
  Activity, AlertTriangle, CheckCircle, Heart,
  Shield, TrendingDown,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StoreHealth {
  id: string
  storeName: string
  clientName: string
  deliveryRate: number
  bounceRate: number
  openRate: number
  clickRate: number
  unsubRate: number
  spamRate: number
  engagementRate: number
  totalLeads: number
  engagedLeads: number
  score: number
  issues: string[]
}

interface Summary {
  avgScore: number
  criticalCount: number
  warningCount: number
  healthyCount: number
  totalIssues: number
  totalStores: number
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 70 ? "green" : score >= 50 ? "amber" : "red"
  const styles = {
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono tabular-nums", styles[variant])}>
      {score}/100
    </span>
  )
}

function MetricCell({ label, value, threshold, invert }: { label: string; value: string; threshold?: { warn: number; crit: number }; invert?: boolean }) {
  let color = "text-gray-700 dark:text-white/90"
  if (threshold) {
    const num = parseFloat(value)
    if (invert) {
      if (num > threshold.crit) color = "text-red-600 dark:text-red-400"
      else if (num > threshold.warn) color = "text-amber-600 dark:text-amber-400"
      else color = "text-emerald-600 dark:text-emerald-400"
    } else {
      if (num < threshold.crit) color = "text-red-600 dark:text-red-400"
      else if (num < threshold.warn) color = "text-amber-600 dark:text-amber-400"
      else color = "text-emerald-600 dark:text-emerald-400"
    }
  }
  return (
    <div className="text-center">
      <p className={cn("text-[13px] font-mono tabular-nums font-semibold", color)}>{value}</p>
      <p className="text-[10px] text-gray-400 dark:text-white/40 mt-0.5">{label}</p>
    </div>
  )
}

export default function HealthMonitorPage() {
  const [period, setPeriod] = useState<PeriodValue>({ period: "30d" })
  const periodParam = period.period === "custom" ? "30d" : period.period

  const { data, isLoading } = useSWR(
    `/api/dashboard/health-monitor?period=${periodParam}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const stores: StoreHealth[] = data?.stores ?? []
  const summary: Summary | null = data?.summary ?? null

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
            <Icon icon={Heart} size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900 dark:text-white tracking-tight">Monitor de Saude</h1>
            <p className="text-[13px] text-gray-500 dark:text-white/50">Deliverability, bounce rate, engajamento e reputacao</p>
          </div>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {/* Summary KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[10px]" />
          ))}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={Activity} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Score Medio</span>
            </div>
            <p className={cn("text-[28px] font-bold font-mono tabular-nums",
              summary.avgScore >= 70 ? "text-emerald-600 dark:text-emerald-400" :
              summary.avgScore >= 50 ? "text-amber-600 dark:text-amber-400" :
              "text-red-600 dark:text-red-400"
            )}>
              {summary.avgScore}
            </p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={AlertTriangle} size={16} className="text-red-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Criticos</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-red-600 dark:text-red-400">{summary.criticalCount}</p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={Shield} size={16} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Alertas</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">{summary.warningCount}</p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={CheckCircle} size={16} className="text-emerald-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Saudaveis</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{summary.healthyCount}</p>
          </div>
        </div>
      )}

      {/* Stores table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[8px]" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-gray-200 dark:border-white/10">
          <Icon icon={Heart} size={24} className="text-gray-300 dark:text-white/20 mb-3" />
          <p className="text-sm text-gray-500 dark:text-white/50">Nenhuma loja ativa encontrada.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] overflow-hidden">
          {/* Table header */}
          <div className="hidden lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_80px] gap-2 px-5 py-3 border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-gray-50/50 dark:bg-white/[0.02]">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Loja</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Score</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Delivery</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Bounce</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Open</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Click</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Unsub</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Spam</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Engage</span>
          </div>
          {/* Rows */}
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/admin/stores/${store.id}`}
              className={cn(
                "block px-5 py-3.5 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-b-0",
                "hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors",
                store.score < 50 && "bg-red-50/30 dark:bg-red-900/5"
              )}
            >
              <div className="lg:grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px_80px] gap-2 items-center">
                {/* Store name */}
                <div className="mb-2 lg:mb-0">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{store.storeName}</p>
                  <p className="text-[11px] text-gray-400 dark:text-white/40 truncate">{store.clientName}</p>
                  {store.issues.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 lg:hidden">
                      <Icon icon={TrendingDown} customSize={11} className="text-red-500 shrink-0" />
                      <span className="text-[10px] text-red-600 dark:text-red-400 truncate">{store.issues[0]}</span>
                    </div>
                  )}
                </div>
                {/* Desktop metrics */}
                <div className="hidden lg:block text-center"><ScoreBadge score={store.score} /></div>
                <MetricCell label="Delivery" value={`${store.deliveryRate}%`} threshold={{ warn: 98, crit: 95 }} />
                <MetricCell label="Bounce" value={`${store.bounceRate}%`} threshold={{ warn: 2, crit: 3 }} invert />
                <MetricCell label="Open" value={`${store.openRate}%`} threshold={{ warn: 20, crit: 15 }} />
                <MetricCell label="Click" value={`${store.clickRate}%`} threshold={{ warn: 2, crit: 1 }} />
                <MetricCell label="Unsub" value={`${store.unsubRate}%`} threshold={{ warn: 0.3, crit: 0.5 }} invert />
                <MetricCell label="Spam" value={`${store.spamRate}%`} threshold={{ warn: 0.1, crit: 0.3 }} invert />
                <MetricCell label="Engage" value={`${store.engagementRate}%`} threshold={{ warn: 30, crit: 20 }} />
              </div>
              {/* Issues — desktop only */}
              {store.issues.length > 0 && (
                <div className="hidden lg:flex flex-wrap gap-2 mt-2 pl-0">
                  {store.issues.map((issue, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                      <Icon icon={AlertTriangle} customSize={10} />
                      {issue}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
