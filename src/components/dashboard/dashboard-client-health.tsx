"use client"

import { useState, useMemo } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { SkeletonShimmer } from "@/components/ui/skeleton"

// ─── Types ────────────────────────────────────────────────

interface ClientHealth {
  id: string
  name: string
  storeRevenue: number
  attributedRevenue: number
  revenuePercent: number
  score: number
  openRate?: number
  clickRate?: number
  ctor?: number
  bounceRate?: number
  unsubRate?: number
  problem?: string
}

interface StoreBreakdownItem {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  totalRevenueBRL?: number
  campaignRevenueBRL?: number
  flowRevenueBRL?: number
}

interface DashboardClientHealthProps {
  loading?: boolean
  storeBreakdown?: StoreBreakdownItem[]
}

type SortKey = "score" | "attributedRevenue" | "revenuePercent" | "storeRevenue"

// ─── Mock data ────────────────────────────────────────────

const MOCK_CLIENTS: ClientHealth[] = [
  {
    id: "1",
    name: "Based 3.0",
    storeRevenue: 42000,
    attributedRevenue: 18000,
    revenuePercent: 44,
    score: 28,
    openRate: 18.2,
    clickRate: 2.1,
    ctor: 11.5,
    bounceRate: 4.8,
    unsubRate: 0.61,
    problem: "Bounce rate crítico",
  },
  {
    id: "2",
    name: "EPORTH Energia",
    storeRevenue: 245000,
    attributedRevenue: 89000,
    revenuePercent: 36,
    score: 31,
    openRate: 21.4,
    clickRate: 2.8,
    ctor: 13.1,
    bounceRate: 3.2,
    unsubRate: 0.52,
    problem: "Open rate baixo",
  },
  {
    id: "3",
    name: "NUZE",
    storeRevenue: 99000,
    attributedRevenue: 34000,
    revenuePercent: 35,
    score: 48,
    openRate: 28.3,
    clickRate: 3.9,
    ctor: 13.8,
    bounceRate: 2.1,
    unsubRate: 0.38,
    problem: "Campanha atrasada",
  },
  {
    id: "4",
    name: "Donaris Joias",
    storeRevenue: 412000,
    attributedRevenue: 156000,
    revenuePercent: 38,
    score: 58,
    openRate: 36.1,
    clickRate: 5.2,
    ctor: 14.4,
    bounceRate: 1.4,
    unsubRate: 0.23,
  },
  {
    id: "5",
    name: "Nivalé",
    storeRevenue: 198000,
    attributedRevenue: 73000,
    revenuePercent: 37,
    score: 65,
    openRate: 33.7,
    clickRate: 4.8,
    ctor: 14.2,
    bounceRate: 1.6,
    unsubRate: 0.27,
  },
  {
    id: "6",
    name: "Clube Rock",
    storeRevenue: 189000,
    attributedRevenue: 68000,
    revenuePercent: 36,
    score: 76,
    openRate: 38.2,
    clickRate: 5.6,
    ctor: 14.7,
    bounceRate: 1.1,
    unsubRate: 0.19,
  },
  {
    id: "7",
    name: "Blessed Choice",
    storeRevenue: 267000,
    attributedRevenue: 98000,
    revenuePercent: 37,
    score: 82,
    openRate: 40.1,
    clickRate: 6.1,
    ctor: 15.2,
    bounceRate: 0.9,
    unsubRate: 0.15,
  },
  {
    id: "8",
    name: "Oak Vintage",
    storeRevenue: 145000,
    attributedRevenue: 58000,
    revenuePercent: 40,
    score: 87,
    openRate: 42.3,
    clickRate: 6.8,
    ctor: 16.1,
    bounceRate: 0.7,
    unsubRate: 0.12,
  },
  {
    id: "9",
    name: "AchaTudo",
    storeRevenue: 310000,
    attributedRevenue: 124000,
    revenuePercent: 40,
    score: 92,
    openRate: 44.5,
    clickRate: 7.2,
    ctor: 16.2,
    bounceRate: 0.5,
    unsubRate: 0.09,
  },
]

// (removed TOTAL_CLIENTS — now derived from real data)

// ─── Helpers ──────────────────────────────────────────────

function formatCompact(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`
  }
  return String(value)
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`
}

