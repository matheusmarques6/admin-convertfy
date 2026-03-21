"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { TrendingUp, RefreshCw, Megaphone, Workflow, Store, AlertTriangle, BarChart3, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
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
import { useReportJob } from "@/hooks/use-report-job"
import { ReportJobCard } from "@/components/shared/report-job-card"
import { useToast } from "@/lib/hooks/use-toast"
import type { DataStatus } from "@/lib/shared/data-status"
import type { ReportJobWithExpiry } from "@/components/shared/report-job-card"

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
  const { toast } = useToast()
  const [internalPeriod, setInternalPeriod] = useState("30d")
  const period = controlledPeriod ?? internalPeriod
  const setPeriod = (v: string) => {
    setInternalPeriod(v)
    onPeriodChange?.(v)
  }
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()

  // Report job hook — generates report for custom date ranges
  const handleReportComplete = useCallback((job: ReportJobWithExpiry) => {
    if (job.status === "completed") {
      toast({ title: "Relatorio pronto!", description: "Voce pode baixar o CSV." })
    } else if (job.status === "partial") {
      toast({ title: "Relatorio parcial concluido", description: "Algumas lojas falharam." })
    } else if (job.status === "failed") {
      toast({ title: "Relatorio falhou", description: "Tente novamente.", variant: "destructive" })
    }
  }, [toast])

  const {
    activeJob,
    isGenerating,
    jobDismissed,
    generateReport,
    retryReport,
    dismissJob,
  } = useReportJob({ onComplete: handleReportComplete })

  // Track the last standard (non-custom) period so we keep showing its data
  const lastStandardPeriodRef = useRef(period !== "custom" ? period : "30d")
  useEffect(() => {
    if (period !== "custom") lastStandardPeriodRef.current = period
  }, [period])

  const isCustomPeriod = period === "custom"
  const hasCustomDates = isCustomPeriod && !!customStart && !!customEnd

  // Build SWR key — when custom, keep fetching the LAST standard period's data
  const swrKey = (() => {
    const effectivePeriod = isCustomPeriod ? lastStandardPeriodRef.current : period
    let url = `/api/dashboard/total-revenue?period=${effectivePeriod}`
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
            <Icon icon={Store} customSize={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Erro ao carregar receita</h3>
          <p className="text-sm text-muted-foreground text-center mt-1.5 max-w-xs">
            Tente novamente em alguns instantes
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => mutate()}>
            <Icon icon={RefreshCw} customSize={14} className="mr-1.5" />
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
            <Icon icon={RefreshCw} customSize={32} className="text-muted-foreground animate-spin" />
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
            <Icon icon={Store} customSize={32} className="text-muted-foreground" />
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
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-white/10 p-1.5">
              <Icon icon={TrendingUp} size={16} className="text-[#05AFF2]" />
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
                triggerRefresh()
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
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#05AFF2]">
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
                      <Icon icon={AlertTriangle} customSize={12} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="rounded-xl p-2 sm:p-2.5 bg-[#05AFF2]/15 shrink-0">
              <Icon icon={Megaphone} size={16} className="text-[#05AFF2]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/50 font-medium">Campanhas</p>
              <p className="text-base sm:text-lg font-semibold tracking-tight text-white truncate">{formatCurrency(animatedCampaign)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="rounded-xl p-2 sm:p-2.5 bg-[#05AFF2]/15 shrink-0">
              <Icon icon={Workflow} size={16} className="text-[#05AFF2]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/50 font-medium">Flows</p>
              <p className="text-base sm:text-lg font-semibold tracking-tight text-white truncate">{formatCurrency(animatedFlow)}</p>
            </div>
          </div>
        </div>

        {/* Custom period — report generation */}
        {hasCustomDates && !activeJob && !isGenerating && (
          <div className="rounded-xl border border-[#05AFF2]/20 bg-[#05AFF2]/5 p-4 flex items-center gap-4">
            <div className="rounded-lg bg-[#05AFF2]/15 p-2.5 shrink-0">
              <Icon icon={BarChart3} size={20} className="text-[#05AFF2]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                Relatorio personalizado
              </p>
              <p className="text-xs text-white/60 mt-0.5">
                {format(customStart, "dd MMM", { locale: ptBR })} — {format(customEnd, "dd MMM yyyy", { locale: ptBR })}
              </p>
            </div>
            <Button
              size="sm"
              disabled={!data?.storeBreakdown?.length || isGenerating}
              className="shrink-0 rounded-lg bg-[#05AFF2]/20 hover:bg-[#05AFF2]/30 text-[#05AFF2] border-0 text-sm font-medium"
              onClick={() => {
                const ids = data?.storeBreakdown?.map(s => s.storeId) ?? []
                generateReport(
                  ids,
                  format(customStart, "yyyy-MM-dd"),
                  format(customEnd, "yyyy-MM-dd"),
                )
              }}
            >
              <Icon icon={BarChart3} customSize={14} className="mr-1.5" />
              Gerar Relatorio
            </Button>
          </div>
        )}

        {/* Generating spinner */}
        {hasCustomDates && isGenerating && !activeJob && (
          <div className="rounded-xl border border-[#05AFF2]/20 bg-[#05AFF2]/5 p-4 flex items-center gap-4">
            <div className="rounded-lg bg-[#05AFF2]/15 p-2.5 shrink-0">
              <Icon icon={Loader2} size={20} className="text-[#05AFF2] animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Iniciando relatorio...</p>
              <p className="text-xs text-white/60 mt-0.5">
                {format(customStart, "dd MMM", { locale: ptBR })} — {format(customEnd, "dd MMM yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        )}

        {/* Active report job card */}
        {activeJob && !jobDismissed && (
          <ReportJobCard
            job={activeJob}
            onClose={dismissJob}
            onRetry={retryReport}
            variant="dark"
          />
        )}

      </div>
    </div>
  )
}
