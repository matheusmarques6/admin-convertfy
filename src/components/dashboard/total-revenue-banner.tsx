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

  return (
    <div className="rounded-[24px] border-y border-border/50 bg-background py-8 lg:py-12 px-2 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent opacity-50 pointer-events-none" />
      <div className="p-4 sm:p-6 space-y-8 relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/40 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/20 p-2 border border-primary/30">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-medium tracking-tight text-foreground uppercase">Resultado Total</h2>
            <span className="text-sm font-medium text-muted-foreground hidden sm:inline px-3 py-1 rounded-full bg-muted/40">
              Receita gerada via Klaviyo
            </span>
          </div>
          <div className="flex items-center gap-3">
            <PeriodPicker
              value={{ period, customStart, customEnd }}
              onChange={({ period: p, customStart: s, customEnd: e }) => {
                setPeriod(p)
                setCustomStart(s)
                setCustomEnd(e)
              }}
              className="border-border bg-card text-foreground hover:bg-muted font-medium"
            />
            <RefreshButton
              onRefresh={() => {
                triggerRefresh()
              }}
              isRefreshing={dataStatusMeta.isRefreshing || isValidating}
              lastFetchedAt={dataStatusMeta.lastFetchedAt}
              size="md"
              className="rounded-xl border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
            />
          </div>
        </div>

        {/* Data status banner */}
        <DataStatusBanner
          status={data?.dataStatus}
          lastFetchedAt={data?.lastFetchedAt}
          isRefreshing={data?.isRefreshing ?? isValidating}
          className="rounded-xl border border-warning/20 bg-warning/5"
        />

        {/* Main number - MASSIVE TYPOGRAPHY */}
        <div className="flex flex-col gap-2">
          <p className="text-5xl sm:text-7xl lg:text-[6rem] leading-[0.9] font-black tracking-tighter text-foreground bg-clip-text text-transparent bg-gradient-to-br from-primary via-primary to-info/80">
            {formatCurrency(animatedTotal)}
          </p>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <p className="text-sm font-medium px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground">
              {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
            </p>
            {data?.hasPartialData && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-xs font-semibold text-warning border border-warning/20">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Dados parciais
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{PARTIAL_DATA_TOOLTIP}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {data?.lastFetchedAt && (
              <TimeAgo date={data.lastFetchedAt} className="text-xs font-medium text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Breakdown: campaigns vs flows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-8 pt-4">
          <div className="flex flex-col gap-3 p-6 sm:p-8 rounded-[24px] border border-border/60 bg-card hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2.5 bg-success/10 border border-success/20 group-hover:scale-110 transition-transform">
                <Megaphone className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider">Campanhas</p>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">{formatCurrency(animatedCampaign)}</p>
          </div>
          
          <div className="flex flex-col gap-3 p-6 sm:p-8 rounded-[24px] border border-border/60 bg-card hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-xl p-2.5 bg-primary/10 border border-primary/20 group-hover:scale-110 transition-transform">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider">Flows</p>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">{formatCurrency(animatedFlow)}</p>
          </div>
        </div>

      </div>
    </div>
  )
}
