"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { TrendingUp, RefreshCw, Megaphone, Workflow, Store } from "lucide-react"
import { CardDescription, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { formatCurrency, cn } from "@/lib/utils"

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface TotalRevenueData {
  period: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  topStores: StoreRevenue[]
  cachedAt: string
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
}

export function TotalRevenueBanner({ storeIds }: TotalRevenueBannerProps = {}) {
  const [period, setPeriod] = useState("30d")
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const [data, setData] = useState<TotalRevenueData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async (p: string, startDate?: Date, endDate?: Date) => {
    setIsLoading(true)
    try {
      let url = `/api/dashboard/total-revenue?period=${p}`
      if (p === "custom" && startDate && endDate) {
        url += `&start_date=${format(startDate, "yyyy-MM-dd")}&end_date=${format(endDate, "yyyy-MM-dd")}`
      }
      if (storeIds && storeIds.length > 0) {
        url += `&store_ids=${storeIds.join(",")}`
      }
      const response = await fetch(url)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (err) {
      console.error("Error loading total revenue:", err)
    } finally {
      setIsLoading(false)
    }
  }, [storeIds])

  useEffect(() => {
    if (period !== "custom") {
      loadData(period)
    }
  }, [period, loadData])

  const handleCustomDateApply = (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    setPeriod("custom")
    loadData("custom", start, end)
  }

  const animatedTotal = useCountUp(data?.totalRevenue || 0)
  const animatedCampaign = useCountUp(data?.campaignRevenue || 0)
  const animatedFlow = useCountUp(data?.flowRevenue || 0)

  // Skeleton loading
  if (isLoading && !data) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6">
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

  // Empty state
  if (data && data.storesCount === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="rounded-xl bg-muted/50 p-3 mb-4">
            <Store className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">Resultado Total</h3>
          <p className="text-sm text-muted-foreground text-center mt-1.5 max-w-xs">
            Conecte lojas com Klaviyo para ver a receita gerada
          </p>
        </div>
      </div>
    )
  }

  const maxRevenue = data?.topStores[0]?.totalRevenue || 1

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-[#5327F2]/8 via-card to-card before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:bg-gradient-to-r before:from-[#5327F2] before:via-[#4B53F2] before:to-[#05AFF2] before:rounded-t-2xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#5327F2]/10 p-1.5">
              <TrendingUp className="h-4 w-4 text-[#5327F2]" />
            </div>
            <h2 className="text-base font-semibold">Resultado Total</h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Receita gerada via Klaviyo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => {
              setPeriod(v)
              setCustomStart(undefined)
              setCustomEnd(undefined)
            }}>
              <SelectTrigger className="w-28 h-9 rounded-lg border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="15d">15 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="90d">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              startDate={customStart}
              endDate={customEnd}
              onApply={handleCustomDateApply}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              onClick={() => loadData(period, customStart, customEnd)}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Main number */}
        <div>
          <CardTitle className="text-4xl md:text-5xl font-bold tracking-tight text-[#5327F2]">
            {formatCurrency(animatedTotal)}
          </CardTitle>
          <CardDescription className="mt-1.5 text-sm">
            {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
          </CardDescription>
        </div>

        {/* Breakdown: campaigns vs flows */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm">
            <div className="rounded-xl p-2.5 bg-[#5327F2]/10">
              <Megaphone className="h-4 w-4 text-[#5327F2]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Campanhas</p>
              <p className="text-lg font-semibold tracking-tight">{formatCurrency(animatedCampaign)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm">
            <div className="rounded-xl p-2.5 bg-[#05AFF2]/10">
              <Workflow className="h-4 w-4 text-[#05AFF2]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Flows</p>
              <p className="text-lg font-semibold tracking-tight">{formatCurrency(animatedFlow)}</p>
            </div>
          </div>
        </div>

        {/* Top 5 stores */}
        {data?.topStores && data.topStores.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Lojas</p>
            <div className="space-y-2.5">
              {data.topStores.map((store) => {
                const widthPercent = Math.max((store.totalRevenue / maxRevenue) * 100, 4)
                return (
                  <Link
                    key={store.storeId}
                    href={`/stores/${store.storeId}`}
                    className="block group"
                  >
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="truncate max-w-[60%] group-hover:text-[#5327F2] transition-colors">
                        {store.storeName}
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          ({store.clientName})
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">{formatCurrency(store.totalRevenue)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5327F2] to-[#05AFF2] transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
