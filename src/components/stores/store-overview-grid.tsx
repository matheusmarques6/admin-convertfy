"use client"

import { useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import { LayoutGrid, Search } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PeriodPicker, type PeriodValue } from "@/components/ui/period-picker"
import { StoreOverviewCard, StoreOverviewCardSkeleton, type StoreOverviewData } from "./store-overview-card"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function StoreOverviewGrid() {
  const [period, setPeriod] = useState<PeriodValue>({ period: "30d" })
  const [search, setSearch] = useState("")

  const periodParam = period.period === "custom" ? "30d" : period.period
  const { data, isLoading } = useSWR(
    `/api/dashboard/stores-overview?period=${periodParam}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const stores: StoreOverviewData[] = data?.stores ?? data?.data?.stores ?? []

  const filtered = search.trim()
    ? stores.filter((s) => {
        const q = search.toLowerCase()
        return s.storeName.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q)
      })
    : stores

  const totalRevenue = filtered.reduce((s, st) => s + st.totalRevenueBRL, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Icon icon={LayoutGrid} size={20} className="text-[#4E62D8] dark:text-[#7B8CEA]" />
            <h2 className="text-[18px] font-semibold text-gray-900 dark:text-white tracking-tight">
              Overview de Lojas
            </h2>
          </div>
          <span className="text-[12px] font-mono tabular-nums font-medium text-gray-400 dark:text-white/40 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar loja..."
              className={cn(
                "h-9 w-[200px] rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-transparent pl-8 pr-3 text-[13px]",
                "text-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/40",
                "outline-none focus:border-[#4E62D8]/40 focus:ring-1 focus:ring-[#4E62D8]/20",
                "dark:border-[rgba(255,255,255,0.08)]"
              )}
            />
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* Summary bar */}
      {!isLoading && stores.length > 0 && (
        <div className="flex items-center gap-6 mb-5 px-1">
          <div>
            <span className="text-[11px] text-gray-400 dark:text-white/40 uppercase tracking-wider font-medium">Receita total agregada</span>
            <p className="text-[20px] font-bold font-mono tabular-nums text-gray-900 dark:text-white mt-0.5">
              {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <StoreOverviewCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Icon icon={LayoutGrid} customSize={32} className="text-gray-300 dark:text-white/20 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-white/50 mb-1">
            {search ? "Nenhuma loja encontrada" : "Nenhuma loja ativa"}
          </p>
          <p className="text-xs text-gray-400 dark:text-white/40">
            {search ? "Tente outro termo de busca." : "Cadastre lojas para ver o overview."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filtered.map((store) => (
            <StoreOverviewCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  )
}
