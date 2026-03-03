import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { type DataStatus, type DataStatusMeta, CACHED_PERIODS } from "@/lib/shared/data-status"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { withConcurrencyLimit } from "@/lib/integrations/klaviyo/rate-limiter"

const log = logger.child("TotalRevenue")

const LIVE_FETCH_TIMEOUT_MS = 50_000

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

// ── Live fetch with partial results on timeout ────────────────────────────

async function liveFetchWithTimeout(
  stores: StoreRow[],
  period: string,
  adminSupabase: SupabaseClient,
): Promise<{ results: StoreRevenue[]; fetchedAt: string | null; timedOut: boolean; hasStale: boolean }> {
  // Shared collector: stores push results as they complete.
  // On timeout, we return whatever has been collected so far instead of nothing.
  const collected: StoreRevenue[] = []

  async function fetchOneStore(store: StoreRow): Promise<void> {
    try {
      const revenue = await getKlaviyoRevenueForStore(store.id, period)

      // Fire-and-forget: save revenue to cache for next request
      if (revenue.totalRevenue > 0 && (CACHED_PERIODS as readonly string[]).includes(period)) {
        Promise.resolve(
          adminSupabase
            .from("store_revenue_summary")
            .upsert({
              store_id: store.id,
              org_id: store.org_id || null,
              period_label: period,
              klaviyo_total_revenue: revenue.totalRevenue,
              klaviyo_campaign_revenue: revenue.campaignRevenue,
              klaviyo_flow_revenue: revenue.flowRevenue,
              sync_status: "ok",
              sync_error: null,
              expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              fetched_at: new Date().toISOString(),
            }, { onConflict: "store_id,period_label" })
        )
          .then(() => log.info(`[LiveFetch] Cached revenue for ${store.store_name}/${period}`))
          .catch((e) => log.warn(`[LiveFetch] Cache upsert failed for ${store.store_name}:`, e))
      }

      collected.push({
        storeId: store.id,
        storeName: store.store_name || "Loja sem nome",
        clientName: store.client_id
          ? (store.clients?.name || "Cliente desconhecido")
          : store.store_name || "Loja avulsa",
        totalRevenue: revenue.totalRevenue,
        campaignRevenue: revenue.campaignRevenue,
        flowRevenue: revenue.flowRevenue,
      })

      log.info(`[LiveFetch] Completed store ${store.store_name}: $${revenue.totalRevenue}`)
    } catch (err) {
      log.warn(`[LiveFetch] Error for store ${store.store_name}:`, err)
    }
  }

  // Process stores in parallel (max 5 concurrent) using lightweight revenue fetcher.
  // withConcurrencyLimit returns void[] here — we intentionally ignore its return value
  // and use the `collected` side-channel array so partial results survive a timeout.
  // Array.push is safe from multiple async workers because JS is single-threaded.
  const allDonePromise = withConcurrencyLimit(stores, 5, fetchOneStore)

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), LIVE_FETCH_TIMEOUT_MS)
  })

  const raceResult = await Promise.race([
    allDonePromise.then(() => "done" as const),
    timeoutPromise,
  ])

  const timedOut = raceResult === "timeout"
  if (timedOut) {
    log.warn(`[LiveFetch] Timed out after ${LIVE_FETCH_TIMEOUT_MS}ms — returning ${collected.length}/${stores.length} partial results`)
  }

  const fetchedAt = collected.length > 0 ? new Date().toISOString() : null
  return { results: collected, fetchedAt, timedOut, hasStale: timedOut }
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

    // Live fetch with timeout (returns partial results if some stores complete)
    const { results: liveResults, fetchedAt, timedOut } =
      await liveFetchWithTimeout(stores, period, adminSupabase)

    const elapsed = Date.now() - startTime

    if (liveResults.length === 0) {
      // No results at all (timed out or all stores failed)
      log.warn("[CacheStrategy]", {
        endpoint: "total-revenue",
        period,
        storesCount: stores.length,
        cacheHits: 0,
        cacheMisses: stores.length,
        liveFetches: 0,
        source: "live",
        elapsed: `${elapsed}ms`,
        timedOut,
      })
      const result = emptyResponse(period, stores.length, {
        dataStatus: timedOut ? "stale" : "error",
        lastFetchedAt: null,
        isRefreshing: false,
        source: "live",
      })
      const response = successResponse(request, result)
      response.headers.set("X-Response-Time", `${elapsed}ms`)
      return response
    }

    const source = "live" as const
    // Partial results (some stores completed, some didn't) still show data
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
