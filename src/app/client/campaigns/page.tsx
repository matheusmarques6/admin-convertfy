"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePortalCampaignsCalendar } from "@/lib/hooks/use-portal-campaigns-calendar"
import type { PortalCampaign } from "@/lib/hooks/use-portal-campaigns-calendar"
import { STATUS_CONFIG } from "@/lib/constants/calendar"
import { isSameDay, formatDateKey } from "@/lib/utils/date"
import { transformCampaignData } from "@/lib/utils/campaign-transform"

import { CalendarNavigation } from "@/components/calendar/calendar-navigation"
import { CalendarGrid } from "@/components/calendar/calendar-grid"
import { CalendarDayCell } from "@/components/calendar/calendar-day-cell"
import { CampaignStatsBar } from "@/components/campaigns/campaign-stats-bar"
import type { CampaignStats } from "@/components/campaigns/campaign-stats-bar"
import { CampaignFilterBar } from "@/components/campaigns/campaign-filter-bar"
import type { StoreOption } from "@/components/campaigns/campaign-filter-bar"
import { CampaignDetailModal } from "@/components/campaigns/campaign-detail-modal"
import { CampaignDayListModal } from "@/components/campaigns/campaign-day-list-modal"

// ============================================
// TYPES
// ============================================

type Campaign = PortalCampaign

// ============================================
// MAIN COMPONENT
// ============================================

