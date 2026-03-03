"use client"

import Link from "next/link"
import { TrendingDown, RefreshCw } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, cn } from "@/lib/utils"
import { useStoreRevenue } from "@/hooks/use-store-revenue"

interface WorstPerformersCardProps {
  period?: string
}

export function WorstPerformersCard({ period = "30d" }: WorstPerformersCardProps) {
  const { data, isLoading, refresh } = useStoreRevenue(period)
  const stores = data?.bottomStores || []

  const maxRevenue = stores[0]?.totalRevenueBRL || 1

  return (
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <CardTitle className="text-sm font-semibold">Atenção Necessária</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && stores.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : data?.dataStatus === "syncing" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center py-2">Sincronizando...</p>
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : stores.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Todas as lojas com boa performance</p>
        ) : (
          stores.map((store, i) => {
            const widthPercent = Math.max(((store.totalRevenueBRL ?? store.totalRevenue) / maxRevenue) * 100, 4)
            const curr = store.currency || "BRL"
            return (
              <Link key={store.storeId} href={`/stores/${store.storeId}`} className="block group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="truncate max-w-[55%] text-foreground group-hover:text-primary transition-colors">
                    <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                    {store.storeName}
                  </span>
                  <span className="font-medium tabular-nums text-destructive">{formatCurrency(store.totalRevenue, curr)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                {i < 2 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Campaign: {formatCurrency(store.campaignRevenue, curr)} &middot; Flow: {formatCurrency(store.flowRevenue, curr)}
                  </p>
                )}
              </Link>
            )
          })
        )}
      </CardContent>
    </div>
  )
}
