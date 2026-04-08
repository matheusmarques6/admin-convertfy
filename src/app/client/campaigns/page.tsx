"use client"

import { useState, useMemo, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  RefreshCw,
  Megaphone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatusTabs } from "@/components/ui/status-tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-container"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePortalCampaignsCalendar } from "@/lib/hooks/use-portal-campaigns-calendar"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"
import { transformCampaignData } from "@/lib/utils/campaign-transform"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

// ─── Constants ──────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  email: "#4E62D8",
  sms: "#065F46",
  push: "#7C3AED",
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  push: "Push",
}

const STATUS_TAB_ITEMS = [
  { value: "all", label: "Todas" },
  { value: "sent", label: "Enviadas" },
  { value: "scheduled", label: "Agendadas" },
  { value: "draft", label: "Rascunho" },
]

const PERIOD_OPTIONS = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "6m", label: "6 meses" },
  { value: "1y", label: "1 ano" },
]

const PAGE_SIZE = 15

// ─── ChannelDot (inline with name) ──────────────────────

function ChannelDot({ channel }: { channel: string }) {
  const color = CHANNEL_COLORS[channel] || "#6B7280"
  return (
    <span
      className="inline-block w-[6px] h-[6px] rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

// ─── ChannelBadge (for mobile cards) ────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const color = CHANNEL_COLORS[channel] || "#6B7280"
  const label = CHANNEL_LABELS[channel] || channel
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-[#9CA3AF]">
      <span
        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

// ─── Metric Cell Helper ─────────────────────────────────

function MetricCell({
  value,
  formatter = "number",
  currency,
  className,
}: {
  value: number | undefined | null
  formatter?: "number" | "percent" | "currency"
  currency?: string
  className?: string
}) {
  if (value == null) return <span className="text-gray-300 dark:text-[#374151]">—</span>
  let formatted: string
  switch (formatter) {
    case "percent":
      formatted = formatPercent(value)
      break
    case "currency":
      formatted = formatCurrency(value, currency || "BRL")
      break
    default:
      formatted = formatNumber(value)
  }
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatted}
    </span>
  )
}

// ─── Expanded Row (6 metrics: Enviados, Entregues, Aberturas, Cliques, Pedidos, Unsubs) ───

function CampaignExpandedRow({ campaign }: { campaign: PortalCampaign }) {
  const metrics = [
    { label: "Enviados", value: campaign.recipients, fmt: "number" as const },
    { label: "Entregues", value: campaign.delivered, fmt: "number" as const },
    { label: "Aberturas", value: campaign.opened, fmt: "number" as const },
    { label: "Cliques", value: campaign.clicked, fmt: "number" as const },
    { label: "Pedidos", value: campaign.converted, fmt: "number" as const },
    { label: "Unsubs", value: undefined as number | undefined, fmt: "number" as const },
  ]

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-[#F9FAFB] dark:bg-[#111827] border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)] px-6 py-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">
                  {m.label}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                  <MetricCell value={m.value} formatter={m.fmt} currency={campaign.currency} />
                </p>
              </div>
            ))}
          </div>
          {campaign.subjectLine && (
            <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Assunto</p>
              <p className="text-sm text-gray-700 dark:text-[#9CA3AF]">{campaign.subjectLine}</p>
            </div>
          )}
          {campaign.storeNames && campaign.storeNames.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mb-0.5">Lojas</p>
              <p className="text-sm text-gray-700 dark:text-[#9CA3AF]">
                {campaign.storeNames.join(", ")}
              </p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Mobile Campaign Card ───────────────────────────────

function CampaignCard({
  campaign,
  isExpanded,
  onToggle,
}: {
  campaign: PortalCampaign
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 dark:text-[#5C6378] mt-0.5 transition-transform duration-200 flex-shrink-0",
            !isExpanded && "-rotate-90",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ChannelBadge channel={campaign.channel} />
            <StatusBadge status={campaign.status} className="text-[11px]" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {campaign.name}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-0.5">
            {formatScheduledDate(campaign.scheduledDate, campaign.scheduledTime)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
            <MetricCell value={campaign.revenue} formatter="currency" currency={campaign.currency} />
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] font-mono tabular-nums">
            <MetricCell value={campaign.openRate} formatter="percent" />
          </p>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-[rgba(0,0,0,0.04)] dark:border-[rgba(255,255,255,0.04)]">
          <div className="grid grid-cols-2 gap-3 pt-3">
            {[
              { label: "Enviados", value: campaign.recipients, fmt: "number" as const },
              { label: "Entregues", value: campaign.delivered, fmt: "number" as const },
              { label: "Aberturas", value: campaign.opened, fmt: "number" as const },
              { label: "Cliques", value: campaign.clicked, fmt: "number" as const },
              { label: "Pedidos", value: campaign.converted, fmt: "number" as const },
              { label: "Receita", value: campaign.revenue, fmt: "currency" as const },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">{m.label}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] font-mono tabular-nums">
                  <MetricCell value={m.value} formatter={m.fmt} currency={campaign.currency} />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Date Format Helper ─────────────────────────────────

function formatScheduledDate(date: string, time?: string): string {
  try {
    const d = new Date(date + "T00:00:00")
    const formatted = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    if (time) return `${formatted} · ${time}`
    return formatted
  } catch {
    return date
  }
}

// ─── Main Page ──────────────────────────────────────────

export default function PortalCampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CampaignsContent />
    </Suspense>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full rounded-[10px]" />
    </div>
  )
}

// ─── Content ────────────────────────────────────────────

function CampaignsContent() {
  const searchParams = useSearchParams()

  // Read initial filters from URL
  const urlStatus = searchParams.get("status") || "all"
  const urlChannel = searchParams.get("channel") || "all"

  const [statusFilter, setStatusFilter] = useState(urlStatus)
  const [channelFilter, setChannelFilter] = useState(urlChannel)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState("30d")

  // Fetch campaigns for current month
  const {
    campaigns: rawApiCampaigns,
    isLoading: loading,
    error: hookError,
    mutate: mutateCampaigns,
  } = usePortalCampaignsCalendar()

  const error = hookError?.message ?? null

  // Transform API data
  const allCampaigns = useMemo(
    () => rawApiCampaigns.map((c) => transformCampaignData(c)),
    [rawApiCampaigns],
  )

  // Apply filters
  const filteredCampaigns = useMemo(() => {
    let result = allCampaigns

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter)
    }

    if (channelFilter !== "all") {
      result = result.filter((c) => c.channel === channelFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.subjectLine?.toLowerCase().includes(q) ||
          c.segmentName?.toLowerCase().includes(q),
      )
    }

    return result
  }, [allCampaigns, statusFilter, channelFilter, searchQuery])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE))
  const paginatedCampaigns = useMemo(
    () => filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCampaigns, page],
  )

  const pageStart = (page - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(page * PAGE_SIZE, filteredCampaigns.length)

  // Reset page when filters change
  const updateStatusFilter = useCallback((val: string) => {
    setStatusFilter(val)
    setPage(1)
    setExpandedId(null)
  }, [])

  const updateChannelFilter = useCallback((val: string) => {
    setChannelFilter(val)
    setPage(1)
    setExpandedId(null)
  }, [])

  const updateSearch = useCallback((val: string) => {
    setSearchQuery(val)
    setPage(1)
  }, [])

  // Toggle expanded row (only one at a time)
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const fetchCampaigns = useCallback(() => mutateCampaigns(), [mutateCampaigns])

  // Count per status tab
  const statusTabItems = useMemo(() => {
    const counts: Record<string, number> = { all: allCampaigns.length }
    for (const c of allCampaigns) {
      counts[c.status] = (counts[c.status] || 0) + 1
    }
    return STATUS_TAB_ITEMS.map((tab) => ({
      ...tab,
      count: counts[tab.value] ?? 0,
    }))
  }, [allCampaigns])

  // ─── Error State ────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader count={0} period={period} onPeriodChange={setPeriod} />
        <div className="flex flex-col items-center justify-center py-16">
          <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] p-8 text-center max-w-md">
            <AlertCircle className="h-7 w-7 text-[#EF4444] mx-auto mb-4" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3] mb-1">
              Erro ao carregar campanhas
            </h2>
            <p className="text-sm text-gray-400 dark:text-[#5C6378] mb-4">{error}</p>
            <Button onClick={fetchCampaigns} size="sm" className="rounded-[6px]">
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main Render ────────────────────────────────────

  return (
    <AnimatedContainer className="space-y-5">
      {/* Header with period selector */}
      <AnimatedItem>
        <PageHeader
          count={allCampaigns.length}
          loading={loading}
          onRefresh={fetchCampaigns}
          period={period}
          onPeriodChange={setPeriod}
        />
      </AnimatedItem>

      {/* StatusTabs (DS v3.0 segmented variant) */}
      <AnimatedItem>
        <StatusTabs
          value={statusFilter}
          onValueChange={updateStatusFilter}
          items={statusTabItems}
        />
      </AnimatedItem>

      {/* Table Card */}
      <AnimatedItem>
        <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1F2937] overflow-hidden">
          {/* Search + Channel Filter Header */}
          <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
              <Input
                placeholder="Buscar campanha..."
                value={searchQuery}
                onChange={(e) => updateSearch(e.target.value)}
                className="pl-9 h-9 rounded-[6px] border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827] text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-[#5C6378]">Canal:</span>
              <div className="flex rounded-[6px] border border-[#e5e7eb] dark:border-[#374151] overflow-hidden">
                {[
                  { value: "all", label: "Todos" },
                  { value: "email", label: "Email" },
                  { value: "sms", label: "SMS" },
                  { value: "push", label: "Push" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateChannelFilter(opt.value)}
                    className={cn(
                      "px-3 h-8 text-xs font-medium transition-colors duration-150",
                      channelFilter === opt.value
                        ? "bg-[#4E8FFF] text-white"
                        : "bg-white dark:bg-[#111827] text-gray-500 dark:text-[#5C6378] hover:bg-[#f3f4f6] dark:hover:bg-[#374151]",
                    )}
                  >
                    {opt.value !== "all" && (
                      <span
                        className="inline-block w-[6px] h-[6px] rounded-full mr-1.5"
                        style={{ backgroundColor: CHANNEL_COLORS[opt.value] }}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && allCampaigns.length === 0 ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-[6px]" />
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            /* Empty State */
            <div className="py-12">
              <EmptyState
                icon={Megaphone}
                title="Nenhuma campanha encontrada"
                description={
                  searchQuery
                    ? "Tente ajustar os filtros ou o termo de busca"
                    : "As campanhas aparecerão aqui quando forem criadas pela equipe Convertfy"
                }
                compact
              />
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F9FAFB] dark:bg-[#111827]/50 border-b border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                      <th className="text-left text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5 w-8" />
                      <th className="text-left text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Campanha
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Data
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Enviados
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Open Rate
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Click Rate
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Receita
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-400 dark:text-[#5C6378] uppercase tracking-wider px-4 py-2.5">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCampaigns.map((campaign) => {
                      const isExpanded = expandedId === campaign.id
                      return (
                        <TableRowGroup
                          key={campaign.id}
                          campaign={campaign}
                          isExpanded={isExpanded}
                          onToggle={() => toggleExpanded(campaign.id)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Stack */}
              <div className="md:hidden space-y-2 p-3">
                {paginatedCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    isExpanded={expandedId === campaign.id}
                    onToggle={() => toggleExpanded(campaign.id)}
                  />
                ))}
              </div>

              {/* Pagination Footer — "X de Y campanhas" + Anterior/Próximo */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                  <p className="text-xs text-gray-400 dark:text-[#5C6378]">
                    <span className="font-mono tabular-nums">{pageStart}–{pageEnd}</span>
                    {" "}de{" "}
                    <span className="font-mono tabular-nums">{filteredCampaigns.length}</span>
                    {" "}campanha{filteredCampaigns.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-xs text-gray-500 dark:text-[#9CA3AF] hover:bg-[#f3f4f6] dark:hover:bg-[#374151] disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Anterior
                    </button>
                    <span className="text-xs text-gray-400 dark:text-[#5C6378] px-2 font-mono tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-xs text-gray-500 dark:text-[#9CA3AF] hover:bg-[#f3f4f6] dark:hover:bg-[#374151] disabled:opacity-30 transition-colors"
                    >
                      Próximo
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AnimatedItem>
    </AnimatedContainer>
  )
}

// ─── Table Row Group (row + expanded sub-row) ───────────

function TableRowGroup({
  campaign,
  isExpanded,
  onToggle,
}: {
  campaign: PortalCampaign
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "group cursor-pointer transition-colors duration-150",
          isExpanded
            ? "bg-[#F9FAFB] dark:bg-[#111827]"
            : "hover:bg-[#F9FAFB] dark:hover:bg-[#111827]/50",
        )}
      >
        {/* Chevron */}
        <td className="px-4 py-3 w-8">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-gray-400 dark:text-[#5C6378] transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          />
        </td>

        {/* Campanha (name + channel dot inline) */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 max-w-[280px]">
            <ChannelDot channel={campaign.channel} />
            <p className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
              {campaign.name}
            </p>
          </div>
        </td>

        {/* Data (dd/mm, right-aligned mono) */}
        <td className="px-4 py-3">
          <span className="text-xs text-gray-500 dark:text-[#9CA3AF] font-mono tabular-nums whitespace-nowrap">
            {formatScheduledDate(campaign.scheduledDate, campaign.scheduledTime)}
          </span>
        </td>

        {/* Enviados (right-aligned) */}
        <td className="px-4 py-3 text-right">
          <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
            <MetricCell value={campaign.recipients} />
          </span>
        </td>

        {/* Open Rate (right-aligned) */}
        <td className="px-4 py-3 text-right">
          <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
            <MetricCell value={campaign.openRate} formatter="percent" />
          </span>
        </td>

        {/* Click Rate (right-aligned) */}
        <td className="px-4 py-3 text-right">
          <span className="text-[13px] text-gray-700 dark:text-[#EAEDF3]">
            <MetricCell value={campaign.clickRate} formatter="percent" />
          </span>
        </td>

        {/* Receita (right-aligned, green if > 0) */}
        <td className="px-4 py-3 text-right">
          <span className={cn(
            "text-[13px] font-medium",
            campaign.revenue && campaign.revenue > 0
              ? "text-[#10B981]"
              : "text-gray-900 dark:text-[#EAEDF3]",
          )}>
            <MetricCell value={campaign.revenue} formatter="currency" currency={campaign.currency} />
          </span>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <StatusBadge status={campaign.status} />
        </td>
      </tr>

      {/* Expanded Sub-Row */}
      {isExpanded && <CampaignExpandedRow campaign={campaign} />}
    </>
  )
}

// ─── Page Header ────────────────────────────────────────

function PageHeader({
  count,
  loading,
  onRefresh,
  period,
  onPeriodChange,
}: {
  count: number
  loading?: boolean
  onRefresh?: () => void
  period: string
  onPeriodChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Campanhas
        </h1>
        {count > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-2 rounded-full bg-[#4E8FFF]/10 text-[#4E8FFF] text-xs font-medium font-mono tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={period} onValueChange={onPeriodChange}>
          <SelectTrigger className="h-8 w-[110px] rounded-[6px] text-xs border-[#e5e7eb] dark:border-[#374151] bg-white dark:bg-[#111827]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-[8px]">
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 text-gray-400 dark:text-[#5C6378] hover:text-gray-600 dark:hover:text-[#9CA3AF]"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
            Atualizar
          </Button>
        )}
      </div>
    </div>
  )
}
