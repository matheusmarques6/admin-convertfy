"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { TrendingUp, RefreshCw, Megaphone, Workflow, Store, AlertTriangle } from "lucide-react"
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

  const [isSyncing, setIsSyncing] = useState(false)

  const { data, error, isLoading, isValidating, mutate } = useSWR<TotalRevenueData>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      // Poll every 30s when syncing/loading, otherwise disable polling
      refreshInterval: isSyncing ? 30000 : 0,
      onSuccess: (d) => setIsSyncing(
        d?.dataStatus === "syncing" || d?.dataStatus === "loading" || d?.isRefreshing === true
      ),
    }
  )

  const dataStatusMeta = useDataStatus(data ? {
    dataStatus: data.dataStatus ?? "ready",
    lastFetchedAt: data.lastFetchedAt ?? null,
    isRefreshing: data.isRefreshing ?? isValidating,
    source: data.source ?? "cache",
  } : undefined)

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
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#0a1628] via-[#0f2035] to-[#0a2540] shadow-lg shadow-black/20">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-white/10 p-1.5">
              <TrendingUp className="h-4 w-4 text-[#05AFF2]" />
            </div>
            <h2 className="text-base font-semibold text-white">Resultado Total</h2>
            <span className="text-xs text-white/50 hidden sm:inline">
              Receita gerada via Klaviyo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PeriodPicker
              value={{ period, customStart, customEnd }}
              onChange={({ period: p, customStart: s, customEnd: e }) => {
                setPeriod(p)
                setCustomStart(s)
                setCustomEnd(e)
              }}
              className="border-white/15 bg-white/10 text-white hover:bg-white/15 [&>svg]:text-white/70"
            />
            <RefreshButton
              onRefresh={() => {
                // Re-fetch with force_refresh to bypass cache
                const separator = swrKey?.includes("?") ? "&" : "?"
                mutate(
                  fetch(`${swrKey}${separator}force_refresh=true`)
                    .then(r => r.ok ? r.json() : Promise.reject(new Error("Refresh failed")))
                )
              }}
              isRefreshing={dataStatusMeta.isRefreshing || isValidating}
              lastFetchedAt={dataStatusMeta.lastFetchedAt}
              size="md"
              className="rounded-lg border-white/15 bg-white/10 text-white/70 hover:text-white hover:bg-white/15"
            />
          </div>
        </div>

        {/* Data status banner — force dark-friendly colors inside the always-dark container */}
        <DataStatusBanner
          status={data?.dataStatus}
          lastFetchedAt={data?.lastFetchedAt}
          isRefreshing={data?.isRefreshing ?? isValidating}
          className="rounded-lg !bg-white/10 !text-white/80"
        />

        {/* Main number */}
        <div>
          <p className="text-3xl md:text-4xl font-bold tracking-tight text-[#05AFF2]">
            {formatCurrency(animatedTotal)}
          </p>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <p className="text-sm text-white/50">
              {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
            </p>
            {data?.hasPartialData && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                      <AlertTriangle className="h-3 w-3" />
                      Dados parciais
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{PARTIAL_DATA_TOOLTIP}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {data?.lastFetchedAt && (
              <TimeAgo date={data.lastFetchedAt} className="text-xs text-white/40" />
            )}
          </div>
        </div>

        {/* Breakdown: campaigns vs flows */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="rounded-xl p-2.5 bg-[#05AFF2]/15">
              <Megaphone className="h-4 w-4 text-[#05AFF2]" />
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Campanhas</p>
              <p className="text-lg font-semibold tracking-tight text-white">{formatCurrency(animatedCampaign)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="rounded-xl p-2.5 bg-[#05AFF2]/15">
              <Workflow className="h-4 w-4 text-[#05AFF2]" />
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Flows</p>
              <p className="text-lg font-semibold tracking-tight text-white">{formatCurrency(animatedFlow)}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
