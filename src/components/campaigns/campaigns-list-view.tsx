"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { format } from "date-fns"
import {
  Loader2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trophy,
  Store,
  Filter,
  TrendingUp,
  TrendingDown,
  Medal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { normalizeCampaignStatus } from "@/lib/utils/campaign-status"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Campaign } from "@/types"
import { formatCurrency } from "@/lib/utils/format"

interface StoreItem {
  id: string
  store_name: string
}

interface StorePerformance {
  store_id: string
  store_name: string
  totalCampaigns: number
  totalRevenue: number
  totalRecipients: number
  avgOpenRate: number
  avgClickRate: number
  bestCampaign: Campaign | null
}

type SortField = "name" | "scheduled_date" | "recipients" | "opened" | "clicked" | "revenue" | "store"
type SortDir = "asc" | "desc"

export function CampaignsListView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [filterStore, setFilterStore] = useState("all")
  const [filterChannel, setFilterChannel] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPeriod, setFilterPeriod] = useState("90d")
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()
  const customStartRef = useRef(customStart)
  const customEndRef = useRef(customEnd)
  customStartRef.current = customStart
  customEndRef.current = customEnd

  // Sort
  const [sortField, setSortField] = useState<SortField>("scheduled_date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const getDateRange = useCallback((period: string, cStart?: Date, cEnd?: Date) => {
    if (period === "custom" && cStart && cEnd) {
      return {
        start_date: format(cStart, "yyyy-MM-dd"),
        end_date: format(cEnd, "yyyy-MM-dd"),
      }
    }
    const end = new Date()
    const start = new Date()
    switch (period) {
      case "7d": start.setDate(start.getDate() - 7); break
      case "30d": start.setDate(start.getDate() - 30); break
      case "90d": start.setDate(start.getDate() - 90); break
      case "12m": start.setMonth(start.getMonth() - 12); break
      case "all": start.setFullYear(2020); break
    }
    return {
      start_date: start.toISOString().split("T")[0],
      end_date: end.toISOString().split("T")[0],
    }
  }, [])

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const { start_date, end_date } = getDateRange(filterPeriod, customStartRef.current, customEndRef.current)
      let url = `/api/campaigns?start_date=${start_date}&end_date=${end_date}`
      if (filterStore !== "all") url += `&store_id=${filterStore}`
      if (filterChannel !== "all") url += `&channel=${filterChannel}`
      if (filterStatus !== "all") url += `&status=${filterStatus}`

      const [campaignsRes, storesRes] = await Promise.all([
        fetch(url),
        fetch("/api/stores"),
      ])

      if (campaignsRes.ok) {
        const data = await campaignsRes.json()
        setCampaigns(data.campaigns || [])
      }
      if (storesRes.ok) {
        const data = await storesRes.json()
        setStores(data.stores || [])
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filterPeriod, filterStore, filterChannel, filterStatus, getDateRange])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  const sorted = useMemo(() => {
    const list = [...campaigns]
    list.sort((a, b) => {
      let valA: string | number = 0
      let valB: string | number = 0
      switch (sortField) {
        case "name": valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break
        case "scheduled_date": valA = a.scheduled_date || ""; valB = b.scheduled_date || ""; break
        case "recipients": valA = a.recipients || 0; valB = b.recipients || 0; break
        case "opened": valA = a.opened || 0; valB = b.opened || 0; break
        case "clicked": valA = a.clicked || 0; valB = b.clicked || 0; break
        case "revenue": valA = a.revenue || 0; valB = b.revenue || 0; break
        case "store": valA = a.store?.store_name || ""; valB = b.store?.store_name || ""; break
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return list
  }, [campaigns, sortField, sortDir])

  // Summary stats
  const summary = useMemo(() => {
    const total = campaigns.length
    const sent = campaigns.filter(c => c.status === "sent").length
    const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0)
    const totalRecipients = campaigns.reduce((sum, c) => sum + (c.recipients || 0), 0)
    const avgOpenRate = campaigns.length
      ? campaigns.reduce((sum, c) => {
          const recipients = c.recipients || 0
          const opened = c.opened || 0
          return sum + (recipients > 0 ? (opened / recipients) * 100 : 0)
        }, 0) / campaigns.length
      : 0
    return { total, sent, totalRevenue, totalRecipients, avgOpenRate }
  }, [campaigns])

  // Store performance ranking
  const storePerformance = useMemo(() => {
    const map = new Map<string, StorePerformance>()

    for (const c of campaigns) {
      const storeId = c.store_id || c.store?.id || "unknown"
      const storeName = c.store?.store_name || "Loja desconhecida"

      if (!map.has(storeId)) {
        map.set(storeId, {
          store_id: storeId,
          store_name: storeName,
          totalCampaigns: 0,
          totalRevenue: 0,
          totalRecipients: 0,
          avgOpenRate: 0,
          avgClickRate: 0,
          bestCampaign: null,
        })
      }

      const perf = map.get(storeId)!
      perf.totalCampaigns++
      perf.totalRevenue += c.revenue || 0
      perf.totalRecipients += c.recipients || 0

      if (!perf.bestCampaign || (c.revenue || 0) > (perf.bestCampaign.revenue || 0)) {
        perf.bestCampaign = c
      }
    }

    // Calculate avg rates
    for (const [storeId, perf] of map) {
      const storeCampaigns = campaigns.filter(c => (c.store_id || c.store?.id) === storeId)
      const withRecipients = storeCampaigns.filter(c => (c.recipients || 0) > 0)

      if (withRecipients.length > 0) {
        perf.avgOpenRate = withRecipients.reduce((sum, c) => {
          return sum + ((c.opened || 0) / (c.recipients || 1)) * 100
        }, 0) / withRecipients.length

        perf.avgClickRate = withRecipients.reduce((sum, c) => {
          return sum + ((c.clicked || 0) / (c.recipients || 1)) * 100
        }, 0) / withRecipients.length
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [campaigns])

  // Top and bottom performers
  const topStores = useMemo(() => storePerformance.slice(0, 3), [storePerformance])
  const bottomStores = useMemo(() => {
    if (storePerformance.length <= 3) return []
    return [...storePerformance].reverse().slice(0, 3)
  }, [storePerformance])

  // Find top performer by revenue
  const topRevenue = useMemo(() => {
    if (!campaigns.length) return null
    return campaigns.reduce((best, c) => (c.revenue || 0) > (best.revenue || 0) ? c : best, campaigns[0])
  }, [campaigns])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
        <Select value={filterStore} onValueChange={setFilterStore}>
          <SelectTrigger className="w-full sm:w-[180px] h-9">
            <SelectValue placeholder="Loja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lojas</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.store_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterChannel} onValueChange={setFilterChannel}>
          <SelectTrigger className="w-[calc(50%-4px)] sm:w-[140px] h-9">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos canais</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="push">Push</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[calc(50%-4px)] sm:w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="scheduled">Agendada</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPeriod} onValueChange={(v) => {
          setFilterPeriod(v)
          setCustomStart(undefined)
          setCustomEnd(undefined)
        }}>
          <SelectTrigger className="w-full sm:w-[120px] h-9">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="90d">90 dias</SelectItem>
            <SelectItem value="12m">12 meses</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <DateRangePicker
          startDate={customStart}
          endDate={customEnd}
          onApply={(start, end) => {
            setCustomStart(start)
            setCustomEnd(end)
            setFilterPeriod("custom")
          }}
        />

        <Button variant="secondary" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-[8px] border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Campanhas</p>
            <p className="text-xl font-bold mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[8px] border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Enviadas</p>
            <p className="text-xl font-bold mt-1">{summary.sent}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[8px] border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Receita</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(summary.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[8px] border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Destinatários</p>
            <p className="text-xl font-bold mt-1">{summary.totalRecipients.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[8px] border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Méd. Abertura</p>
            <p className="text-xl font-bold mt-1">{summary.avgOpenRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Store Performance: Top & Bottom */}
      {storePerformance.length > 1 && filterStore === "all" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top Performing Stores */}
          <Card className="rounded-[8px] border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Lojas com Melhor Desempenho
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {topStores.map((store, i) => (
                  <div key={store.store_id} className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      i === 0 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                      : i === 1 ? "bg-zinc-300/20 text-zinc-500"
                      : "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                    }`}>
                      {i === 0 ? <Medal className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{store.store_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {store.totalCampaigns} campanhas • {store.avgOpenRate.toFixed(1)}% abertura
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-success">
                      {formatCurrency(store.totalRevenue)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bottom Performing Stores */}
          {bottomStores.length > 0 && (
            <Card className="rounded-[8px] border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-warning" />
                  Lojas com Menor Desempenho
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {bottomStores.map((store) => (
                    <div key={store.store_id} className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        <Store className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{store.store_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {store.totalCampaigns} campanhas • {store.avgOpenRate.toFixed(1)}% abertura
                        </p>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatCurrency(store.totalRevenue)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Best Campaign per Store */}
      {storePerformance.length > 0 && filterStore === "all" && (
        <Card className="rounded-[8px] border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" />
              Melhor Campanha por Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 font-medium pr-4">Loja</th>
                    <th className="text-left pb-2 font-medium pr-4">Melhor Campanha</th>
                    <th className="text-right pb-2 font-medium pr-4">Abertura</th>
                    <th className="text-right pb-2 font-medium pr-4">Clique</th>
                    <th className="text-right pb-2 font-medium">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {storePerformance.filter(s => s.bestCampaign).map((store) => {
                    const c = store.bestCampaign!
                    const recipients = c.recipients || 0
                    const openRate = recipients > 0 ? ((c.opened || 0) / recipients) * 100 : 0
                    const clickRate = recipients > 0 ? ((c.clicked || 0) / recipients) * 100 : 0

                    return (
                      <tr key={store.store_id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[140px] truncate">
                          {store.store_name}
                        </td>
                        <td className="py-2 pr-4 font-medium max-w-[200px] truncate">
                          {c.name}
                        </td>
                        <td className="py-2 pr-4 text-right">{openRate.toFixed(1)}%</td>
                        <td className="py-2 pr-4 text-right">{clickRate.toFixed(1)}%</td>
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(c.revenue || 0, c.currency || "BRL")}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaigns Table */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Campanhas Recentes</h3>
        {sorted.length > 0 ? (
          <Card className="rounded-[8px] border">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left pb-2 font-medium pr-4">
                        <button onClick={() => toggleSort("name")} className="flex items-center hover:text-foreground">
                          Nome <SortIcon field="name" />
                        </button>
                      </th>
                      <th className="text-left pb-2 font-medium pr-4">
                        <button onClick={() => toggleSort("store")} className="flex items-center hover:text-foreground">
                          <Store className="h-3 w-3 mr-1" /> Loja <SortIcon field="store" />
                        </button>
                      </th>
                      <th className="text-left pb-2 font-medium pr-4">Status</th>
                      <th className="text-left pb-2 font-medium pr-4">Canal</th>
                      <th className="text-left pb-2 font-medium pr-4">
                        <button onClick={() => toggleSort("scheduled_date")} className="flex items-center hover:text-foreground">
                          Data <SortIcon field="scheduled_date" />
                        </button>
                      </th>
                      <th className="text-right pb-2 font-medium">
                        <button onClick={() => toggleSort("recipients")} className="flex items-center justify-end hover:text-foreground ml-auto">
                          Enviados <SortIcon field="recipients" />
                        </button>
                      </th>
                      <th className="text-right pb-2 font-medium">
                        <button onClick={() => toggleSort("opened")} className="flex items-center justify-end hover:text-foreground ml-auto">
                          Abertura <SortIcon field="opened" />
                        </button>
                      </th>
                      <th className="text-right pb-2 font-medium">
                        <button onClick={() => toggleSort("clicked")} className="flex items-center justify-end hover:text-foreground ml-auto">
                          Clique <SortIcon field="clicked" />
                        </button>
                      </th>
                      <th className="text-right pb-2 font-medium">
                        <button onClick={() => toggleSort("revenue")} className="flex items-center justify-end hover:text-foreground ml-auto">
                          Receita <SortIcon field="revenue" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => {
                      const recipients = c.recipients || 0
                      const openRate = recipients > 0 ? ((c.opened || 0) / recipients) * 100 : 0
                      const clickRate = recipients > 0 ? ((c.clicked || 0) / recipients) * 100 : 0
                      const isTop = topRevenue && c.id === topRevenue.id && (c.revenue || 0) > 0

                      return (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 pr-4 font-medium max-w-[200px] truncate">
                            <div className="flex items-center gap-1">
                              {isTop && <Trophy className="h-3.5 w-3.5 text-warning flex-shrink-0" />}
                              <span className="truncate">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[140px] truncate">
                            {c.store?.store_name || "-"}
                          </td>
                          <td className="py-2 pr-4">
                            <StatusBadge status={normalizeCampaignStatus(c.status)} className="text-xs" />
                          </td>
                          <td className="py-2 pr-4 text-xs capitalize">{c.channel}</td>
                          <td className="py-2 pr-4 text-xs">
                            {c.scheduled_date ? new Date(c.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                          </td>
                          <td className="py-2 text-right">{recipients.toLocaleString()}</td>
                          <td className="py-2 text-right">{openRate.toFixed(1)}%</td>
                          <td className="py-2 text-right">{clickRate.toFixed(1)}%</td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(c.revenue || 0, c.currency || "BRL")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma campanha encontrada para os filtros selecionados.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
