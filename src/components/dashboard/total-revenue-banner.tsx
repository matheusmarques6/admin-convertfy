"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
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
import { GlowCard } from "@/components/ui/glow-card"
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

export function TotalRevenueBanner() {
  const [period, setPeriod] = useState("30d")
  const [data, setData] = useState<TotalRevenueData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async (p: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/dashboard/total-revenue?period=${p}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (err) {
      console.error("Error loading total revenue:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(period)
  }, [period, loadData])

  const animatedTotal = useCountUp(data?.totalRevenue || 0)
  const animatedCampaign = useCountUp(data?.campaignRevenue || 0)
  const animatedFlow = useCountUp(data?.flowRevenue || 0)

  // Skeleton loading
  if (isLoading && !data) {
    return (
      <GlowCard color="primary" intensity="moderate" surfaceClassName="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </div>
      </GlowCard>
    )
  }

  // Empty state
  if (data && data.storesCount === 0) {
    return (
      <GlowCard color="primary" intensity="subtle" surfaceClassName="p-6">
        <div className="flex flex-col items-center justify-center py-6">
          <Store className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-medium">Resultado Total</h3>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Conecte lojas com Klaviyo para ver a receita gerada
          </p>
        </div>
      </GlowCard>
    )
  }

  const maxRevenue = data?.topStores[0]?.totalRevenue || 1

  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-[#5327F2]/5 via-transparent to-transparent dark:from-[#5327F2]/10">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#5327F2]" />
            <h2 className="text-lg font-semibold">Resultado Total</h2>
            <span className="text-xs text-muted-foreground">
              Receita gerada via Klaviyo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="15d">15 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="90d">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => loadData(period)}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Main number */}
        <div>
          <CardTitle className="text-4xl font-bold text-[#5327F2]">
            {formatCurrency(animatedTotal)}
          </CardTitle>
          <CardDescription className="mt-1">
            {data?.storesWithRevenue || 0} de {data?.storesCount || 0} lojas geraram receita
          </CardDescription>
        </div>

        {/* Breakdown: campaigns vs flows */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="rounded-lg p-2 bg-[#5327F2]/10">
              <Megaphone className="h-4 w-4 text-[#5327F2]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Campanhas</p>
              <p className="text-lg font-semibold">{formatCurrency(animatedCampaign)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="rounded-lg p-2 bg-[#7C5DFA]/10">
              <Workflow className="h-4 w-4 text-[#7C5DFA]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Flows</p>
              <p className="text-lg font-semibold">{formatCurrency(animatedFlow)}</p>
            </div>
          </div>
        </div>

        {/* Top 5 stores */}
        {data?.topStores && data.topStores.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Top Lojas</p>
            <div className="space-y-2">
              {data.topStores.map((store) => {
                const widthPercent = Math.max((store.totalRevenue / maxRevenue) * 100, 4)
                return (
                  <Link
                    key={store.storeId}
                    href={`/stores/${store.storeId}`}
                    className="block group"
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="truncate max-w-[60%] group-hover:text-[#5327F2] transition-colors">
                        {store.storeName}
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({store.clientName})
                        </span>
                      </span>
                      <span className="font-medium">{formatCurrency(store.totalRevenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5327F2] to-[#7C5DFA] transition-all duration-500"
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
