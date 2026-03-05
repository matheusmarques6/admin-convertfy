import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { type DataStatus, type DataStatusMeta } from "@/lib/shared/data-status"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"

const log = logger.child("TotalRevenue")

/** Admin dashboard considers data stale after 1 hour */
const ADMIN_STALENESS_MS = 60 * 60 * 1000

// ── Types ──────────────────────────────────────────────────────────────────

interface StoreRevenue {
  storeId: string
  storeName: string
  clientName: string
  /** Revenue in the store's original currency */
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  /** ISO 4217 currency code from Klaviyo account (e.g. "USD", "BRL") */
  currency: string
  /** Revenue converted to BRL for aggregation */
  totalRevenueBRL: number
  campaignRevenueBRL: number
  flowRevenueBRL: number
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
  dataStatus?: DataStatus
}

type EnhancedTotalRevenueResponse = TotalRevenueResponse & DataStatusMeta & {
  dataAge: number
  isStale: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildStoreBreakdown(rows: Array<{
  store_id: string
  klaviyo_total_revenue: number | string
  klaviyo_campaign_revenue: number | string
  klaviyo_flow_revenue: number | string
  currency?: string | null
  sync_status: string
  fetched_at: string | null
  client_stores: unknown
}>): Promise<StoreRevenue[]> {
  const results = await Promise.all(rows.map(async (s) => {
    const storeData = s.client_stores as unknown as {
      id: string
      store_name: string
      client_id: string | null
      clients: { name: string } | null
    }
    const currency = s.currency || "BRL"
    const totalRev = Number(s.klaviyo_total_revenue)
    const campaignRev = Number(s.klaviyo_campaign_revenue)
    const flowRev = Number(s.klaviyo_flow_revenue)

    const [totalBRL, campaignBRL, flowBRL] = await Promise.all([
      convertToBRL(totalRev, currency),
      convertToBRL(campaignRev, currency),
      convertToBRL(flowRev, currency),
    ])

    return {
      storeId: s.store_id,
      storeName: storeData.store_name || "Loja sem nome",
      clientName: storeData.client_id
        ? (storeData.clients?.name || "Cliente desconhecido")
        : storeData.store_name || "Loja avulsa",
      totalRevenue: totalRev,
      campaignRevenue: campaignRev,
      flowRevenue: flowRev,
      currency,
      totalRevenueBRL: totalBRL,
      campaignRevenueBRL: campaignBRL,
      flowRevenueBRL: flowBRL,
    }
  }))
  return results
}

function buildResponse(
  period: string,
  storeBreakdown: StoreRevenue[],
  rows: Array<{ sync_status: string; fetched_at: string | null }>,
  meta: DataStatusMeta & { dataAge: number; isStale: boolean },
  storesCount: number,
): EnhancedTotalRevenueResponse {
  const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenueBRL, 0)
  const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenueBRL, 0)
  const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenueBRL, 0)
  const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenueBRL > 0).length

  const sorted = [...storeBreakdown].sort((a, b) => b.totalRevenueBRL - a.totalRevenueBRL)
  const topStores = sorted.filter(s => s.totalRevenueBRL > 0).slice(0, 5)
  const bottomStores = sorted.filter(s => s.totalRevenueBRL > 0).length > 5
    ? [...sorted.filter(s => s.totalRevenueBRL > 0)].reverse().slice(0, 5)
    : []

  const hasPartialData = rows.some(
    (s) => s.sync_status === "error" || s.sync_status === "partial"
  )

  const lastFetchedAt = meta.lastFetchedAt ?? rows.reduce((oldest: string | null, s) => {
    if (!s.fetched_at) return oldest
    if (!oldest) return s.fetched_at
    return new Date(s.fetched_at) < new Date(oldest) ? s.fetched_at : oldest
  }, null)

  return {
    period,
    totalRevenue,
    campaignRevenue,
    flowRevenue,
    storesCount,
    storesWithRevenue,
    topStores,
    bottomStores,
    storeBreakdown,
    hasPartialData,
    lastFetchedAt,
    cachedAt: new Date().toISOString(),
    dataStatus: meta.dataStatus,
    isRefreshing: meta.isRefreshing,
    source: meta.source,
    dataAge: meta.dataAge,
    isStale: meta.isStale,
  }
}

