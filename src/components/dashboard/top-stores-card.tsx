"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Trophy, ArrowRight, TrendingUp } from "lucide-react"
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

  const getMedalColor = (index: number) => {
    if (index === 0) return "text-yellow-500 dark:text-yellow-400"
    if (index === 1) return "text-slate-400 dark:text-slate-300"
    if (index === 2) return "text-amber-600 dark:text-amber-500"
    return "text-muted-foreground"
  }

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-[#0f1419] dark:border-white/[0.08] h-full transition-all duration-200 hover:shadow-lg dark:hover:border-white/[0.12]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
              <Trophy className="h-4 w-4 text-emerald-500" />
            </div>
            <CardTitle className="text-sm font-semibold">Top Lojas</CardTitle>
          </div>
          {showViewAll && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-muted-foreground hover:text-primary"
              onClick={() => setModalOpen(true)}
            >
              Ver todas ({allStoresSorted.length})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && stores.length === 0 ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : dataStatus === "syncing" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center py-2">Sincronizando...</p>
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : stores.length === 0 ? (
          <div className="py-8 text-center">
            <div className="p-3 rounded-full bg-muted/50 dark:bg-white/[0.05] w-fit mx-auto mb-3">
              <Trophy className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhuma loja com receita no periodo</p>
          </div>
        ) : (
          stores.map((store, i) => {
            const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
            const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 8)
            const curr = store.currency || "BRL"
            return (
              <Link
                key={store.storeId}
                href={`/stores/${store.storeId}`}
                className="block group p-3 rounded-lg bg-muted/20 dark:bg-white/[0.03] hover:bg-muted/40 dark:hover:bg-white/[0.06] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={`text-lg font-bold w-6 text-center ${getMedalColor(i)}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium truncate max-w-[60%] text-foreground group-hover:text-primary transition-colors">
                        {store.storeName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold tabular-nums text-foreground">
                          {formatCurrency(store.totalRevenue, curr)}
                        </span>
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted dark:bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    {i < 2 && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          <span className="text-purple-400">Campanhas:</span> {formatCurrency(store.campaignRevenue, curr)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          <span className="text-blue-400">Flows:</span> {formatCurrency(store.flowRevenue, curr)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })
        )}

        {stores.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-primary group mt-2"
            asChild
          >
            <Link href="/stores" className="flex items-center justify-center gap-1.5">
              Ver todas as lojas
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
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