function getScoreVariant(score: number) {
  if (score >= 70) return "green"
  if (score >= 50) return "amber"
  return "red"
}

function getDotColor(score: number): string | null {
  if (score < 50) return "bg-red-500"
  if (score < 70) return "bg-amber-500"
  return null
}

function getRevenueColor(percent: number): string {
  if (percent >= 35) return "text-emerald-600 dark:text-emerald-400"
  if (percent >= 20) return "text-gray-700 dark:text-gray-300"
  return "text-red-600 dark:text-red-400"
}

const SCORE_BADGE_STYLES = {
  green:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  amber:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "attributedRevenue", label: "Fat. Atribuído" },
  { value: "revenuePercent", label: "% Receita" },
  { value: "storeRevenue", label: "Fat. Loja" },
]

// ─── Skeleton ─────────────────────────────────────────────

function ClientHealthSkeleton() {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="space-y-2">
          <SkeletonShimmer className="h-4 w-32" />
          <SkeletonShimmer className="h-3 w-48" />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonShimmer className="h-8 w-[140px] rounded-md" />
          <SkeletonShimmer className="h-4 w-16" />
        </div>
      </div>
      {/* Table skeleton */}
      <div className="flex-1 px-5 pb-4">
        <SkeletonShimmer className="mb-3 h-8 w-full rounded" />
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonShimmer key={i} className="mb-2 h-10 w-full rounded" />
        ))}
      </div>
      {/* Footer skeleton */}
      <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-3 dark:border-[rgba(255,255,255,0.06)]">
        <SkeletonShimmer className="h-3 w-28" />
        <div className="flex gap-2">
          <SkeletonShimmer className="h-7 w-16 rounded" />
          <SkeletonShimmer className="h-7 w-16 rounded" />
        </div>
      </div>
    </div>
  )
}

// ─── Tooltip content for row hover ───────────────────────