function emptyResponse(
  period: string,
  storesCount: number,
  meta: DataStatusMeta & { dataAge: number; isStale: boolean },
): EnhancedTotalRevenueResponse {
  return {
    period,
    totalRevenue: 0,
    campaignRevenue: 0,
    flowRevenue: 0,
    storesCount,
    storesWithRevenue: 0,
    topStores: [],
    bottomStores: [],
    storeBreakdown: [],
    hasPartialData: false,
    lastFetchedAt: meta.lastFetchedAt,
    cachedAt: new Date().toISOString(),
    dataStatus: meta.dataStatus,
    isRefreshing: meta.isRefreshing,
    source: meta.source,
    dataAge: meta.dataAge,
    isStale: meta.isStale,
  }
}

// ── GET Handler (cache-only read — no live API calls) ─────────────────────

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const storeIdsParam = request.nextUrl.searchParams.get("store_ids")
    const filterStoreIds = storeIdsParam ? storeIdsParam.split(",").filter(Boolean) : null

    const orgId = await resolveOrgId(user.id)
    const adminClient = createAdminClient()

    // Count total Klaviyo stores for this org
    const { count: totalKlaviyoStores } = await adminClient
      .from("client_stores")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .or(KLAVIYO_CREDENTIALS_FILTER)

    const storesCount = totalKlaviyoStores ?? 0

    if (storesCount === 0) {
      const elapsed = Date.now() - startTime
      const result = emptyResponse(period, 0, {
        dataStatus: "empty",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "cache",
        dataAge: 0,
        isStale: false,
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Read from store_revenue_summary (no expires_at filter — we calculate staleness ourselves)
    let query = supabase
      .from("store_revenue_summary")
      .select(`
        store_id,
        klaviyo_total_revenue,
        klaviyo_campaign_revenue,
        klaviyo_flow_revenue,
        store_total_revenue,
        currency,
        sync_status,
        fetched_at,
        client_stores!inner(id, store_name, client_id, clients(name))
      `)
      .eq("period_label", period)
      .eq("org_id", orgId)

    if (filterStoreIds && filterStoreIds.length > 0) {
      query = query.in("store_id", filterStoreIds)
    }

    const { data: summaries, error } = await query

    if (error) {
      if (error.code === "42P01") {
        log.warn("[Revenue] store_revenue_summary table does not exist yet")
        return NextResponse.json(
          { success: false, error: "Revenue cache not available", dataStatus: "unavailable" },
          { status: 503, headers: { "Retry-After": "300" } }
        )
      }
      log.error("Error fetching revenue summaries:", error)
      throw error
    }

    const rows = summaries || []

    if (rows.length === 0) {
      const elapsed = Date.now() - startTime
      log.info("[CacheStrategy]", { endpoint: "total-revenue", period, storesCount, source: "cache", dataAge: -1, elapsed: `${elapsed}ms` })
      const result = emptyResponse(period, storesCount, {
        dataStatus: "stale",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "cache",
        dataAge: -1,
        isStale: true,
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Calculate data age from oldest fetched_at
    const oldestFetchedAt = rows.reduce((oldest: string | null, s) => {
      if (!s.fetched_at) return oldest
      if (!oldest) return s.fetched_at
      return new Date(s.fetched_at) < new Date(oldest) ? s.fetched_at : oldest
    }, null)

    const dataAgeMs = oldestFetchedAt ? Date.now() - new Date(oldestFetchedAt).getTime() : Infinity
    const dataAgeMinutes = Math.round(dataAgeMs / 60_000)
    const isStale = dataAgeMs > ADMIN_STALENESS_MS

    const storeBreakdown = await buildStoreBreakdown(rows)

    const elapsed = Date.now() - startTime
    log.info("[CacheStrategy]", {
      endpoint: "total-revenue",
      period,
      storesCount,
      rowsReturned: rows.length,
      source: "cache",
      dataAge: dataAgeMinutes,
      isStale,
      elapsed: `${elapsed}ms`,
    })

    const result = buildResponse(period, storeBreakdown, rows, {
      dataStatus: isStale ? "stale" : "ready",
      lastFetchedAt: oldestFetchedAt,
      isRefreshing: false,
      source: isStale ? "stale-cache" : "cache",
      dataAge: dataAgeMinutes,
      isStale,
    }, storesCount)

    const response = successResponse(request, result)
    response.headers.set("X-Response-Time", `${elapsed}ms`)
    return response
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}
