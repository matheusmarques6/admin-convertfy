"use client"

import { useState, useMemo } from "react"
import { Search, ExternalLink, ChevronLeft, ChevronRight, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/ui/status-badge"
import { SkeletonShimmer } from "@/components/ui/skeleton"

// ─── Types ────────────────────────────────────────────────

type TrendDirection = "up" | "down" | "flat"

interface ClientRevenueRow {
  id: string
  name: string
  revenue: number
  openRate: number
  clickRate: number
  trend: TrendDirection
  sparklinePoints: number[]
  status: "active" | "at-risk" | "churned"
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

interface DashboardClientsRevenueProps {
  loading?: boolean
  storeBreakdown?: StoreBreakdownItem[]
}

const PAGE_SIZE = 5

// ─── Helpers ──────────────────────────────────────────────

function formatRevenue(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// ─── Sparkline ────────────────────────────────────────────

function Sparkline({ points, trend }: { points: number[]; trend: TrendDirection }) {
  const color = trend === "up" ? "#10B981" : trend === "down" ? "#EF4444" : "#9CA3AF"

  const width = 60
  const height = 20
  const padding = 2

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  const coords = points.map((val, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2)
    const y = height - padding - ((val - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="shrink-0"
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <SkeletonShimmer className="h-4 w-32" />
          <SkeletonShimmer className="h-4 w-20 ml-auto" />
          <SkeletonShimmer className="h-4 w-14" />
          <SkeletonShimmer className="h-4 w-14" />
          <SkeletonShimmer className="h-4 w-[60px]" />
          <SkeletonShimmer className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Mobile Card ──────────────────────────────────────────

function MobileClientCard({ client }: { client: ClientRevenueRow }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 last:border-b-0",
        "dark:border-[rgba(255,255,255,0.06)]"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-gray-900 dark:text-white dark:text-[#EAEDF3]">
          {client.name}
        </span>
        <StatusBadge status={client.status} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white dark:text-gray-100">
          {formatRevenue(client.revenue)}
        </span>
        <div className="flex items-center gap-3 text-[12px] text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50">
          <span>
            Open{" "}
            <span className="font-mono tabular-nums text-gray-700 dark:text-white/90 dark:text-gray-300">
              {formatPercent(client.openRate)}
            </span>
          </span>
          <span>
            Click{" "}
            <span className="font-mono tabular-nums text-gray-700 dark:text-white/90 dark:text-gray-300">
              {formatPercent(client.clickRate)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────

export function DashboardClientsRevenue({ loading = false, storeBreakdown }: DashboardClientsRevenueProps) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  // Map real storeBreakdown to ClientRevenueRow. Empty when no data — UI shows
  // "Nenhum cliente encontrado" empty state instead of fake data.
  const allClients: ClientRevenueRow[] = useMemo(() => {
    if (!storeBreakdown || storeBreakdown.length === 0) return []
    return storeBreakdown
      .map((s, i) => {
        const rev = Number(s.totalRevenueBRL) || s.totalRevenue || 0
        return {
          id: s.storeId || String(i),
          name: s.storeName || s.clientName,
          revenue: rev,
          openRate: 0,
          clickRate: 0,
          trend: "flat" as TrendDirection,
          sparklinePoints: [rev, rev, rev, rev, rev, rev, rev],
          status: "active" as const,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)
  }, [storeBreakdown])

  const filtered = useMemo(() => {
    if (!search.trim()) return allClients
    const q = search.toLowerCase().trim()
    return allClients.filter((c) => c.name.toLowerCase().includes(q))
  }, [search, allClients])

  // Reset page when search changes
  const safePageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, safePageCount - 1)
  const pageData = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const totalClients = filtered.length
  const showingStart = totalClients === 0 ? 0 : safePage * PAGE_SIZE + 1
  const showingEnd = Math.min((safePage + 1) * PAGE_SIZE, totalClients)

  const canPrev = safePage > 0
  const canNext = safePage < safePageCount - 1

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27]",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
            Clientes por Receita
          </h3>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                Tabela paginada de todos os clientes ordenados por receita. Visualize open rate, click rate, tendência e status (ativo, em risco ou churned) de cada loja.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-white/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              placeholder="Buscar cliente..."
              className={cn(
                "h-8 max-w-[200px] rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-transparent pl-8 pr-3 text-[13px] text-gray-700 dark:text-white/90 placeholder:text-gray-400 dark:text-white/50",
                "outline-none transition-colors focus:border-[#4E62D8]/40 focus:ring-1 focus:ring-[#4E62D8]/20",
                "dark:border-[rgba(255,255,255,0.08)] dark:text-gray-300 dark:placeholder:text-gray-500 dark:text-white/60"
              )}
            />
          </div>

          {/* Ver todos link */}
          <a
            href="#"
            className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#4E62D8] hover:underline dark:text-[#7B8CEA]"
          >
            Ver todos
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F9FAFB] dark:bg-[#111827]/50">
                  <th className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Cliente
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Receita
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Open Rate
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Click Rate
                  </th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Trend
                  </th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400 dark:text-white/50">
                      Nenhum cliente encontrado
                    </td>
                  </tr>
                ) : (
                  pageData.map((client) => (
                    <tr
                      key={client.id}
                      className="transition-colors hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.02)]"
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-[13px] font-medium text-gray-900 dark:text-white dark:text-[#EAEDF3]">
                          {client.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-900 dark:text-white dark:text-gray-100">
                          {formatRevenue(client.revenue)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-white/90 dark:text-gray-300">
                          {formatPercent(client.openRate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-white/90 dark:text-gray-300">
                          {formatPercent(client.clickRate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-center">
                          <Sparkline points={client.sparklinePoints} trend={client.trend} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-center">
                          <StatusBadge status={client.status} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack */}
          <div className="block md:hidden">
            {pageData.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-gray-400 dark:text-white/50">
                Nenhum cliente encontrado
              </div>
            ) : (
              pageData.map((client) => (
                <MobileClientCard key={client.id} client={client} />
              ))
            )}
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-4 py-2.5 dark:border-[rgba(255,255,255,0.06)]">
        <p className="text-[12px] text-gray-400 dark:text-white/50">
          <span className="font-mono tabular-nums">{showingStart}</span>
          {totalClients > 0 && (
            <>
              –<span className="font-mono tabular-nums">{showingEnd}</span>
            </>
          )}{" "}
          de <span className="font-mono tabular-nums">{totalClients}</span> clientes
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => setPage((p) => p - 1)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors",
              canPrev
                ? "text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 dark:bg-[#242836] dark:text-gray-400 dark:text-white/50 dark:hover:bg-white/5"
                : "cursor-not-allowed text-gray-300 dark:text-gray-600 dark:text-white/70"
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setPage((p) => p + 1)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors",
              canNext
                ? "text-gray-600 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 dark:bg-[#242836] dark:text-gray-400 dark:text-white/50 dark:hover:bg-white/5"
                : "cursor-not-allowed text-gray-300 dark:text-gray-600 dark:text-white/70"
            )}
          >
            Próximo
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
