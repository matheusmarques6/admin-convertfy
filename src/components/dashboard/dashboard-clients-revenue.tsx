"use client"

import { useState, useMemo } from "react"
import { Search, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
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

interface DashboardClientsRevenueProps {
  loading?: boolean
}

// ─── Mock Data ────────────────────────────────────────────

const MOCK_CLIENTS: ClientRevenueRow[] = [
  { id: "1", name: "Donaris Joias", revenue: 156234, openRate: 36.1, clickRate: 5.2, trend: "up", sparklinePoints: [8, 10, 9, 12, 14, 16, 18], status: "active" },
  { id: "2", name: "AchaTudo Store", revenue: 124567, openRate: 34.2, clickRate: 4.8, trend: "up", sparklinePoints: [6, 8, 7, 10, 11, 13, 15], status: "active" },
  { id: "3", name: "Blessed Choice", revenue: 98432, openRate: 38.5, clickRate: 5.8, trend: "up", sparklinePoints: [5, 7, 8, 9, 11, 14, 16], status: "active" },
  { id: "4", name: "Oak Vintage", revenue: 87654, openRate: 35.1, clickRate: 4.5, trend: "up", sparklinePoints: [7, 6, 8, 10, 12, 13, 15], status: "active" },
  { id: "5", name: "Clube Rock", revenue: 76543, openRate: 32.8, clickRate: 3.9, trend: "flat", sparklinePoints: [10, 11, 10, 11, 10, 11, 10], status: "active" },
  { id: "6", name: "Nivalé", revenue: 73210, openRate: 37.2, clickRate: 4.1, trend: "down", sparklinePoints: [18, 16, 15, 13, 11, 9, 7], status: "at-risk" },
  { id: "7", name: "NUZE", revenue: 54321, openRate: 31.5, clickRate: 3.2, trend: "down", sparklinePoints: [16, 14, 13, 11, 10, 8, 6], status: "at-risk" },
  { id: "8", name: "Based 3.0", revenue: 42100, openRate: 28.3, clickRate: 2.1, trend: "down", sparklinePoints: [15, 14, 12, 10, 8, 6, 4], status: "at-risk" },
  { id: "9", name: "EPORTH Energia", revenue: 38900, openRate: 26.8, clickRate: 1.9, trend: "down", sparklinePoints: [14, 13, 11, 9, 7, 5, 3], status: "at-risk" },
  { id: "10", name: "Moda Viva", revenue: 32450, openRate: 33.4, clickRate: 3.8, trend: "up", sparklinePoints: [6, 7, 8, 10, 11, 13, 14], status: "active" },
]

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
        <span className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
          {client.name}
        </span>
        <StatusBadge status={client.status} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[15px] font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {formatRevenue(client.revenue)}
        </span>
        <div className="flex items-center gap-3 text-[12px] text-gray-500 dark:text-gray-400">
          <span>
            Open{" "}
            <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {formatPercent(client.openRate)}
            </span>
          </span>
          <span>
            Click{" "}
            <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {formatPercent(client.clickRate)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────

export function DashboardClientsRevenue({ loading = false }: DashboardClientsRevenueProps) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    if (!search.trim()) return MOCK_CLIENTS
    const q = search.toLowerCase().trim()
    return MOCK_CLIENTS.filter((c) => c.name.toLowerCase().includes(q))
  }, [search])

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
        "overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300">
          Clientes por Receita
        </h3>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              placeholder="Buscar cliente..."
              className={cn(
                "h-8 max-w-[200px] rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-transparent pl-8 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400",
                "outline-none transition-colors focus:border-[#4E62D8]/40 focus:ring-1 focus:ring-[#4E62D8]/20",
                "dark:border-[rgba(255,255,255,0.08)] dark:text-gray-300 dark:placeholder:text-gray-500"
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
                  <th className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Cliente
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Receita
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Open Rate
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Click Rate
                  </th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Trend
                  </th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400">
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
                        <span className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                          {client.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-900 dark:text-gray-100">
                          {formatRevenue(client.revenue)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-gray-300">
                          {formatPercent(client.openRate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[13px] tabular-nums text-gray-700 dark:text-gray-300">
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
              <div className="px-4 py-8 text-center text-[13px] text-gray-400">
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
        <p className="text-[12px] text-gray-400">
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
                ? "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                : "cursor-not-allowed text-gray-300 dark:text-gray-600"
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
                ? "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                : "cursor-not-allowed text-gray-300 dark:text-gray-600"
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
