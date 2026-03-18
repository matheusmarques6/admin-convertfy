"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Trophy } from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { StoresListModal } from "./stores-list-modal"
import type { RevenueStoreItem } from "./total-revenue-banner"
import type { DataStatus } from "@/lib/shared/data-status"

interface TopStoresCardProps {
  stores?: RevenueStoreItem[]
  allStores?: RevenueStoreItem[]
  isLoading?: boolean
  dataStatus?: DataStatus
}

export function TopStoresCard({ stores: storesProp, allStores, isLoading, dataStatus }: TopStoresCardProps) {
  const stores = storesProp || []
  const [modalOpen, setModalOpen] = useState(false)

  const allStoresSorted = useMemo(() => {
    if (!allStores || allStores.length === 0) return []
    return [...allStores]
      .filter(s => (s.totalRevenueBRL ?? s.totalRevenue) > 0)
      .sort((a, b) => (b.totalRevenueBRL ?? b.totalRevenue) - (a.totalRevenueBRL ?? a.totalRevenue))
  }, [allStores])

  const showViewAll = allStoresSorted.length > 5
  const maxRevenue = stores[0]?.totalRevenueBRL ?? stores[0]?.totalRevenue ?? 1

  return (
    <div className="rounded-[24px] border border-border/60 bg-card h-full flex flex-col overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <CardHeader className="pb-4 sm:pb-6 relative z-10 px-6 sm:px-8 pt-6 sm:pt-8 bg-background/50 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-2.5 border border-success/20 group-hover:bg-success group-hover:text-success-foreground text-success transition-colors">
              <Trophy className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg font-bold tracking-tight">Top Lojas</CardTitle>
          </div>
          {showViewAll && (
            <Button variant="outline" size="sm" className="hidden sm:flex text-xs rounded-xl border-border hover:bg-success/10 hover:text-success hover:border-success/30 transition-all font-medium" onClick={() => setModalOpen(true)}>
              Ver todas ({allStoresSorted.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-6 sm:px-8 py-6 sm:py-8 relative z-10 flex-1 flex flex-col">
        {isLoading && stores.length === 0 ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-[16px]" />)}
          </div>
        ) : dataStatus === "syncing" ? (
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest text-center py-2">Sincronizando dados...</p>
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-[16px]" />)}
          </div>
        ) : stores.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 opacity-50">
            <Trophy className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma loja com receita no período</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stores.map((store, i) => {
              const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
              const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 4)
              const curr = store.currency || "BRL"
              return (
                <Link key={store.storeId} href={`/stores/${store.storeId}`} className="block group/item bg-background border border-border/40 hover:border-success/40 rounded-[16px] p-3 sm:p-4 transition-all hover:shadow-lg hover:shadow-success/5 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between text-sm sm:text-base mb-2">
                    <span className="truncate pr-4 font-semibold text-foreground group-hover/item:text-success transition-colors">
                      <span className="text-muted-foreground/60 mr-2 text-xs font-mono">{i + 1}.</span>
                      {store.storeName}
                    </span>
                    <span className="font-black tabular-nums tracking-tight text-foreground">{formatCurrency(store.totalRevenue, curr)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-success/80 to-green-400 transition-all duration-1000 ease-out"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                  {i < 2 && (
                    <div className="flex items-center gap-3 mt-3 text-[10px] sm:text-xs font-medium text-muted-foreground pt-3 border-t border-border/40">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success/80" /> {formatCurrency(store.campaignRevenue, curr)}</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary/60" /> {formatCurrency(store.flowRevenue, curr)}</span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
        
        {showViewAll && (
          <Button variant="ghost" size="sm" className="w-full sm:hidden text-xs rounded-xl mt-4" onClick={() => setModalOpen(true)}>
            Ver todas ({allStoresSorted.length})
          </Button>
        )}
      </CardContent>

      <StoresListModal
        stores={allStoresSorted}
        variant="top"
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  )
}
