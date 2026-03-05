"use client"

import { useState, useMemo, createContext, useContext, useCallback } from "react"
import { useKlaviyoCampaigns, useKlaviyoFlows, useKlaviyoReport } from "@/lib/hooks/use-api-data"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

export const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
]

export interface StorePerformanceTotals {
  storeRevenue: number
  storeOrders: number
  campaignRevenue: number
  flowRevenue: number
  totalRevenue: number
  recoveryRate: number
  totalCampaigns: number
  totalFlows: number
  avgOpenRate: number
  avgClickRate: number
}

interface CampaignItem {
  id: string
  name: string
  status: string
  sendTime: string | null
  channel: string
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

interface FlowItem {
  id: string
  name: string
  status: string
  triggerType: string
  recipients: number
  delivered?: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  revenue: number
}

export interface StorePerformanceState {
  totals: StorePerformanceTotals | null
  campaigns: CampaignItem[]
  flows: FlowItem[]
  loading: boolean
  isValidating: boolean
  error: string | null
  period: string
  setPeriod: (period: string) => void
  customDates?: CustomDateRange
  setCustomDates: (dates: CustomDateRange | undefined) => void
  refresh: () => void
}

export function useStorePerformance(storeId: string, klaviyoConnected: boolean): StorePerformanceState {
  const [period, setPeriodRaw] = useState("30d")
  const [customDates, setCustomDates] = useState<CustomDateRange | undefined>()

  const setPeriod = useCallback((p: string) => {
    setPeriodRaw(p)
    if (p !== "custom") {
      setCustomDates(undefined)
    }
  }, [])

  const effectiveStoreId = klaviyoConnected ? storeId : null

  const {
    data: campaignsRaw,
    isLoading: campaignsLoading,
    isValidating: campaignsValidating,
    error: campaignsError,
    mutate: mutateCampaigns,
  } = useKlaviyoCampaigns(effectiveStoreId, period, customDates)

  const {
    data: flowsRaw,
    isLoading: flowsLoading,
    isValidating: flowsValidating,
    error: flowsError,
    mutate: mutateFlows,
  } = useKlaviyoFlows(effectiveStoreId, period, customDates)

  const {
    data: reportRaw,
    isLoading: reportLoading,
    isValidating: reportValidating,
    error: reportError,
    mutate: mutateReport,
  } = useKlaviyoReport(effectiveStoreId, period, customDates)

  const campaignsData = campaignsRaw as { summary: Record<string, number>; campaigns: CampaignItem[] } | undefined
  const flowsData = flowsRaw as { summary: Record<string, number>; flows: FlowItem[] } | undefined

  // Klaviyo report returns pre-calculated revenue & recovery data from the backend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportData = reportRaw as any

  const campaigns = useMemo(() => {
    return campaignsData?.campaigns ?? []
  }, [campaignsData])

  const flows = useMemo(() => {
    return flowsData?.flows ?? []
  }, [flowsData])

  const totals = useMemo<StorePerformanceTotals | null>(() => {
    // Use report as primary source for revenue KPIs (backend calculates from Klaviyo metric-aggregates)
    // Fall back to campaigns/flows summaries for counts and rates
    if (!reportData && !campaignsData && !flowsData) return null

    const rv = reportData?.revenue ?? {}
    const cs = campaignsData?.summary ?? {}
    const fs = flowsData?.summary ?? {}
    const overview = reportData?.overview ?? {}

    return {
      storeRevenue: rv.storeRevenue ?? 0,
      storeOrders: rv.storeOrders ?? 0,
      campaignRevenue: rv.campaignRevenue ?? cs.totalRevenue ?? 0,
      flowRevenue: rv.flowRevenue ?? fs.totalRevenue ?? 0,
      totalRevenue: rv.klaviyoAttributedRevenue ?? rv.totalRevenue ?? ((cs.totalRevenue ?? 0) + (fs.totalRevenue ?? 0)),
      recoveryRate: rv.recoveryRate ?? 0,
      // Use campaigns/flows endpoint counts (period-filtered), NOT report overview (which counts ALL-TIME)
      totalCampaigns: cs.sentCampaigns ?? cs.totalCampaigns ?? overview.campaignsInPeriod ?? 0,
      totalFlows: fs.liveFlows ?? fs.totalFlows ?? overview.liveFlows ?? 0,
      avgOpenRate: cs.avgOpenRate ?? 0,
      avgClickRate: cs.avgClickRate ?? 0,
    }
  }, [campaignsData, flowsData, reportData])

  const loading = campaignsLoading || flowsLoading || reportLoading
  const isValidating = campaignsValidating || flowsValidating || reportValidating
  const anyError = campaignsError || flowsError || reportError
  const error = anyError
    ? [...new Set(
        [campaignsError, flowsError, reportError]
          .filter((e): e is Error => e instanceof Error)
          .map(e => e.message)
      )].join(". ") || "Erro ao carregar dados"
    : null

  const refresh = useCallback(() => {
    mutateCampaigns()
    mutateFlows()
    mutateReport()
  }, [mutateCampaigns, mutateFlows, mutateReport])

  return {
    totals,
    campaigns,
    flows,
    loading,
    isValidating,
    error,
    period,
    setPeriod,
    customDates,
    setCustomDates,
    refresh,
  }
}

// Context for sharing between KPIs and Tables in overview
export const StorePerformanceContext = createContext<StorePerformanceState | null>(null)

export function useStorePerformanceContext() {
  const ctx = useContext(StorePerformanceContext)
  if (!ctx) throw new Error("useStorePerformanceContext must be used within StorePerformanceProvider")
  return ctx
}
