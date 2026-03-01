import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { type DataStatus, type DataStatusMeta } from "@/lib/shared/data-status"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  type KlaviyoSyncData,
} from "@/lib/services/klaviyo-sync.service"
import { tryAcquireLiveFetch, releaseLiveFetch, getFetchKey } from "@/lib/services/fetch-cooldown.service"
import { upsertSyncResults } from "@/lib/services/sync-persistence.service"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  getTimezoneOffset,
} from "@/lib/integrations/klaviyo"

const log = logger.child("TotalRevenue")

const LIVE_FETCH_TIMEOUT_MS = 30_000

// ── Types ──────────────────────────────────────────────────────────────────

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
  dataStatus?: DataStatus
}

type EnhancedTotalRevenueResponse = TotalRevenueResponse & DataStatusMeta

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
  client_id: string | null
  clients: { name: string } | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildStoreBreakdown(rows: Array<{
  store_id: string
  klaviyo_total_revenue: number | string
  klaviyo_campaign_revenue: number | string
  klaviyo_flow_revenue: number | string
  sync_status: string
  fetched_at: string | null
  client_stores: unknown
}>): StoreRevenue[] {
  return rows.map((s) => {
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
}

function buildResponse(
  period: string,
  storeBreakdown: StoreRevenue[],
  rows: Array<{ sync_status: string; fetched_at: string | null }>,
  meta: DataStatusMeta,
): EnhancedTotalRevenueResponse {
  const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenue, 0)
  const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenue, 0)
  const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenue, 0)
  const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenue > 0).length

  const sorted = [...storeBreakdown].sort((a, b) => b.totalRevenue - a.totalRevenue)
  const topStores = sorted.filter(s => s.totalRevenue > 0).slice(0, 5)
  const bottomStores = sorted.filter(s => s.totalRevenue > 0).length > 5
    ? [...sorted.filter(s => s.totalRevenue > 0)].reverse().slice(0, 5)
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
    storesCount: storeBreakdown.length,
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
  }
}

function emptyResponse(
  period: string,
  storesCount: number,
  meta: DataStatusMeta,
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
  }
}

// ── Build StoreRevenue from sync result ────────────────────────────────────

function buildSummaryFromSync(store: StoreRow, data: KlaviyoSyncData): StoreRevenue {
  return {
    storeId: store.id,
    storeName: store.store_name || "Loja sem nome",
    clientName: store.client_id
      ? (store.clients?.name || "Cliente desconhecido")
      : store.store_name || "Loja avulsa",
    totalRevenue: data.campaignRevenue + data.flowRevenue,
    campaignRevenue: data.campaignRevenue,
    flowRevenue: data.flowRevenue,
  }
}

// ── Read (possibly stale) cached summary for a store ───────────────────────

async function getCachedSummary(
  supabase: SupabaseClient,
  storeId: string,
  period: string,
  store: StoreRow,
): Promise<StoreRevenue | null> {
  // Read without expires_at filter (allow stale)
  const { data } = await supabase
    .from("store_revenue_summary")
    .select("klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue")
    .eq("store_id", storeId)
    .eq("period_label", period)
    .single()

  if (!data) return null

  return {
    storeId,
    storeName: store.store_name || "Loja sem nome",
    clientName: store.client_id
      ? (store.clients?.name || "Cliente desconhecido")
      : store.store_name || "Loja avulsa",
    totalRevenue: Number(data.klaviyo_total_revenue),
    campaignRevenue: Number(data.klaviyo_campaign_revenue),
    flowRevenue: Number(data.klaviyo_flow_revenue),
  }
}

// ── Live fetch for stores (sequential, with cooldown) ──────────────────────

