"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { format } from "date-fns"
import {
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { StatusTabs } from "@/components/ui/status-tabs"
import { StatusBadge } from "@/components/ui/status-badge"
import { FilterSelect } from "@/components/ui/filter-select"
import { ChannelBadge, ChannelDot } from "@/components/ui/channel-badge"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils"
import type { Campaign } from "@/types"

// ── Types ────────────────────────────────────────────────────────────────────

interface StoreItem {
  id: string
  store_name: string
}

interface CampaignPerformanceProps {
  onCampaignClick: (campaign: Campaign) => void
}

/** Flat row type for DataTable */
interface CampaignRow {
  id: string
  name: string
  storeName: string
  channel: string
  sentAt: string
  sentAtLabel: string
  openRate: string
  openRateNum: number
  clickRate: string
  clickRateNum: number
  revenue: number
  revenueLabel: string
  status: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCompact(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toFixed(0)
}

// ── Component ────────────────────────────────────────────────────────────────

export function CampaignPerformance({ onCampaignClick }: CampaignPerformanceProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStore, setFilterStore] = useState("all")
  const [filterChannel, setFilterChannel] = useState("all")
  const [filterPeriod, setFilterPeriod] = useState("90d")

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
  }, [filterPeriod, filterStore, filterChannel, getDateRange])

  useEffect(() => { fetchData() }, [fetchData])

  // Status counts
  const counts = useMemo(() => ({
    all: campaigns.length,
    sent: campaigns.filter(c => c.status === "sent").length,
    scheduled: campaigns.filter(c => c.status === "scheduled" || c.status === "approved" || c.status === "pending_review").length,
    draft: campaigns.filter(c => c.status === "draft").length,
  }), [campaigns])

  // Filter campaigns
  const filtered = useMemo(() => {
    let result = [...campaigns]
    if (statusFilter === "sent") result = result.filter(c => c.status === "sent")
    else if (statusFilter === "scheduled") result = result.filter(c => c.status === "scheduled" || c.status === "approved" || c.status === "pending_review")
    else if (statusFilter === "draft") result = result.filter(c => c.status === "draft")
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.store?.store_name?.toLowerCase().includes(q)
      )
    }
    // Sort by date desc
    result.sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""))
    return result
  }, [campaigns, statusFilter, searchQuery])

  // Map to flat rows for DataTable
  const campaignMap = useMemo(() => {
    const map = new Map<string, Campaign>()
    filtered.forEach(c => map.set(c.id, c))
    return map
  }, [filtered])

  const rows: CampaignRow[] = useMemo(() => {
    return filtered.map(c => {
      const recipients = c.recipients || 0
      const openRate = recipients > 0 ? ((c.opened || 0) / recipients) * 100 : -1
      const clickRate = recipients > 0 ? ((c.clicked || 0) / recipients) * 100 : -1
      const sentDate = c.send_datetime || c.scheduled_date || ""

      return {
        id: c.id,
        name: c.name,
        storeName: c.store?.store_name || "—",
        channel: c.channel,
        sentAt: sentDate,
        sentAtLabel: sentDate
          ? new Date(sentDate.includes("T") ? sentDate : sentDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
          : "—",
        openRate: openRate >= 0 ? `${openRate.toFixed(1)}%` : "—",
        openRateNum: openRate,
        clickRate: clickRate >= 0 ? `${clickRate.toFixed(1)}%` : "—",
        clickRateNum: clickRate,
        revenue: c.revenue || 0,
        revenueLabel: c.revenue && c.revenue > 0 ? `R$ ${formatCompact(c.revenue)}` : "—",
        status: c.status,
      }
    })
  }, [filtered])

  // Store filter options
  const storeOptions = useMemo(() => [
    { value: "all", label: "Todas as lojas" },
    ...stores.map(s => ({ value: s.id, label: s.store_name })),
  ], [stores])

  const channelOptions = useMemo(() => [
    { value: "all", label: "Todos canais" },
    { value: "email", label: "Email" },
    { value: "sms", label: "SMS" },
    { value: "push", label: "Push" },
    { value: "whatsapp", label: "WhatsApp" },
  ], [])

  const periodOptions = useMemo(() => [
    { value: "7d", label: "7 dias" },
    { value: "30d", label: "30 dias" },
    { value: "90d", label: "90 dias" },
    { value: "12m", label: "12 meses" },
    { value: "all", label: "Tudo" },
  ], [])

  // DataTable columns
  const columns: ColumnDef<CampaignRow>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <ChannelDot channel={row.channel} size={8} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
              {row.name}
            </p>
            <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
              {row.storeName}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "channel",
      header: "Canal",
      type: "badge",
      mobilePriority: "detail",
      cell: (row) => <ChannelBadge channel={row.channel} />,
    },
    {
      accessorKey: "sentAtLabel",
      header: "Enviada",
      type: "text",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className="text-sm font-mono tabular-nums text-gray-600 dark:text-[#8B92A5]">
          {row.sentAtLabel}
        </span>
      ),
    },
    {
      accessorKey: "openRate",
      header: "Open %",
      type: "text",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className={cn(
          "text-sm font-mono tabular-nums text-right block",
          row.openRateNum >= 0 ? "text-gray-900 dark:text-[#EAEDF3]" : "text-gray-300 dark:text-[#5C6378]",
        )}>
          {row.openRate}
        </span>
      ),
    },
    {
      accessorKey: "clickRate",
      header: "Click %",
      type: "text",
      mobilePriority: "hidden",
      hideOnTablet: true,
      sortable: true,
      cell: (row) => (
        <span className={cn(
          "text-sm font-mono tabular-nums text-right block",
          row.clickRateNum >= 0 ? "text-gray-900 dark:text-[#EAEDF3]" : "text-gray-300 dark:text-[#5C6378]",
        )}>
          {row.clickRate}
        </span>
      ),
    },
    {
      accessorKey: "revenueLabel",
      header: "Receita",
      type: "text",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className={cn(
          "text-sm font-mono tabular-nums text-right block",
          row.revenue > 0
            ? "font-medium text-[#065F46] dark:text-[#6EE7B7]"
            : "text-gray-300 dark:text-[#5C6378]",
        )}>
          {row.revenueLabel}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-[#5C6378]" />
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Status filter — DS v3.0 Rule 18 */}
      <StatusTabs
        value={statusFilter}
        onValueChange={setStatusFilter}
        items={[
          { value: "all", label: "Todas", count: counts.all },
          { value: "sent", label: "Enviadas", count: counts.sent },
          { value: "scheduled", label: "Agendadas", count: counts.scheduled },
          { value: "draft", label: "Rascunho", count: counts.draft },
        ]}
      />

      {/* Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
          <Input
            placeholder="Buscar campanha..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <FilterSelect value={filterPeriod} onValueChange={setFilterPeriod} options={periodOptions} placeholder="Período" />
          <FilterSelect value={filterStore} onValueChange={setFilterStore} options={storeOptions} placeholder="Loja" />
          <FilterSelect value={filterChannel} onValueChange={setFilterChannel} options={channelOptions} placeholder="Canal" />
          <Button variant="ghost" size="icon" onClick={() => fetchData(true)} disabled={refreshing} className="h-9 w-9">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* DataTable — DS v3.0 Rule 5 */}
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Nenhuma campanha encontrada"
        rowKey="id"
        onRowClick={(row) => {
          const campaign = campaignMap.get(row.id)
          if (campaign) onCampaignClick(campaign)
        }}
      />
    </div>
  )
}
