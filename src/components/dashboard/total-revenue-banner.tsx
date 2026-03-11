"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { TrendingUp, RefreshCw, Megaphone, Workflow, Store, AlertTriangle } from "lucide-react"
import { useRealtimeRevenue } from "@/hooks/use-realtime-revenue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PeriodPicker } from "@/components/ui/period-picker"
import { formatCurrency } from "@/lib/utils"
import { TimeAgo } from "@/components/ui/time-ago"
import { PARTIAL_DATA_TOOLTIP } from "@/components/ui/sync-status-badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DataStatusBanner } from "@/components/ui/data-status-banner"
import { RefreshButton } from "@/components/ui/refresh-button"
import { useDataStatus } from "@/hooks/use-data-status"
import type { DataStatus } from "@/lib/shared/data-status"

export interface RevenueStoreItem {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  currency?: string
  totalRevenueBRL?: number
  campaignRevenueBRL?: number
  flowRevenueBRL?: number
}

export interface TotalRevenueData {
  period: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  topStores: RevenueStoreItem[]
  bottomStores: RevenueStoreItem[]
  storeBreakdown?: RevenueStoreItem[]
  hasPartialData?: boolean
  lastFetchedAt?: string | null
  cachedAt: string
  dataStatus?: DataStatus
  isRefreshing?: boolean
  source?: "cache" | "live" | "stale-cache"
}

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    if (target === prevTarget.current) return
    const start = prevTarget.current
    prevTarget.current = target

    const startTime = performance.now()

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(start + (target - start) * eased)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [target, duration])

  return value
}

interface TotalRevenueBannerProps {
  storeIds?: string[]
  period?: string
  onPeriodChange?: (period: string) => void
  onDataChange?: (data: TotalRevenueData | null) => void
}

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error("Erro ao carregar revenue")
  return res.json()
})