export default function PortalCampaignsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Read initial values from URL (Story 45.14)
  const urlMonth = searchParams.get("month")
  const urlYear = searchParams.get("year")
  const urlStore = searchParams.get("store")
  const urlChannel = searchParams.get("channel")
  const urlStatus = searchParams.get("status")

  const initialMonth = urlMonth ? parseInt(urlMonth, 10) - 1 : undefined // URL is 1-based, hook is 0-based
  const initialYear = urlYear ? parseInt(urlYear, 10) : undefined

  const {
    campaigns: rawApiCampaigns,
    selectedCampaign,
    campaignMetrics,
    month,
    year,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,
    selectedStore: hookSelectedStore,
    setSelectedStore: hookSetSelectedStore,
    selectCampaign,
    isLoading: loading,
    isLoadingMetrics,
    error: hookError,
    mutate: mutateCampaigns,
  } = usePortalCampaignsCalendar({
    initialMonth: initialMonth != null && !isNaN(initialMonth) ? initialMonth : undefined,
    initialYear: initialYear != null && !isNaN(initialYear) ? initialYear : undefined,
    storeId: urlStore || undefined,
  })

  // Additional filters -- applied client-side
  const [selectedChannel, setSelectedChannel] = useState(urlChannel || "all")
  const [selectedStatus, setSelectedStatus] = useState(urlStatus || "all")

  // Day-campaigns list modal state
  const [selectedDayCampaigns, setSelectedDayCampaigns] = useState<Campaign[] | null>(null)
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null)

  // Adapt hook store filter to "all" pattern used by Select component
  const selectedStore = hookSelectedStore ?? "all"
  const setSelectedStore = useCallback(
    (value: string) => hookSetSelectedStore(value === "all" ? null : value),
    [hookSetSelectedStore],
  )

  // Story 45.14: Sync state -> URL on every change (including mount — ensures URL always reflects current view)
  useEffect(() => {
    const params = new URLSearchParams()
    params.set("month", String(month + 1))
    params.set("year", String(year))
    if (selectedStore !== "all") params.set("store", selectedStore)
    if (selectedChannel !== "all") params.set("channel", selectedChannel)
    if (selectedStatus !== "all") params.set("status", selectedStatus)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [month, year, selectedStore, selectedChannel, selectedStatus, router])

  const error = hookError?.message ?? null

  // Transform raw API campaigns into calendar format
  const allTransformed = useMemo(
    () => rawApiCampaigns.map((c) => transformCampaignData(c)),
    [rawApiCampaigns],
  )

  // Extract unique stores for filter dropdown
  const stores = useMemo<StoreOption[]>(() => {
    const unique = new Map<string, StoreOption>()
    rawApiCampaigns.forEach((c) => {
      const ids: string[] = c.store_ids || []
      const names: string[] = c.store_names || []
      ids.forEach((id, index) => {
        if (!unique.has(id)) unique.set(id, { id, store_name: names[index] || "Loja" })
      })
    })
    return Array.from(unique.values())
  }, [rawApiCampaigns])

  // Apply client-side channel and status filters
  const campaigns = useMemo(() => {
    let filtered = allTransformed
    if (selectedChannel !== "all") filtered = filtered.filter((c) => c.channel === selectedChannel)
    if (selectedStatus !== "all") filtered = filtered.filter((c) => c.status === selectedStatus)
    return filtered
  }, [allTransformed, selectedChannel, selectedStatus])

  // Calculate stats from filtered campaigns
  const stats = useMemo<CampaignStats>(() => {
    const sentCampaigns = campaigns.filter((c) => c.status === "sent")
    const withMetrics = sentCampaigns.filter((c) => c.hasKlaviyoMetrics)
    const withRates = withMetrics.filter((c) => c.openRate != null)
    const totalRecipientsWithRates = withRates.reduce((s, c) => s + (c.recipients ?? 0), 0)
    const weightedOpenRate =
      withRates.length > 0 && totalRecipientsWithRates > 0
        ? withRates.reduce((s, c) => s + (c.openRate ?? 0) * (c.recipients ?? 0), 0) / totalRecipientsWithRates
        : null
    return {
      total: campaigns.length,
      sent: sentCampaigns.length,
      scheduled: campaigns.filter((c) => c.status === "scheduled").length,
      draft: campaigns.filter((c) => c.status === "draft").length,
      totalRevenue: withMetrics.reduce((s, c) => s + (c.revenue ?? 0), 0),
      totalRecipients: sentCampaigns.reduce((s, c) => s + (c.recipients ?? 0), 0),
      totalOpens: withMetrics.reduce((sum, c) => sum + (c.opened ?? 0), 0),
      totalClicks: withMetrics.reduce((sum, c) => sum + (c.clicked ?? 0), 0),
      weightedOpenRate,
    }
  }, [campaigns])

  const fetchCampaigns = useCallback(() => mutateCampaigns(), [mutateCampaigns])

  // Get campaigns for a specific day
  const getCampaignsForDay = useCallback(
    (date: Date): Campaign[] => {
      const dateStr = formatDateKey(date)
      return campaigns.filter((c) => c.scheduledDate === dateStr)
    },
    [campaigns],
  )

  // Handle day click
  const handleDayClick = useCallback(
    (dayCampaigns: Campaign[]) => {
      if (dayCampaigns.length === 1) {
        selectCampaign(dayCampaigns[0])
      } else if (dayCampaigns.length > 1) {
        setSelectedDayCampaigns(dayCampaigns)
        setSelectedDayDate(dayCampaigns[0].scheduledDate)
      }
    },
    [selectCampaign],
  )

  const handleCampaignClick = useCallback(
    (campaign: Campaign) => selectCampaign(campaign),
    [selectCampaign],
  )

  // Handle day list modal selection
  const handleDayListSelect = useCallback(
    (campaign: Campaign) => {
      setSelectedDayCampaigns(null)
      selectCampaign(campaign)
    },
    [selectCampaign],
  )

  // Render function for CalendarGrid
  const renderDay = useCallback(
    (date: Date) => {
      const dayCampaigns = getCampaignsForDay(date)
      const dayIsToday = isSameDay(date, new Date())
      return (
        <CalendarDayCell
          date={date}
          isToday={dayIsToday}
          campaigns={dayCampaigns}
          onDayClick={handleDayClick}
          onCampaignClick={handleCampaignClick}
        />
      )
    },
    [getCampaignsForDay, handleDayClick, handleCampaignClick],
  )

  // ============================================
  // RENDER: Loading State
  // ============================================
  if (loading && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64 bg-white dark:bg-[#151922]" />
          <Skeleton className="h-10 w-32 bg-white dark:bg-[#151922]" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-white dark:bg-[#151922]" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl bg-white dark:bg-[#151922]" />
        <Skeleton className="h-[500px] rounded-xl bg-white dark:bg-[#151922]" />
      </div>
    )
  }

  // ============================================
  // RENDER: Error State
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-50 dark:bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Erro ao carregar</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <Button onClick={fetchCampaigns} className="bg-primary hover:bg-primary/85 text-white shadow-sm dark:shadow-slate-900/20">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Main
  // ============================================
  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Campanhas</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Acompanhe campanhas de marketing e gere copies
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Refresh button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={fetchCampaigns}
              disabled={loading}
              className="bg-white dark:bg-[#151922] border-slate-200/80 dark:border-slate-700/40 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.06] shadow-sm dark:shadow-slate-900/20"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {/* Stats */}
          <CampaignStatsBar stats={stats} />

          {/* Filters & Navigation */}
          <div className="bg-white dark:bg-[#151922] rounded-xl border border-slate-200/80 dark:border-slate-700/40 shadow-sm dark:shadow-slate-900/20 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <CalendarNavigation
                month={month}
                year={year}
                onPrev={goToPreviousMonth}
                onNext={goToNextMonth}
                onToday={goToToday}
              />
              <CampaignFilterBar
                selectedStore={selectedStore}
                selectedChannel={selectedChannel}
                selectedStatus={selectedStatus}
                stores={stores}
                onStoreChange={setSelectedStore}
                onChannelChange={setSelectedChannel}
                onStatusChange={setSelectedStatus}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-6 px-2">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Canal:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Email</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-xs text-slate-500 dark:text-slate-400">SMS</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Status:</span>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{config.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <CalendarGrid year={year} month={month} renderDay={renderDay} />

          {/* Campaign Detail Modal */}
          <CampaignDetailModal
            campaign={selectedCampaign}
            metrics={campaignMetrics}
            isLoadingMetrics={isLoadingMetrics}
            open={!!selectedCampaign}
            onClose={() => selectCampaign(null)}
          />

          {/* Day Campaigns List Modal */}
          <CampaignDayListModal
            date={selectedDayDate ?? ""}
            campaigns={selectedDayCampaigns ?? []}
            open={!!selectedDayCampaigns && !selectedCampaign}
            onSelect={handleDayListSelect}
            onClose={() => setSelectedDayCampaigns(null)}
          />

        </div>
      </div>
    </div>
  )
}
