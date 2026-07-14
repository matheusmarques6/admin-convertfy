"use client"

import { useState, useMemo } from "react"
import {
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
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
  /** Open rate vs média de open rate da carteira (não é série temporal). */
  trend: TrendDirection
  /** Chave de status derivada do health_score (active/at-risk/critical/none). */
  status: string
}

/** Item vindo de /api/dashboard/stores-overview. */
interface StoreOverviewItem {
  id: string
  storeName: string
  clientName: string
  totalRevenueBRL: number
  healthScore: number | null
  campaigns?: {
    openRate?: number
    clickRate?: number
  }
}

interface DashboardClientsRevenueProps {
  loading?: boolean
  stores?: StoreOverviewItem[]
}

const PAGE_SIZE = 5

// ─── Helpers ──────────────────────────────────────────────

function formatRevenue(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/** Status da loja a partir do health score real (0-100). */
function statusFromHealth(score: number | null): string {
  if (score === null) return "none"
  if (score >= 70) return "active"
  if (score >= 50) return "at-risk"
  return "critical"
}

// ─── Trend indicator (open rate vs média da carteira) ─────

function TrendIndicator({ trend }: { trend: TrendDirection }) {
  const config = {
    up: { Icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", label: "Acima da média da carteira" },
    down: { Icon: TrendingDown, color: "text-red-600 dark:text-red-400", label: "Abaixo da média da carteira" },
    flat: { Icon: Minus, color: "text-gray-400 dark:text-white/50", label: "Na média da carteira" },
  }[trend]
  const { Icon } = config
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex", config.color)}>
            <Icon className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

export function DashboardClientsRevenue({ loading = false, stores }: DashboardClientsRevenueProps) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  // Map dos dados REAIS de /api/dashboard/stores-overview. Vazio quando sem
  // dados → empty state. open/click vem de campaigns.*; status do health_score
  // real; trend = open rate da loja vs média de open rate da carteira (leitura
  // honesta sem série temporal — a série real chega no Grupo 3).
  const allClients: ClientRevenueRow[] = useMemo(() => {
    if (!stores || stores.length === 0) return []
    const base = stores.map((s, i) => {
      const rev = Number(s.totalRevenueBRL) || 0
      const c = s.campaigns ?? {}
      return {
        id: s.id || String(i),
        name: s.storeName || s.clientName,
        revenue: rev,
        openRate: Number(c.openRate) || 0,
        clickRate: Number(c.clickRate) || 0,
        status: statusFromHealth(typeof s.healthScore === "number" ? s.healthScore : null),
      }
    })

    // Média de open rate da carteira (só lojas com envio real) → referência do trend.
    const withOpen = base.filter((b) => b.openRate > 0)
    const avgOpen = withOpen.length > 0
      ? withOpen.reduce((sum, b) => sum + b.openRate, 0) / withOpen.length
      : 0

    return base
      .map((b) => {
        let trend: TrendDirection = "flat"
        if (avgOpen > 0 && b.openRate > 0) {
          if (b.openRate > avgOpen * 1.05) trend = "up"
          else if (b.openRate < avgOpen * 0.95) trend = "down"
        }
        return { ...b, trend }
      })
      .sort((a, b) => b.revenue - a.revenue)
  }, [stores])

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
        "overflow-hidden rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27]",
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
                  <th scope="col" className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Cliente
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Receita
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Open Rate
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Click Rate
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
                    Trend
                  </th>
                  <th scope="col" className="py-2.5 px-4 text-center text-xs font-semibold uppercase tracking-[0.04em] text-gray-400 dark:text-white/50">
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
                          <TrendIndicator trend={client.trend} />
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