async function liveFetchForStores(
  stores: StoreRow[],
  period: string,
  adminSupabase: SupabaseClient,
): Promise<{ results: StoreRevenue[]; fetchedAt: string | null; hasStale: boolean }> {
  const results: StoreRevenue[] = []
  let fetchedAt: string | null = null
  let hasStale = false

  for (const store of stores) {
    const fetchKey = getFetchKey(period)
    const canFetch = await tryAcquireLiveFetch(adminSupabase, store.id, fetchKey, "admin-fallback")

    if (!canFetch) {
      // Cooldown active -- try stale cache
      const cached = await getCachedSummary(adminSupabase, store.id, period, store)
      if (cached) {
        results.push(cached)
        hasStale = true
      }
      continue
    }

    try {
      const credentials = await getStoreCredentials(store.id)
      const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
      if (!apiKey) {
        await releaseLiveFetch(adminSupabase, store.id, fetchKey, "failed")
        continue
      }

      const accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined)
      const metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined)
      if (!metricId) {
        log.warn(`[LiveFetch] No Placed Order metric found for store ${store.store_name} (${store.id}) — skipping live fetch. Check Klaviyo API key validity.`)
        await releaseLiveFetch(adminSupabase, store.id, fetchKey, "failed")
        continue
      }

      const [flowNames, campNames] = await Promise.all([
        fetchFlowNames(apiKey),
        fetchCampaignNames(apiKey),
      ])

      const syncResult = await syncKlaviyoForPeriod({
        storeId: store.id,
        orgId: store.org_id,
        apiKey,
        timezone: accountInfo.timezone,
        timezoneOffset: getTimezoneOffset(accountInfo.timezone),
        metricId,
        period,
        flowNames,
        campNames,
      })

      if (syncResult.success && syncResult.data) {
        await upsertSyncResults(adminSupabase, store, syncResult.data, period)
        results.push(buildSummaryFromSync(store, syncResult.data))
        fetchedAt = syncResult.fetchedAt
      }

      await releaseLiveFetch(adminSupabase, store.id, fetchKey, "completed")
    } catch (err) {
      await releaseLiveFetch(adminSupabase, store.id, fetchKey, "failed")
      log.warn(`[LiveFetch] Error for store ${store.store_name}:`, err)
      // Continue with next store
    }
  }

  return { results, fetchedAt, hasStale }
}

// ── Wrap live fetch with timeout ───────────────────────────────────────────

async function liveFetchWithTimeout(
  stores: StoreRow[],
  period: string,
  adminSupabase: SupabaseClient,
): Promise<{ results: StoreRevenue[]; fetchedAt: string | null; timedOut: boolean; hasStale: boolean }> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), LIVE_FETCH_TIMEOUT_MS)
  })

  const fetchPromise = liveFetchForStores(stores, period, adminSupabase)

  // Note: Promise.race does not cancel the losing promise.
  // On Vercel serverless, the in-flight work continues until the platform kills the function.
  const result = await Promise.race([fetchPromise, timeoutPromise])

  if (result === null) {
    log.warn(`[LiveFetch] Timed out after ${LIVE_FETCH_TIMEOUT_MS}ms`)
    return { results: [], fetchedAt: null, timedOut: true, hasStale: false }
  }

  return { ...result, timedOut: false }
}

