"use client"

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react"

interface PerformanceTotals {
  klaviyoRevenue: number
  campaignRevenue: number
  flowRevenue: number
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
  openRate: number
  clickRate: number
  revenue: number
}

interface FlowData {
  name: string
  status: string
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
    totalRevenue: number
    campaignRevenue: number
    flowRevenue: number
    totalCampaigns: number
    sentCampaigns: number
    totalFlows: number
    liveFlows: number
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

export interface ClientPerformanceState {
  data: PerformanceResponse | null
  loading: boolean
  error: string | null
  period: string
  setPeriod: (period: string) => void
  refresh: () => void
  allCampaigns: (CampaignData & { storeName: string })[]
  allFlows: (FlowData & { storeName: string })[]
}

export const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
]

// Simple in-memory cache to share data between KPIs and Tables components
const cache = new Map<string, { data: PerformanceResponse; timestamp: number }>()
const CACHE_TTL = 5000 // 5s dedup window
const CACHE_MAX_ENTRIES = 25

function cacheSet(key: string, data: PerformanceResponse) {
  // Evict expired entries when cache grows
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL) cache.delete(k)
    }
    // If still too large, remove oldest
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
  }
  cache.set(key, { data, timestamp: Date.now() })
}

export function useClientPerformance(clientId: string): ClientPerformanceState {
  const [period, setPeriod] = useState("30d")
  const [data, setData] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (selectedPeriod: string) => {
    const cacheKey = `${clientId}:${selectedPeriod}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      const res = await fetch(
        `/api/clients/${clientId}/performance?period=${selectedPeriod}`,
        { signal: controller.signal }
      )
      clearTimeout(timeout)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${res.status}`)
      }

      const json = await res.json()
      const responseData = json.data || json
      setData(responseData)
      cacheSet(cacheKey, responseData)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Timeout ao carregar dados. Tente um período menor.")
      } else {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      }
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchData(period)
  }, [period, fetchData])

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

  return {
    data,
    loading,
    error,
    period,
    setPeriod,
    refresh: () => {
      cache.delete(`${clientId}:${period}`)
      fetchData(period)
    },
    allCampaigns,
    allFlows,
  }
}

// Context for sharing performance state between KPIs and Tables
export const ClientPerformanceContext = createContext<ClientPerformanceState | null>(null)

export function useClientPerformanceContext() {
  const ctx = useContext(ClientPerformanceContext)
  if (!ctx) throw new Error("useClientPerformanceContext must be used within ClientPerformanceProvider")
  return ctx
}
