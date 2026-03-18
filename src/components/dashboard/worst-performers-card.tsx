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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col relative group">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <TrendingDown className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Atenção Necessária</h2>
        </div>
        {showViewAll && (
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            Ver todas ({allStoresSorted.length})
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {isLoading && stores.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : dataStatus === "syncing" ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center py-2">Sincronizando dados...</p>
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : stores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
            <TrendingDown className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Todas as lojas com boa performance</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stores.map((store, i) => {
              const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
              const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 2)
              const curr = store.currency || "BRL"
              return (
                <div key={store.storeId} className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <Link href={`/stores/${store.storeId}`} className="flex items-center gap-2 truncate pr-4 group/link">
                      <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>
                      <span className="text-sm font-medium text-foreground group-hover/link:underline truncate">{store.storeName}</span>
                    </Link>
                    <span className="text-sm font-bold text-destructive shrink-0">{formatCurrency(store.totalRevenue, curr)}</span>
                  </div>
                  
                  <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden flex">
                    <div 
                      className="h-full bg-destructive rounded-full" 
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>

                  {i < 2 && (
                    <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground pt-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        <span>Campanhas: {formatCurrency(store.campaignRevenue, curr)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <span>Flows: {formatCurrency(store.flowRevenue, curr)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <StoresListModal
        stores={allStoresSorted}
        variant="bottom"
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
