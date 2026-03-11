"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { TrendingDown } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { StoresListModal } from "./stores-list-modal"
import type { RevenueStoreItem } from "./total-revenue-banner"
import type { DataStatus } from "@/lib/shared/data-status"

interface WorstPerformersCardProps {
  stores?: RevenueStoreItem[]
  allStores?: RevenueStoreItem[]
  isLoading?: boolean
  dataStatus?: DataStatus
}

export function WorstPerformersCard({ stores: storesProp, allStores, isLoading, dataStatus }: WorstPerformersCardProps) {
  const stores = storesProp || []
  const [modalOpen, setModalOpen] = useState(false)

  const allStoresSorted = useMemo(() => {
    if (!allStores || allStores.length === 0) return []
    return [...allStores]
      .filter(s => (s.totalRevenueBRL ?? s.totalRevenue) > 0)
      .sort((a, b) => (a.totalRevenueBRL ?? a.totalRevenue) - (b.totalRevenueBRL ?? b.totalRevenue))
  }, [allStores])

  const showViewAll = allStoresSorted.length > 5
  const maxRevenue = stores[0]?.totalRevenueBRL ?? stores[0]?.totalRevenue ?? 1

  return (
    <div className="rounded-xl border border-border bg-card h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <CardTitle className="text-sm font-semibold">Atencao Necessaria</CardTitle>
          </div>
          {showViewAll && (
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setModalOpen(true)}>
              Ver todas ({allStoresSorted.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 flex-1">
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
          <p className="text-xs text-muted-foreground text-center py-4">Todas as lojas com boa performance</p>
        ) : (
          stores.map((store, i) => {
            const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
            const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 4)
            const curr = store.currency || "BRL"
            return (
              <Link key={store.storeId} href={`/admin/stores/${store.storeId}`} className="block group">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="truncate max-w-[55%] text-foreground group-hover:text-primary transition-colors">
                    <span className="text-muted-foreground mr-1.5 font-medium">{i + 1}.</span>
                    {store.storeName}
                  </span>
                  <span className="font-semibold tabular-nums text-destructive">{formatCurrency(store.totalRevenue, curr)}</span>
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

      <StoresListModal
        stores={allStoresSorted}
        variant="bottom"
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
