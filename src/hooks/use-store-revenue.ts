"use client"

import { useState, useEffect, useCallback, useRef } from "react"

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface RevenueData {
  topStores: StoreRevenue[]
  bottomStores: StoreRevenue[]
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  dataStatus?: "ready" | "syncing"
}

// Module-level deduplication: shared across all hook instances
const inflight = new Map<string, Promise<RevenueData | null>>()

async function fetchRevenue(period: string): Promise<RevenueData | null> {
  try {
    const res = await fetch(`/api/dashboard/total-revenue?period=${period}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function useStoreRevenue(period: string) {
  const [data, setData] = useState<RevenueData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  const loadData = useCallback(async (p: string) => {
    setIsLoading(true)

    // Deduplicate: if same period is already in-flight, reuse the promise
    let promise = inflight.get(p)
    if (!promise) {
      promise = fetchRevenue(p)
      inflight.set(p, promise)
      // Cleanup after resolution
      promise.finally(() => inflight.delete(p))
    }

    const result = await promise
    if (mountedRef.current) {
      setData(result)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadData(period)
    return () => { mountedRef.current = false }
  }, [period, loadData])

  // Auto-poll every 30s when syncing, stop when data arrives
  useEffect(() => {
    if (data?.dataStatus !== "syncing") return
    const interval = setInterval(() => {
      inflight.delete(period)
      loadData(period)
    }, 30000)
    return () => clearInterval(interval)
  }, [data?.dataStatus, period, loadData])

  const refresh = useCallback(() => {
    inflight.delete(period)
    loadData(period)
  }, [period, loadData])

  return { data, isLoading, refresh }
}
