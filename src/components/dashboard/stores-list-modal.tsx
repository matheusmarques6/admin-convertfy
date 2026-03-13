"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Trophy, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import type { RevenueStoreItem } from "./total-revenue-banner"

const ITEMS_PER_PAGE = 10

interface StoresListModalProps {
  stores: RevenueStoreItem[]
  variant: "top" | "bottom"
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StoresListModal({ stores, variant, open, onOpenChange }: StoresListModalProps) {
  const [page, setPage] = useState(1)

  // Reset to page 1 when stores change (e.g. period change)
  useEffect(() => {
    setPage(1)
  }, [stores])

  const totalPages = Math.max(1, Math.ceil(stores.length / ITEMS_PER_PAGE))
  const paginatedStores = useMemo(
    () => stores.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [stores, page]
  )

  const maxRevenue = stores[0]?.totalRevenueBRL ?? stores[0]?.totalRevenue ?? 1
  const isTop = variant === "top"

  const barGradient = isTop
    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
    : "bg-gradient-to-r from-red-500 to-orange-400"

  const revenueColor = isTop ? "text-foreground" : "text-destructive"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isTop ? (
              <Trophy className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            {isTop ? "Top Lojas \u2014 Todas" : "Atencao Necessaria \u2014 Todas"}
          </DialogTitle>
        </DialogHeader>

        {stores.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma loja encontrada
          </p>
        ) : (
          <>
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {paginatedStores.map((store, i) => {
                const globalIndex = (page - 1) * ITEMS_PER_PAGE + i
                const storeRevBRL = store.totalRevenueBRL ?? store.totalRevenue
                const widthPercent = Math.max((storeRevBRL / maxRevenue) * 100, 4)
                const curr = store.currency || "BRL"
                return (
                  <Link
                    key={store.storeId}
                    href={`/admin/stores/${store.storeId}`}
                    className="block group"
                    onClick={() => onOpenChange(false)}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate max-w-[55%] text-foreground group-hover:text-primary transition-colors">
                        <span className="text-muted-foreground mr-1.5">
                          {globalIndex + 1}.
                        </span>
                        {store.storeName}
                      </span>
                      <span className={`font-medium tabular-nums ${revenueColor}`}>
                        {formatCurrency(store.totalRevenue, curr)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barGradient} transition-all duration-500`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Campaign: {formatCurrency(store.campaignRevenue, curr)} &middot; Flow: {formatCurrency(store.flowRevenue, curr)}
                    </p>
                  </Link>
                )
              })}
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Pagina {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Proximo
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
