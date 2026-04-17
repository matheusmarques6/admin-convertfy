"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { Trash2, AlertTriangle, Users, TrendingDown, DollarSign } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import { Skeleton } from "@/components/ui/skeleton"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface StoreHygiene {
  id: string
  storeName: string
  clientName: string
  totalLeads: number
  engagedLeads: number
  unengaged: number
  engagementRate: number
  bounceRate: number
  unsubRate: number
  spamRate: number
  suppressionRecommended: boolean
  estimatedSavings: number
}

interface Summary {
  totalLeads: number
  totalUnengaged: number
  cleanupRate: number
  storesNeedingCleanup: number
  totalEstimatedSavings: number
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR")
}

export default function ListHygienePage() {
  const [period, setPeriod] = useState<PeriodValue>({ period: "30d" })
  const periodParam = period.period === "custom" ? "30d" : period.period

  const { data, isLoading } = useSWR(
    `/api/dashboard/list-hygiene?period=${periodParam}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const stores: StoreHygiene[] = data?.stores ?? []
  const summary: Summary | null = data?.summary ?? null

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Icon icon={Trash2} size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900 dark:text-white tracking-tight">Limpeza de Lista</h1>
            <p className="text-[13px] text-gray-500 dark:text-white/50">Identifique contatos inativos e melhore a deliverability</p>
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
              <Icon icon={Users} size={16} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Total Contatos</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-gray-900 dark:text-white">{fmtNum(summary.totalLeads)}</p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={TrendingDown} size={16} className="text-red-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Inativos (90d)</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-red-600 dark:text-red-400">{fmtNum(summary.totalUnengaged)}</p>
            <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5">{summary.cleanupRate}% da base</p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={AlertTriangle} size={16} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Lojas p/ Limpar</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">{summary.storesNeedingCleanup}</p>
          </div>
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={DollarSign} size={16} className="text-emerald-500" />
              <span className="text-[11px] font-semibold text-gray-400 dark:text-white/40 uppercase">Economia Est.</span>
            </div>
            <p className="text-[28px] font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              R$ {summary.totalEstimatedSavings.toFixed(0)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5">por mes em envios</p>
          </div>
        </div>
      )}

      {/* Stores table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[8px]" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-gray-200 dark:border-white/10">
          <Icon icon={Users} size={24} className="text-gray-300 dark:text-white/20 mb-3" />
          <p className="text-sm text-gray-500 dark:text-white/50">Nenhuma loja com dados de audience disponivel.</p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_80px_80px_100px] gap-2 px-5 py-3 border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] bg-gray-50/50 dark:bg-white/[0.02]">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">Loja</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Total</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Engajados</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Inativos</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Engage %</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Bounce</span>
            <span className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider text-center">Status</span>
          </div>
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/admin/stores/${store.id}`}
              className={cn(
                "block px-5 py-3.5 border-b border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] last:border-b-0",
                "hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors",
                store.suppressionRecommended && "bg-red-50/20 dark:bg-red-900/5"
              )}
            >
              <div className="md:grid grid-cols-[1fr_100px_100px_100px_80px_80px_100px] gap-2 items-center">
                <div>
                  <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{store.storeName}</p>
                  <p className="text-[11px] text-gray-400 dark:text-white/40 truncate">{store.clientName}</p>
                </div>
                <p className="text-center text-[13px] font-mono tabular-nums text-gray-700 dark:text-white/90">{fmtNum(store.totalLeads)}</p>
                <p className="text-center text-[13px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(store.engagedLeads)}</p>
                <p className={cn("text-center text-[13px] font-mono tabular-nums font-semibold", store.unengaged > 0 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-white/50")}>
                  {fmtNum(store.unengaged)}
                </p>
                <p className={cn("text-center text-[13px] font-mono tabular-nums", store.engagementRate < 30 ? "text-red-600 dark:text-red-400" : store.engagementRate < 50 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {store.engagementRate}%
                </p>
                <p className={cn("text-center text-[13px] font-mono tabular-nums", store.bounceRate > 2 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-white/50")}>
                  {store.bounceRate}%
                </p>
                <div className="text-center">
                  {store.suppressionRecommended ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <Icon icon={AlertTriangle} customSize={10} />
                      Limpar
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Saudavel
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
