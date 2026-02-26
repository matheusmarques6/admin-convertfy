"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format } from "date-fns"
import { TrendingUp, RefreshCw, Megaphone, Workflow, Store } from "lucide-react"
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
            <Select value={period} onValueChange={(v) => {
              setPeriod(v)
              setCustomStart(undefined)
              setCustomEnd(undefined)
            }}>
              <SelectTrigger className="w-28 h-9 rounded-lg border-white/15 bg-white/10 text-white hover:bg-white/15 [&>svg]:text-white/70">
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
              className="h-9 w-9 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => loadData(period, customStart, customEnd)}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Main number */}
        <div>
          <p className="text-3xl md:text-4xl font-bold tracking-tight text-[#05AFF2]">
            {formatCurrency(animatedTotal)}
          </p>
          <p className="mt-1.5 text-sm text-white/50">
            {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
          </p>
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