// ── GET Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const storeIdsParam = request.nextUrl.searchParams.get("store_ids")
    const filterStoreIds = storeIdsParam ? storeIdsParam.split(",").filter(Boolean) : null
    const forceRefresh = request.nextUrl.searchParams.get("force_refresh") === "true"

    // Resolve org for tenant isolation
    const orgId = await resolveOrgId(user.id)

    // ── Step 1: Try cache (skip if force_refresh) ────────────────────────
    if (!forceRefresh) {
      let query = supabase
        .from("store_revenue_summary")
        .select(`
          store_id,
          klaviyo_total_revenue,
          klaviyo_campaign_revenue,
          klaviyo_flow_revenue,
          store_total_revenue,
          sync_status,
          fetched_at,
          client_stores!inner(id, store_name, client_id, clients(name))
        `)
        .eq("period_label", period)
        .eq("org_id", orgId)
        .gt("expires_at", new Date().toISOString())

      if (filterStoreIds && filterStoreIds.length > 0) {
        query = query.in("store_id", filterStoreIds)
      }

      const { data: summaries, error } = await query

      // Handle table-not-exists (Postgres 42P01)
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

      if (rows.length > 0) {
        // Cache HIT
        const storeBreakdown = buildStoreBreakdown(rows)
        const elapsed = Date.now() - startTime
        log.info("[CacheStrategy]", {
          endpoint: "total-revenue",
          period,
          storesCount: rows.length,
          cacheHits: rows.length,
          cacheMisses: 0,
          liveFetches: 0,
          source: "cache",
          elapsed: `${elapsed}ms`,
        })

        const result = buildResponse(period, storeBreakdown, rows, {
          dataStatus: "ready",
          lastFetchedAt: null,
          isRefreshing: false,
          source: "cache",
        })
        const response = successResponse(request, result)
        response.headers.set("X-Response-Time", `${elapsed}ms`)
        return response
      }

      // Cache MISS (any period) -- fall through to live fetch below
      log.info(`[CacheStrategy] Cache MISS for period=${period}, falling through to live fetch`)
    }

    // ── Step 2: Live fetch (force_refresh or LIVE_ONLY period) ───────────
    const adminSupabase = createAdminClient()

    // Get stores with Klaviyo credentials
    let storeQuery = adminSupabase
      .from("client_stores")
      .select("id, store_name, org_id, client_id, clients(name)")
      .eq("org_id", orgId)
      .not("klaviyo_private_key", "is", null)

    if (filterStoreIds && filterStoreIds.length > 0) {
      storeQuery = storeQuery.in("id", filterStoreIds)
    }

    const { data: storesData, error: storesError } = await storeQuery

    if (storesError) {
      log.error("Error fetching stores for live fetch:", storesError)
      throw storesError
    }

    const stores: StoreRow[] = (storesData || []).map((s) => ({
      id: s.id,
      store_name: s.store_name,
      org_id: s.org_id,
      client_id: s.client_id,
      clients: s.clients as unknown as { name: string } | null,
    }))

    if (stores.length === 0) {
      const elapsed = Date.now() - startTime
      log.info("[CacheStrategy]", {
        endpoint: "total-revenue",
        period,
        storesCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        liveFetches: 0,
        source: "live",
        elapsed: `${elapsed}ms`,
      })
      const result = emptyResponse(period, 0, {
        dataStatus: "empty",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "live",
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    // Live fetch with 30s timeout
    const { results: liveResults, fetchedAt, timedOut, hasStale } =
      await liveFetchWithTimeout(stores, period, adminSupabase)

    const elapsed = Date.now() - startTime

    if (liveResults.length === 0 && timedOut) {
      // Timed out with no results
      log.warn("[CacheStrategy]", {
        endpoint: "total-revenue",
        period,
        storesCount: stores.length,
        cacheHits: 0,
        cacheMisses: stores.length,
        liveFetches: 0,
        cooldownBlocked: 0,
        source: "live",
        elapsed: `${elapsed}ms`,
        timedOut: true,
      })
      const result = emptyResponse(period, stores.length, {
        dataStatus: "stale",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "live",
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    const source = hasStale ? "stale-cache" as const : "live" as const
    const dataStatus: DataStatus = timedOut ? "stale" : "ready"

    log.info("[CacheStrategy]", {
      endpoint: "total-revenue",
      period,
      storesCount: stores.length,
      cacheHits: 0,
      cacheMisses: stores.length,
      liveFetches: liveResults.length,
      source,
      elapsed: `${elapsed}ms`,
    })

    // Build synthetic rows for the buildResponse helper
    const syntheticRows = liveResults.map(() => ({
      sync_status: "ok",
      fetched_at: fetchedAt,
    }))

    const result = buildResponse(period, liveResults, syntheticRows, {
      dataStatus,
      lastFetchedAt: fetchedAt,
      isRefreshing: false,
      source,
    })
    const response = successResponse(request, result)
    response.headers.set("X-Response-Time", `${elapsed}ms`)
    return response
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}
