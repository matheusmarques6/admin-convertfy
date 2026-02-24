"use client"

import { useState, useMemo, createContext, useContext, useCallback } from "react"
import { useKlaviyoCampaigns, useKlaviyoFlows } from "@/lib/hooks/use-api-data"
import type { CustomDateRange } from "@/lib/hooks/use-api-data"

export const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
]

export interface StorePerformanceTotals {
  campaignRevenue: number
  flowRevenue: number
  totalRevenue: number
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

  const campaignsData = campaignsRaw as { summary: Record<string, number>; campaigns: CampaignItem[] } | undefined
  const flowsData = flowsRaw as { summary: Record<string, number>; flows: FlowItem[] } | undefined

  const campaigns = useMemo(() => {
    return campaignsData?.campaigns ?? []
  }, [campaignsData])

  const flows = useMemo(() => {
    return flowsData?.flows ?? []
  }, [flowsData])

  const totals = useMemo<StorePerformanceTotals | null>(() => {
    if (!campaignsData && !flowsData) return null

    const cs = campaignsData?.summary ?? {}
    const fs = flowsData?.summary ?? {}

    const campaignRevenue = cs.totalRevenue ?? 0
    const flowRevenue = fs.totalRevenue ?? 0

    return {
      campaignRevenue,
      flowRevenue,
      totalRevenue: campaignRevenue + flowRevenue,
      totalCampaigns: cs.sentCampaigns ?? cs.totalCampaigns ?? 0,
      totalFlows: fs.liveFlows ?? fs.totalFlows ?? 0,
      avgOpenRate: cs.avgOpenRate ?? 0,
      avgClickRate: cs.avgClickRate ?? 0,
    }
  }, [campaignsData, flowsData])

  const loading = campaignsLoading || flowsLoading
  const isValidating = campaignsValidating || flowsValidating
  const error = (campaignsError || flowsError)
    ? ((campaignsError instanceof Error ? campaignsError.message : "") +
       (flowsError instanceof Error ? ` ${flowsError.message}` : "")).trim() || "Erro ao carregar dados"
    : null

  const refresh = useCallback(() => {
    mutateCampaigns()
    mutateFlows()
  }, [mutateCampaigns, mutateFlows])

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
