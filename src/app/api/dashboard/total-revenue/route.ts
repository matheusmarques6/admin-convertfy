import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("TotalRevenue")

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
}

interface TotalRevenueResponse {
  period: string
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  storesCount: number
  storesWithRevenue: number
  topStores: StoreRevenue[]
  bottomStores: StoreRevenue[]
  storeBreakdown: StoreRevenue[]
  hasPartialData: boolean
  lastFetchedAt: string | null
  cachedAt: string
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const storeIdsParam = request.nextUrl.searchParams.get("store_ids")
    const filterStoreIds = storeIdsParam ? storeIdsParam.split(",").filter(Boolean) : null

    // Resolve org for tenant isolation
    const orgId = await resolveOrgId(user.id)

    // ONE SINGLE QUERY — replaces 120+ API calls
    let query = supabase
      .from("store_revenue_summary")
      .select(`
        store_id,
        klaviyo_total_revenue,
        klaviyo_campaign_revenue,
        klaviyo_flow_revenue,
        shopify_total_revenue,
        sync_status,
        fetched_at,
        client_stores!inner(id, store_name, client_id, clients(name))
      `)
      .eq("period_label", period)
      .eq("org_id", orgId)
      .gt("expires_at", new Date().toISOString())

    // Apply store_ids filter at DB level if provided
    if (filterStoreIds && filterStoreIds.length > 0) {
      query = query.in("store_id", filterStoreIds)
    }

    const { data: summaries, error } = await query

    if (error) {
      log.error("Error fetching revenue summaries:", error)
      throw error
    }

    const rows = summaries || []

    if (rows.length === 0) {
      const elapsed = Date.now() - startTime
      log.info(`[Revenue] period=${period} stores=0 time=${elapsed}ms source=cache`)
      const emptyResult: TotalRevenueResponse = {
        period,
        totalRevenue: 0,
        campaignRevenue: 0,
        flowRevenue: 0,
        storesCount: 0,
        storesWithRevenue: 0,
        topStores: [],
        bottomStores: [],
        storeBreakdown: [],
        hasPartialData: false,
        lastFetchedAt: null,
        cachedAt: new Date().toISOString(),
      }
      const response = successResponse(request, emptyResult)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Build store breakdown
    const storeBreakdown: StoreRevenue[] = rows.map((s) => {
      const storeData = s.client_stores as unknown as {
        id: string
        store_name: string
        client_id: string | null
        clients: { name: string } | null
      }
      return {
        storeId: s.store_id,
        storeName: storeData.store_name || "Loja sem nome",
        clientName: storeData.client_id
          ? (storeData.clients?.name || "Cliente desconhecido")
          : storeData.store_name || "Loja avulsa",
        totalRevenue: Number(s.klaviyo_total_revenue),
        campaignRevenue: Number(s.klaviyo_campaign_revenue),
        flowRevenue: Number(s.klaviyo_flow_revenue),
      }
    })

    // Aggregate totals
    const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenue, 0)
    const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenue, 0)
    const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenue, 0)
    const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenue > 0).length

    // Sort by revenue descending
    const sorted = [...storeBreakdown].sort((a, b) => b.totalRevenue - a.totalRevenue)
    const topStores = sorted.filter(s => s.totalRevenue > 0).slice(0, 5)
    const bottomStores = sorted.filter(s => s.totalRevenue > 0).length > 5
      ? [...sorted.filter(s => s.totalRevenue > 0)].reverse().slice(0, 5)
      : []

    const hasPartialData = rows.some(
      (s) => s.sync_status === "error" || s.sync_status === "partial"
    )

    // Oldest fetched_at across all stores (worst-case freshness)
    const lastFetchedAt = rows.reduce((oldest: string | null, s) => {
      if (!s.fetched_at) return oldest
      if (!oldest) return s.fetched_at as string
      return new Date(s.fetched_at as string) < new Date(oldest) ? s.fetched_at as string : oldest
    }, null)

    const elapsed = Date.now() - startTime
    log.info(`[Revenue] period=${period} stores=${rows.length} time=${elapsed}ms source=cache`)

    const result: TotalRevenueResponse = {
      period,
      totalRevenue,
      campaignRevenue,
      flowRevenue,
      storesCount: rows.length,
      storesWithRevenue,
      topStores,
      bottomStores,
      storeBreakdown,
      hasPartialData,
      lastFetchedAt,
      cachedAt: new Date().toISOString(),
    }

    const response = successResponse(request, result)
    response.headers.set("X-Response-Time", `${elapsed}ms`)
    return response
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}
