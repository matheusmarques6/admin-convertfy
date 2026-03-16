import { useState, useCallback } from "react"
import useSWR from "swr"
import type { PortalCampaignApiResponse } from "@/types/campaign"

// ============================================
// TYPES
// ============================================

/**
 * Campaign type used by the calendar page (camelCase).
 * Re-exported here so the hook can reference it without circular imports.
 * The canonical definition lives in page.tsx — keep in sync.
 */
export interface PortalCampaign {
  id: string
  name: string
  description?: string
  channel: "email" | "sms" | "push"
  type: string
  status: "draft" | "scheduled" | "sent" | "cancelled"
  scheduledDate: string
  scheduledTime?: string
  color: string
  subjectLine?: string
  segmentName?: string
  recipients?: number
  delivered?: number
  opened?: number
  clicked?: number
  converted?: number
  revenue?: number
  source?: "manual" | "klaviyo" | "batch"
  storeNames?: string[]
  currency?: string
  store?: {
    id: string
    store_name: string
  }
  // Enriched metrics from RPC (Story 41.3)
  openRate?: number
  clickRate?: number
  bounceRate?: number
  conversionRate?: number
  revenuePerRecipient?: number
  averageOrderValue?: number
  hasKlaviyoMetrics?: boolean
  metricsFetchedAt?: string | null
}

/**
 * Full metrics returned by GET /api/portal/campaigns/[id]/metrics
 * Matches klaviyo_campaign_metrics table (minus internal fields: org_id, period_start, period_end, period_label).
 */
export interface PortalCampaignDetailMetrics {
  store_id: string
  campaign_id: string
  campaign_name: string
  campaign_status: string
  send_time: string
  subject: string
  channel: string
  recipients: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  spam_complaints: number
  open_rate: number
  click_rate: number
  bounce_rate: number
  conversion_rate: number
  conversions: number
  conversion_value: number
  revenue_per_recipient: number
  average_order_value: number
  click_to_open_rate: number
  delivery_rate: number
  unsubscribe_rate: number
  spam_rate: number
  fetched_at: string
}

// ============================================
// FETCHER
// ============================================

async function portalFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.error || json.message || `API error: ${res.status}`)
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message !== text) throw parseError
      throw new Error(text || `API error: ${res.status}`)
    }
  }
  // successResponse() does spread: { success: true, campaigns: [...], totalCount: N }
  // Fields are at the ROOT level, NOT inside .data
  return res.json()
}

// ============================================
// HOOK OPTIONS & RETURN TYPE
// ============================================

export interface UsePortalCampaignsCalendarOptions {
  initialMonth?: number // 0-11
  initialYear?: number
  storeId?: string
}

// Re-export for consumers that imported PortalCampaignApiResponse from here
export type { PortalCampaignApiResponse } from "@/types/campaign"

export interface UsePortalCampaignsCalendarReturn {
  // Data — raw API campaigns (snake_case), consumer transforms them
  campaigns: PortalCampaignApiResponse[]
  selectedCampaign: PortalCampaign | null
  campaignMetrics: PortalCampaignDetailMetrics | null

  // Navigation
  month: number
  year: number
  goToPreviousMonth: () => void
  goToNextMonth: () => void
  goToToday: () => void

  // Selection
  selectedStore: string | null
  setSelectedStore: (storeId: string | null) => void
  selectCampaign: (campaign: PortalCampaign | null) => void

  // Loading states
  isLoading: boolean
  isLoadingMetrics: boolean
  error: Error | null

  // Mutation helpers
  mutate: () => void
}

// ============================================
// HOOK
// ============================================

export function usePortalCampaignsCalendar(
  options: UsePortalCampaignsCalendarOptions = {}
): UsePortalCampaignsCalendarReturn {
  const now = new Date()
  const [currentDate, setCurrentDate] = useState(
    () => new Date(options.initialYear ?? now.getFullYear(), options.initialMonth ?? now.getMonth(), 1)
  )
  const [selectedCampaign, setSelectedCampaign] = useState<PortalCampaign | null>(null)
  const [selectedStore, setSelectedStoreRaw] = useState<string | null>(options.storeId ?? null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Build date range for the current month
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

  // Build query params
  const buildListUrl = useCallback(() => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (selectedStore) params.set("store_id", selectedStore)
    return `/api/portal/campaigns?${params.toString()}`
  }, [startDate, endDate, selectedStore])

  // SWR: campaign list
  const {
    data: listData,
    error: listError,
    isLoading: isLoadingList,
    mutate,
  } = useSWR<{ success: boolean; campaigns: PortalCampaignApiResponse[]; totalCount: number }>(
    ["/api/portal/campaigns", month, year, selectedStore],
    () => portalFetcher(buildListUrl()),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  )

  // SWR: lazy metrics for selected campaign
  const metricsKey = selectedCampaign?.id
    ? ["/api/portal/campaigns", selectedCampaign.id, "metrics"]
    : null

  const {
    data: metricsData,
    isLoading: isLoadingMetrics,
  } = useSWR<{ success: boolean; metrics: PortalCampaignDetailMetrics | null }>(
    metricsKey,
    () => portalFetcher(`/api/portal/campaigns/${selectedCampaign!.id}/metrics`),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      errorRetryCount: 1,
    }
  )

  // Navigation
  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedCampaign(null)
  }, [])

  const goToNextMonth = useCallback(() => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedCampaign(null)
  }, [])

  const goToToday = useCallback(() => {
    const now = new Date()
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedCampaign(null)
  }, [])

  // Store selection — reset selected campaign on change
  const setSelectedStore = useCallback((storeId: string | null) => {
    setSelectedStoreRaw(storeId)
    setSelectedCampaign(null)
  }, [])

  // Campaign selection
  const selectCampaign = useCallback((campaign: PortalCampaign | null) => {
    setSelectedCampaign(campaign)
  }, [])

  return {
    campaigns: listData?.campaigns ?? [],
    selectedCampaign,
    campaignMetrics: metricsData?.metrics ?? null,

    month,
    year,
    goToPreviousMonth,
    goToNextMonth,
    goToToday,

    selectedStore,
    setSelectedStore,
    selectCampaign,

    isLoading: isLoadingList,
    isLoadingMetrics,
    error: listError ?? null,

    mutate: () => { mutate() },
  }
}
