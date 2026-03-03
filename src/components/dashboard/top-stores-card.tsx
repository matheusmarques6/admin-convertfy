"use client"

import Link from "next/link"
import { Trophy } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import type { RevenueStoreItem } from "./total-revenue-banner"
import type { DataStatus } from "@/lib/shared/data-status"

interface TopStoresCardProps {
  stores?: RevenueStoreItem[]
  isLoading?: boolean
  dataStatus?: DataStatus
}

export function TopStoresCard({ stores: storesProp, isLoading, dataStatus }: TopStoresCardProps) {
  const stores = storesProp || []
  const maxRevenue = stores[0]?.totalRevenueBRL ?? stores[0]?.totalRevenue ?? 1

  return (
    <div className="rounded-xl border border-border bg-card h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-success" />
            <CardTitle className="text-sm font-semibold">Top Lojas</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && stores.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : dataStatus === "syncing" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center py-2">Sincronizando...</p>
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : stores.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma loja com receita no período</p>
        ) : (
          stores.map((store, i) => {
            const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
            const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 4)
            const curr = store.currency || "BRL"
            return (
              <Link key={store.storeId} href={`/stores/${store.storeId}`} className="block group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="truncate max-w-[55%] text-foreground group-hover:text-primary transition-colors">
                    <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                    {store.storeName}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">{formatCurrency(store.totalRevenue, curr)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
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