export function TotalRevenueBanner({ storeIds, period: controlledPeriod, onPeriodChange, onDataChange }: TotalRevenueBannerProps = {}) {
  const [internalPeriod, setInternalPeriod] = useState("30d")
  const period = controlledPeriod ?? internalPeriod
  const setPeriod = (v: string) => {
    setInternalPeriod(v)
    onPeriodChange?.(v)
  }
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()

  // Build SWR key from current state
  const swrKey = (() => {
    let url = `/api/dashboard/total-revenue?period=${period}`
    if (period === "custom" && customStart && customEnd) {
      url += `&start_date=${format(customStart, "yyyy-MM-dd")}&end_date=${format(customEnd, "yyyy-MM-dd")}`
    } else if (period === "custom") {
      return null // Don't fetch until dates are selected
    }
    if (storeIds && storeIds.length > 0) {
      url += `&store_ids=${storeIds.join(",")}`
    }
    return url
  })()

  const { data, error, isLoading, isValidating, mutate } = useSWR<TotalRevenueData>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )

  // Realtime: auto-update when store_revenue_summary changes in DB
  const handleRealtimeUpdate = useCallback(() => { mutate() }, [mutate])
  const { isRefreshing: realtimeRefreshing, triggerRefresh } = useRealtimeRevenue({
    period,
    onDataUpdate: handleRealtimeUpdate,
  })

  const dataStatusMeta = useDataStatus(data ? {
    dataStatus: data.dataStatus ?? "ready",
    lastFetchedAt: data.lastFetchedAt ?? null,
    isRefreshing: realtimeRefreshing || (data.isRefreshing ?? isValidating),
    source: data.source ?? "cache",
  } : undefined)

  // Auto-trigger background refresh when server signals stale data
  const hasTriggeredAutoRefresh = useRef(false)
  useEffect(() => {
    const isStale = (data as unknown as Record<string, unknown>)?.isStale === true
    if (isStale && !isValidating && !realtimeRefreshing && !hasTriggeredAutoRefresh.current) {
      hasTriggeredAutoRefresh.current = true
      triggerRefresh()
    }
    if (data?.dataStatus === "ready") {
      hasTriggeredAutoRefresh.current = false
    }
  }, [data, isValidating, realtimeRefreshing, triggerRefresh])

  // Notify parent when data changes (so cards can consume topStores/bottomStores)
  useEffect(() => {
    onDataChange?.(data ?? null)
  }, [data, onDataChange])

  const animatedTotal = useCountUp(data?.totalRevenue || 0)
  const animatedCampaign = useCountUp(data?.campaignRevenue || 0)
  const animatedFlow = useCountUp(data?.flowRevenue || 0)

  // Skeleton loading
  if (isLoading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
          <Skeleton className="h-14 w-72" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state (only show when no stale data available)
  if (error && !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="rounded-xl bg-muted p-3 mb-4">
            <Store className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Erro ao carregar receita</h3>
          <p className="text-sm text-muted-foreground text-center mt-1.5 max-w-xs">
            Tente novamente em alguns instantes
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // Syncing state — cache is empty but stores with Klaviyo exist
  if (data && data.dataStatus === "syncing" && data.storesCount > 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="rounded-xl bg-muted p-3 mb-4">
            <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Dados sendo sincronizados...
          </h3>
          <p className="text-sm text-muted-foreground text-center mt-1.5 max-w-xs">
            {data.storesCount} {data.storesCount === 1 ? "loja" : "lojas"} com Klaviyo {data.storesCount === 1 ? "encontrada" : "encontradas"}.
            O primeiro sync pode levar alguns minutos.
          </p>
        </div>
      </div>
    )
  }

  // Empty state
  if (data && data.storesCount === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="rounded-xl bg-muted p-3 mb-4">
            <Store className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Resultado Total</h3>
          <p className="text-sm text-muted-foreground text-center mt-1.5 max-w-xs">
            Conecte lojas com Klaviyo para ver a receita gerada
          </p>
        </div>
      </div>
    )
  }

  // Calculate percentage for Klaviyo attribution (example calculation)
  const klaviyoPercentage = data?.totalRevenue && data.totalRevenue > 0
    ? Math.round(((data.campaignRevenue + data.flowRevenue) / data.totalRevenue) * 100 * 10) / 10
    : 0

  return (
    <div className="rounded-xl overflow-hidden shadow-xl shadow-[#041366]/20">
      {/* Main gradient container */}
      <div className="relative" style={{ background: 'linear-gradient(135deg, #4e62d8 0%, #2137b6 40%, #041366 100%)' }}>
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.05) 0%, transparent 40%)' }} />

        <div className="relative p-6 space-y-5">
          {/* Header with title and controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Receita Total da Loja</h2>
                <span className="text-xs text-white/60">
                  Receita gerada via Klaviyo
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PeriodPicker
                value={{ period, customStart, customEnd }}
                onChange={({ period: p, customStart: s, customEnd: e }) => {
                  setPeriod(p)
                  setCustomStart(s)
                  setCustomEnd(e)
                }}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm [&>svg]:text-white/70"
              />
              <RefreshButton
                onRefresh={() => {
                  triggerRefresh()
                }}
                isRefreshing={dataStatusMeta.isRefreshing || isValidating}
                lastFetchedAt={dataStatusMeta.lastFetchedAt}
                size="md"
                className="rounded-lg border-white/20 bg-white/10 text-white/70 hover:text-white hover:bg-white/20 backdrop-blur-sm"
              />
            </div>
          </div>

          {/* Data status banner */}
          <DataStatusBanner
            status={data?.dataStatus}
            lastFetchedAt={data?.lastFetchedAt}
            isRefreshing={data?.isRefreshing ?? isValidating}
            className="rounded-lg !bg-white/10 !text-white/80 backdrop-blur-sm"
          />

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-6 items-center">
            {/* Left: Main revenue number */}
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                  {formatCurrency(animatedTotal)}
                </p>
                {data?.hasPartialData && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-300 bg-yellow-500/20 px-2 py-1 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          Dados parciais
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{PARTIAL_DATA_TOOLTIP}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 flex-wrap">
                <p className="text-sm text-white/60">
                  Atribuicao Klaviyo: <span className="text-white font-medium">{formatCurrency(data?.campaignRevenue || 0 + (data?.flowRevenue || 0))}</span>
                  <span className="text-white/40 ml-1">({klaviyoPercentage}% do total)</span>
                </p>
              </div>
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                <p className="text-xs text-white/40">
                  {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
                </p>
                {data?.lastFetchedAt && (
                  <TimeAgo date={data.lastFetchedAt} className="text-xs text-white/30" />
                )}
              </div>
            </div>

            {/* Right: Klaviyo percentage circle */}
            <div className="hidden lg:flex flex-col items-center justify-center">
              <p className="text-xs text-white/50 mb-2">Atribuicao Klaviyo</p>
              <div className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${klaviyoPercentage * 2.51} 251`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{klaviyoPercentage}%</span>
                </div>
              </div>
              <p className="text-xs text-white/40 mt-1">do faturamento</p>
            </div>
          </div>

          {/* Breakdown cards: Flows, Campaigns, SMS, Estimated Profit */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <p className="text-xs text-white/60 font-medium">Flows</p>
              </div>
              <p className="text-xl font-bold text-white">{formatCurrency(animatedFlow)}</p>
              <p className="text-xs text-emerald-400 mt-1">
                {data?.totalRevenue && data.totalRevenue > 0
                  ? `${((data.flowRevenue / data.totalRevenue) * 100).toFixed(1)}% da receita`
                  : '0% da receita'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <p className="text-xs text-white/60 font-medium">Campanhas</p>
              </div>
              <p className="text-xl font-bold text-white">{formatCurrency(animatedCampaign)}</p>
              <p className="text-xs text-emerald-400 mt-1">
                {data?.totalRevenue && data.totalRevenue > 0
                  ? `${((data.campaignRevenue / data.totalRevenue) * 100).toFixed(1)}% da receita`
                  : '0% da receita'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <p className="text-xs text-white/60 font-medium">SMS</p>
              </div>
              <p className="text-xl font-bold text-white">R$ 0,00</p>
              <p className="text-xs text-white/40 mt-1">0.0% da receita</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.08] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <p className="text-xs text-white/60 font-medium">Lucro Estimado</p>
              </div>
              <p className="text-xl font-bold text-white">{formatCurrency((data?.totalRevenue || 0) * 0.3)}</p>
              <p className="text-xs text-emerald-400 mt-1">30% margem</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
