"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Store, Mail, MessageSquare, Zap, TrendingUp } from "lucide-react"
import { Icon } from "@/components/ui/icon"

export interface StoreOverviewData {
  id: string
  storeName: string
  storeUrl?: string
  platform?: string
  emailPlatform?: "klaviyo" | "omnisend" | "none"
  clientId?: string
  clientName: string
  currency: string
  totalRevenueBRL: number
  email: { revenue: number; recipients: number }
  sms: { revenue: number; recipients: number }
  campaigns: {
    revenueBRL: number
    recipients: number
    envios: number
    openRate: number
    clickRate: number
    ctor: number
    bounceRate: number
    unsubRate: number
  }
  automations: {
    revenueBRL: number
    envios: number
    openRate: number
    clickRate: number
    conversions: number
  }
  audience: { totalLeads: number; engagedLeads: number; engagementRate: number }
  syncStatus: string
}

function fmtCurrency(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })
}

function fmtCompact(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`
  return fmtCurrency(v)
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR")
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[11px] text-gray-500 dark:text-white/50">{label}</span>
      <span className={cn("text-[11px] font-mono tabular-nums font-medium", accent ? "text-[#4E62D8] dark:text-[#7B8CEA]" : "text-gray-800 dark:text-white")}>
        {value}
      </span>
    </div>
  )
}

export function StoreOverviewCard({ store }: { store: StoreOverviewData }) {
  return (
    <Link
      href={`/admin/stores/${store.id}`}
      className={cn(
        "block rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-5",
        "dark:border-[rgba(255,255,255,0.08)]",
        "hover:shadow-md hover:border-[rgba(0,0,0,0.14)] dark:hover:border-[rgba(255,255,255,0.14)]",
        "transition-all duration-200 group"
      )}
    >
      {/* Header: nome + cliente + platform badge */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon icon={Store} size={16} className="text-gray-400 dark:text-white/40 shrink-0" />
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-[#4E62D8] dark:group-hover:text-[#7B8CEA] transition-colors">
              {store.storeName}
            </h3>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-white/40 mt-0.5 pl-6 truncate">
            {store.clientName}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {store.emailPlatform === "klaviyo" && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#4E62D8]/10 text-[#4E62D8] dark:bg-[#7B8CEA]/15 dark:text-[#A8B2EE]">
              Klaviyo
            </span>
          )}
          {store.emailPlatform === "omnisend" && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              Omnisend
            </span>
          )}
          {store.syncStatus === "ok" && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1" />
          )}
        </div>
      </div>

      {/* Receita Total */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-1">Receita Total</p>
        <p className="text-[22px] font-bold font-mono tabular-nums text-gray-900 dark:text-white tracking-tight">
          {fmtCurrency(store.totalRevenueBRL)}
        </p>
      </div>

      {/* Email / SMS split */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-2.5 rounded-[6px] bg-gray-50 dark:bg-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon icon={Mail} customSize={12} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-white/50 uppercase">E-mail</span>
          </div>
          <p className="text-[14px] font-semibold font-mono tabular-nums text-gray-900 dark:text-white">
            {fmtCompact(store.email.revenue)}
          </p>
        </div>
        <div className="p-2.5 rounded-[6px] bg-gray-50 dark:bg-white/[0.04]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon icon={MessageSquare} customSize={12} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-white/50 uppercase">SMS</span>
          </div>
          <p className="text-[14px] font-semibold font-mono tabular-nums text-gray-900 dark:text-white">
            {fmtCompact(store.sms.revenue)}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-100 dark:bg-white/[0.06] mb-3" />

      {/* Campanhas + Automações — 2 colunas */}
      <div className="grid grid-cols-2 gap-4">
        {/* Campanhas */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon={TrendingUp} customSize={12} className="text-gray-400 dark:text-white/40" />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Campanhas</span>
          </div>
          <MetricRow label="Receita" value={fmtCompact(store.campaigns.revenueBRL)} accent />
          <MetricRow label="Envios" value={fmtNum(store.campaigns.envios)} />
          <MetricRow label="Abertura" value={`${store.campaigns.openRate.toFixed(1)}%`} />
          <MetricRow label="CTOR" value={`${store.campaigns.ctor.toFixed(1)}%`} />
        </div>

        {/* Automações */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon icon={Zap} customSize={12} className="text-amber-500 dark:text-amber-400" />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Automações</span>
          </div>
          <MetricRow label="Receita" value={fmtCompact(store.automations.revenueBRL)} accent />
          <MetricRow label="Envios" value={fmtNum(store.automations.envios)} />
          <MetricRow label="Abertura" value={`${store.automations.openRate.toFixed(1)}%`} />
          <MetricRow label="Conversões" value={fmtNum(store.automations.conversions)} />
        </div>
      </div>
    </Link>
  )
}

export function StoreOverviewCardSkeleton() {
  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-white/10" />
      </div>
      <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/5 mb-2" />
      <div className="h-7 w-40 rounded bg-gray-200 dark:bg-white/10 mb-4" />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="h-16 rounded-[6px] bg-gray-50 dark:bg-white/[0.04]" />
        <div className="h-16 rounded-[6px] bg-gray-50 dark:bg-white/[0.04]" />
      </div>
      <div className="h-px bg-gray-100 dark:bg-white/[0.06] mb-3" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-white/5" />
        </div>
      </div>
    </div>
  )
}
