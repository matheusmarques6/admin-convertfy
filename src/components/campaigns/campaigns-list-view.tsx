"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Loader2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trophy,
  Store,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Campaign } from "@/types"

interface StoreItem {
  id: string
  store_name: string
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

  // Sort
  const [sortField, setSortField] = useState<SortField>("scheduled_date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const getDateRange = useCallback((period: string) => {
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
      const { start_date, end_date } = getDateRange(filterPeriod)
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

  // Find top performer by revenue
  const topRevenue = useMemo(() => {
    if (!campaigns.length) return null
    return campaigns.reduce((best, c) => (c.revenue || 0) > (best.revenue || 0) ? c : best, campaigns[0])
  }, [campaigns])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterStore} onValueChange={setFilterStore}>
          <SelectTrigger className="w-[180px] h-9">
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
          <SelectTrigger className="w-[140px] h-9">
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
          <SelectTrigger className="w-[140px] h-9">
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

        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="w-[120px] h-9">
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

        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <GlowCard color="primary" intensity="moderate">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Campanhas</p>
            <p className="text-xl font-bold mt-1">{summary.total}</p>
          </CardContent>
        </GlowCard>
        <GlowCard color="primary" intensity="moderate">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Enviadas</p>
            <p className="text-xl font-bold mt-1">{summary.sent}</p>
          </CardContent>
        </GlowCard>
        <GlowCard color="primary" intensity="moderate">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Receita</p>
            <p className="text-xl font-bold mt-1">R$ {summary.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </GlowCard>
        <GlowCard color="primary" intensity="moderate">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Destinatários</p>
            <p className="text-xl font-bold mt-1">{summary.totalRecipients.toLocaleString()}</p>
          </CardContent>
        </GlowCard>
        <GlowCard color="primary" intensity="moderate">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Méd. Abertura</p>
            <p className="text-xl font-bold mt-1">{summary.avgOpenRate.toFixed(1)}%</p>
          </CardContent>
        </GlowCard>
      </div>

      {/* Table */}
      {sorted.length > 0 ? (
        <GlowCard color="primary" intensity="subtle">
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
                            {c.is_quick && <span className="text-warning text-xs" title="Campanha Rápida">⚡</span>}
                            <span className="truncate">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[140px] truncate">
                          {c.store?.store_name || "-"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={c.status === "sent" ? "success" : c.status === "draft" ? "secondary" : "outline"} className="text-xs">
                            {c.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-xs capitalize">{c.channel}</td>
                        <td className="py-2 pr-4 text-xs">
                          {c.scheduled_date ? new Date(c.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                        </td>
                        <td className="py-2 text-right">{recipients.toLocaleString()}</td>
                        <td className="py-2 text-right">{openRate.toFixed(1)}%</td>
                        <td className="py-2 text-right">{clickRate.toFixed(1)}%</td>
                        <td className="py-2 text-right font-medium">
                          R$ {(c.revenue || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </GlowCard>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma campanha encontrada para os filtros selecionados.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