function ClientTooltipContent({ client }: { client: ClientHealth }) {
  return (
    <div className="min-w-[240px] space-y-0 p-1 text-[12px]">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">
            Faturamento Loja
          </span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {formatCurrency(client.storeRevenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">
            Faturamento Atribuído
          </span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {formatCurrency(client.attributedRevenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">% da Receita</span>
          <span className="font-mono tabular-nums text-[#4E62D8] dark:text-[#7B8CEA]">
            {client.revenuePercent.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="my-1.5 border-t border-gray-600 dark:border-gray-600" />

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">Open Rate</span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {client.openRate?.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">Click Rate</span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {client.clickRate?.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">CTOR</span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {client.ctor?.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">Bounce</span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {client.bounceRate?.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-gray-400 dark:text-gray-500">Unsub Rate</span>
          <span className="font-mono tabular-nums text-gray-200 dark:text-gray-300">
            {client.unsubRate?.toFixed(2)}%
          </span>
        </div>
      </div>

      {client.problem && (
        <>
          <div className="my-1.5 border-t border-gray-600 dark:border-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="text-red-400">{client.problem}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── DashboardClientHealth (exported) ────────────────────

export function DashboardClientHealth({
  loading = false,
  storeBreakdown,
}: DashboardClientHealthProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [page, setPage] = useState(0)

  const MAX_VISIBLE = 9

  // Map real storeBreakdown to ClientHealth format, fallback to mock
  const allClients: ClientHealth[] = useMemo(() => {
    if (storeBreakdown && storeBreakdown.length > 0) {
      return storeBreakdown.map((s, i) => {
        const storeRev = Number(s.totalRevenueBRL) || s.totalRevenue || 0
        const attributed = (Number(s.campaignRevenueBRL) || s.campaignRevenue || 0) +
          (Number(s.flowRevenueBRL) || s.flowRevenue || 0)
        const pct = storeRev > 0 ? (attributed / storeRev) * 100 : 0
        // Simple score based on attribution rate (0-100)
        const score = Math.min(100, Math.round(pct * 2.5))
        return {
          id: s.storeId || String(i),
          name: s.storeName || s.clientName,
          storeRevenue: storeRev,
          attributedRevenue: attributed,
          revenuePercent: Math.round(pct * 10) / 10,
          score,
        }
      })
    }
    return MOCK_CLIENTS
  }, [storeBreakdown])

  const totalStores = allClients.length
  const needsAttention = allClients.filter((c) => c.score < 70).length
  const totalPages = 1 // single page with max 9 visible

  const sorted = useMemo(() => {
    const copy = [...allClients]
    copy.sort((a, b) => {
      if (sortKey === "score") return a.score - b.score
      if (sortKey === "attributedRevenue")
        return b.attributedRevenue - a.attributedRevenue
      if (sortKey === "revenuePercent")
        return b.revenuePercent - a.revenuePercent
      if (sortKey === "storeRevenue")
        return b.storeRevenue - a.storeRevenue
      return 0
    })
    return copy.slice(0, MAX_VISIBLE)
  }, [sortKey, allClients])

  if (loading) {
    return <ClientHealthSkeleton />
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300">
              Saúde das Lojas
            </h3>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                  Ranking das lojas por receita e score de saúde. Identifique rapidamente quais clientes precisam de atenção com base na receita atribuída e performance geral.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="mt-0.5 text-[12px] text-gray-400 dark:text-gray-500">
            {needsAttention} precisam atenção &middot; {Math.min(MAX_VISIBLE, totalStores)} de{" "}
            {totalStores}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={sortKey}
            onValueChange={(v) => {
              setSortKey(v as SortKey)
              setPage(0)
            }}
          >
            <SelectTrigger className="h-8 w-[140px] border-gray-200 text-xs dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            className="whitespace-nowrap text-[12px] font-medium text-[#4E62D8] hover:underline dark:text-[#7B8CEA]"
          >
            Ver todos
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB] dark:bg-[#111827]/50">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Loja
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Fat. Loja
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Fat. Atrib.
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                % Receita
              </th>
              <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Score
              </th>
            </tr>
          </thead>
          <TooltipProvider delayDuration={300}>
            <tbody>
              {sorted.map((client) => {
                const dotColor = getDotColor(client.score)
                const variant = getScoreVariant(client.score)

                return (
                  <Tooltip key={client.id}>
                    <TooltipTrigger asChild>
                      <tr
                        className={cn(
                          "cursor-default border-b border-[rgba(0,0,0,0.04)] last:border-b-0",
                          "transition-colors hover:bg-[rgba(0,0,0,0.02)]",
                          "dark:border-[rgba(255,255,255,0.04)] dark:hover:bg-[rgba(255,255,255,0.02)]"
                        )}
                      >
                        {/* Loja */}
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            {dotColor && (
                              <span
                                className={cn(
                                  "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                                  dotColor
                                )}
                              />
                            )}
                            <span className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                              {client.name}
                            </span>
                          </div>
                        </td>

                        {/* Fat. Loja */}
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-gray-700 dark:text-gray-300">
                          {formatCompact(client.storeRevenue)}
                        </td>

                        {/* Fat. Atrib. */}
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] font-medium tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                          {formatCompact(client.attributedRevenue)}
                        </td>

                        {/* % Receita */}
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-mono text-[13px] font-medium tabular-nums",
                            getRevenueColor(client.revenuePercent)
                          )}
                        >
                          {client.revenuePercent}%
                        </td>

                        {/* Score */}
                        <td className="px-5 py-2.5 text-right">
                          <span
                            className={cn(
                              "inline-flex min-w-[36px] items-center justify-center rounded-full px-2 py-0.5 text-[13px] font-semibold",
                              SCORE_BADGE_STYLES[variant]
                            )}
                          >
                            {client.score}
                          </span>
                        </td>
                      </tr>
                    </TooltipTrigger>
                    <TooltipContent
                      side="left"
                      className="rounded-lg border-gray-700 bg-gray-900 p-3 text-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
                    >
                      <ClientTooltipContent client={client} />
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </tbody>
          </TooltipProvider>
        </table>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-3 dark:border-[rgba(255,255,255,0.06)]">
        <span className="text-[12px] text-gray-400 dark:text-gray-500">
          {Math.min(MAX_VISIBLE, totalStores)} de {totalStores} lojas
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              "border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400",
              "hover:bg-gray-50 dark:hover:bg-gray-800",
              "disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              "border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400",
              "hover:bg-gray-50 dark:hover:bg-gray-800",
              "disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            Próximo
          </button>
        </div>
      </div>
    </div>
  )
}
