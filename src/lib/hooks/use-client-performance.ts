"use client"

import { useState, useMemo, createContext, useContext, useCallback } from "react"
import { useClientPerformanceAPI } from "@/lib/hooks/use-api-data"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

interface PerformanceTotals {
  storeRevenue: number
  storeOrders: number
  attributedRevenue: number
  klaviyoRevenue: number
  campaignRevenue: number
  flowRevenue: number
  recoveryRate: number
  shopifyRevenue: number
  shopifyOrders: number
  shopifyCustomers: number
  totalCampaigns: number
  totalFlows: number
  avgOpenRate: number
  avgClickRate: number
}

interface BillingData {
  totalPaid: number
  totalPending: number
  totalOverdue: number
}

interface CampaignData {
  name: string
  sendTime: string
  recipients: number
  delivered: number
  openRate: number
  clickRate: number
  revenue: number
}

interface FlowData {
  name: string
  status: string
  delivered: number
  revenue: number
  openRate: number
  clickRate: number
}

interface StoreError {
  integration: string
  message: string
  code?: string
}

interface StorePerformance {
  storeId: string
  storeName: string
  hasKlaviyo: boolean
  hasShopify: boolean
  klaviyo: {
    storeRevenue: number
    storeOrders: number
    attributedRevenue: number
    campaignRevenue: number
    flowRevenue: number
    recoveryRate: number
    totalCampaigns: number
    sentCampaigns: number
    totalFlows: number
    liveFlows: number
    totalDelivered: number
    totalOpens: number
    totalClicks: number
    avgOpenRate: number
    avgClickRate: number
    recentCampaigns: CampaignData[]
    topFlows: FlowData[]
  } | null
  shopify: {
    totalRevenue: number
    totalOrders: number
    averageOrderValue: number
    totalCustomers: number
    recurringCustomerRate: number
  } | null
  errors: StoreError[]
}

export interface PerformanceResponse {
  period: string
  dateRange: { start: string; end: string }
  stores: StorePerformance[]
  totals: PerformanceTotals
  billing: BillingData
  storeErrors?: Array<{ storeName: string; errors: StoreError[] }>
}

export interface StoreBreakdown {
  storeId: string
  storeName: string
  storeRevenue: number
  storeOrders: number
  attributedRevenue: number
  recoveryRate: number
  campaignRevenue: number
  flowRevenue: number
  sentCampaigns: number
  liveFlows: number
  totalDelivered: number
  avgOpenRate: number
  avgClickRate: number
}

export interface ClientPerformanceState {
  data: PerformanceResponse | null
  loading: boolean
  isValidating: boolean
  error: string | null
  period: string
  setPeriod: (period: string) => void
  customDates?: CustomDateRange
  setCustomDates: (dates: CustomDateRange | undefined) => void
  refresh: () => void
  allCampaigns: (CampaignData & { storeName: string })[]
  allFlows: (FlowData & { storeName: string })[]
  storeBreakdown: StoreBreakdown[]
  hasIntegrations: boolean
  onNavigateToStores?: () => void
}

export const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
]

export function useClientPerformance(clientId: string): ClientPerformanceState {
  const [period, setPeriodRaw] = useState("30d")
  const [customDates, setCustomDates] = useState<CustomDateRange | undefined>()

  const setPeriod = useCallback((p: string) => {
    setPeriodRaw(p)
    if (p !== "custom") {
      setCustomDates(undefined)
    }
  }, [])

  const { data: rawData, error: swrError, isLoading, isValidating, mutate } =
    useClientPerformanceAPI(clientId, period, customDates)

  // Unwrap API response (successResponse wraps in { data })
  const data = useMemo<PerformanceResponse | null>(() => {
    if (!rawData) return null
    const d = (rawData as Record<string, unknown>).data ?? rawData
    return d as PerformanceResponse
  }, [rawData])

  const error = swrError ? (swrError instanceof Error ? swrError.message : "Erro desconhecido") : null

  // Check if any store has integrations configured
  const hasIntegrations = useMemo(() => {
    if (!data?.stores) return false
    return data.stores.some(s => s.hasKlaviyo || s.hasShopify)
  }, [data])

  // Collect and memoize all campaigns and flows across stores
  const allCampaigns = useMemo(() => {
    if (!data?.stores) return []
    const campaigns: (CampaignData & { storeName: string })[] = []
    for (const store of data.stores) {
      if (store.klaviyo?.recentCampaigns) {
        for (const c of store.klaviyo.recentCampaigns) {
          campaigns.push({ ...c, storeName: store.storeName })
        }
      }
    }
    return campaigns.sort((a, b) => b.revenue - a.revenue)
  }, [data])

  const allFlows = useMemo(() => {
    if (!data?.stores) return []
    const flows: (FlowData & { storeName: string })[] = []
    for (const store of data.stores) {
      if (store.klaviyo?.topFlows) {
        for (const f of store.klaviyo.topFlows) {
          flows.push({ ...f, storeName: store.storeName })
        }
      }
    }
    return flows.sort((a, b) => b.revenue - a.revenue)
  }, [data])

  const storeBreakdown = useMemo<StoreBreakdown[]>(() => {
    if (!data?.stores) return []
    return data.stores
      .filter((s) => s.klaviyo !== null)
      .map((s) => ({
        storeId: s.storeId,
        storeName: s.storeName,
        storeRevenue: s.klaviyo!.storeRevenue,
        storeOrders: s.klaviyo!.storeOrders,
        attributedRevenue: s.klaviyo!.attributedRevenue,
        recoveryRate: s.klaviyo!.recoveryRate,
        campaignRevenue: s.klaviyo!.campaignRevenue,
        flowRevenue: s.klaviyo!.flowRevenue,
        sentCampaigns: s.klaviyo!.sentCampaigns,
        liveFlows: s.klaviyo!.liveFlows,
        totalDelivered: s.klaviyo!.totalDelivered,
        avgOpenRate: s.klaviyo!.avgOpenRate,
        avgClickRate: s.klaviyo!.avgClickRate,
      }))
      .sort((a, b) => b.storeRevenue - a.storeRevenue)
  }, [data])

  const refresh = useCallback(() => {
    mutate()
  }, [mutate])

  return {
    data,
    loading: isLoading,
    isValidating,
    error,
    period,
    setPeriod,
    customDates,
    setCustomDates,
    refresh,
    allCampaigns,
    allFlows,
    storeBreakdown,
    hasIntegrations,
  }
}

// Context for sharing performance state between KPIs and Tables
export const ClientPerformanceContext = createContext<ClientPerformanceState | null>(null)

export function useClientPerformanceContext() {
  const ctx = useContext(ClientPerformanceContext)
  if (!ctx) throw new Error("useClientPerformanceContext must be used within ClientPerformanceProvider")
  return ctx
}
