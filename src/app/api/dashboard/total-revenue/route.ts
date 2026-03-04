import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { type DataStatus, type DataStatusMeta, CACHED_PERIODS } from "@/lib/shared/data-status"
import { getKlaviyoRevenueForStore } from "@/lib/integrations/klaviyo/report-summary"
import { withConcurrencyLimit } from "@/lib/integrations/klaviyo/rate-limiter"
import { convertToBRL } from "@/lib/services/exchange-rate.service"
import { KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"

const log = logger.child("TotalRevenue")

const LIVE_FETCH_TIMEOUT_MS = 50_000

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

type EnhancedTotalRevenueResponse = TotalRevenueResponse & DataStatusMeta

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
  client_id: string | null
  clients: { name: string } | null
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
  meta: DataStatusMeta,
  storesCount: number,
): EnhancedTotalRevenueResponse {
  // Aggregate using BRL-converted values so multi-currency stores sum correctly
  const totalRevenue = storeBreakdown.reduce((sum, s) => sum + s.totalRevenueBRL, 0)
  const campaignRevenue = storeBreakdown.reduce((sum, s) => sum + s.campaignRevenueBRL, 0)
  const flowRevenue = storeBreakdown.reduce((sum, s) => sum + s.flowRevenueBRL, 0)
  const storesWithRevenue = storeBreakdown.filter((s) => s.totalRevenueBRL > 0).length

  // Sort by BRL value for fair ranking across currencies
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
  customStartDate?: string | null,
  customEndDate?: string | null,
): Promise<{ results: StoreRevenue[]; fetchedAt: string | null; timedOut: boolean; hasStale: boolean }> {
  // Shared collector: stores push results as they complete.
  // On timeout, we return whatever has been collected so far instead of nothing.
  const collected: StoreRevenue[] = []

  async function fetchOneStore(store: StoreRow): Promise<void> {
    try {
      const result = await getKlaviyoRevenueForStore(
        store.id, period,
        customStartDate || undefined, customEndDate || undefined,
      )

      if (!result.success || !result.data) {
        log.warn(`[LiveFetch] Failed for ${store.store_name}: ${result.error}`)
        // Live fetch error upsert — campos limitados (nao inclui audience/store_total_revenue do cron)
        if ((CACHED_PERIODS as readonly string[]).includes(period)) {
          Promise.resolve(
            adminSupabase
              .from("store_revenue_summary")
              .upsert({
                store_id: store.id,
                org_id: store.org_id || null,
                period_label: period,
                klaviyo_total_revenue: 0,
                klaviyo_campaign_revenue: 0,
                klaviyo_flow_revenue: 0,
                currency: "BRL",
                sync_status: "error",
                sync_source: "live",
                sync_error: result.error || "Unknown error",
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                fetched_at: new Date().toISOString(),
              }, { onConflict: "store_id,period_label" })
          ).catch((e) => log.warn(`[LiveFetch] Error cache upsert failed for ${store.store_name}:`, e))
        }
        return
      }

      const revenue = result.data

      // Convert to BRL for aggregation
      const [totalBRL, campaignBRL, flowBRL] = await Promise.all([
        convertToBRL(revenue.totalRevenue, revenue.currency),
        convertToBRL(revenue.campaignRevenue, revenue.currency),
        convertToBRL(revenue.flowRevenue, revenue.currency),
      ])

      // Live fetch upsert — campos limitados ao escopo do live fetch.
      // Campos exclusivos do cron (total_leads, engaged_leads, store_total_revenue)
      // NAO sao incluidos aqui para evitar sobrescrita.
      // Se no futuro o live fetch precisar desses campos, usar UPDATE condicional.
      if ((CACHED_PERIODS as readonly string[]).includes(period)) {
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
              currency: revenue.currency,
              sync_status: "ok",
              sync_source: "live",
              sync_error: null,
              expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              fetched_at: new Date().toISOString(),
              // NAO incluir: store_total_revenue, total_leads, engaged_leads
              // Esses campos sao exclusivos do cron sync
            }, { onConflict: "store_id,period_label" })
        )
          .then(() => log.info(`[LiveFetch] Cached revenue for ${store.store_name}/${period} (${revenue.currency} ${revenue.totalRevenue})`))
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
        currency: revenue.currency,
        totalRevenueBRL: totalBRL,
        campaignRevenueBRL: campaignBRL,
        flowRevenueBRL: flowBRL,
      })

      log.info(`[LiveFetch] Completed store ${store.store_name}: ${revenue.currency} ${revenue.totalRevenue} → BRL ${totalBRL}`)
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

    // Identify stores that did not complete within the timeout
    const collectedStoreIds = new Set(collected.map(c => c.storeId))
    const timedOutStores = stores.filter(s => !collectedStoreIds.has(s.id))

    if (timedOutStores.length > 0) {
      log.warn("[LiveFetch] Stores timed out:", {
        timedOut: timedOutStores.map(s => s.store_name),
        timeout: `${LIVE_FETCH_TIMEOUT_MS}ms`,
      })

      // Fire-and-forget: mark timed out stores in cache with short TTL for retry
      if ((CACHED_PERIODS as readonly string[]).includes(period)) {
        for (const store of timedOutStores) {
          Promise.resolve(
            adminSupabase
              .from("store_revenue_summary")
              .upsert({
                store_id: store.id,
                org_id: store.org_id || null,
                period_label: period,
                klaviyo_total_revenue: 0,
                klaviyo_campaign_revenue: 0,
                klaviyo_flow_revenue: 0,
                currency: "BRL",
                sync_status: "error",
                sync_source: "live",
                sync_error: `Live fetch timeout (${LIVE_FETCH_TIMEOUT_MS / 1000}s)`,
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // retry in 5min
                fetched_at: new Date().toISOString(),
                // NAO incluir: store_total_revenue, total_leads, engaged_leads
              }, { onConflict: "store_id,period_label" })
          )
            .then(() => log.info(`[LiveFetch] Marked ${store.store_name} as timed out`))
            .catch(() => {}) // best-effort
        }
      }
    }
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
    const customStartDate = request.nextUrl.searchParams.get("start_date") || null
    const customEndDate = request.nextUrl.searchParams.get("end_date") || null

    // Resolve org for tenant isolation
    const orgId = await resolveOrgId(user.id)

    // ── Step 1: Try cache (skip if force_refresh or custom date range) ──
    const isCustomRange = period === "custom" && !!customStartDate && !!customEndDate
    if (!forceRefresh && !isCustomRange) {
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
        // Cache HIT — query real store count for accurate storesCount
        const adminForCount = createAdminClient()
        const { count: totalKlaviyoStores } = await adminForCount
          .from("client_stores")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .or(KLAVIYO_CREDENTIALS_FILTER)

        const storeBreakdown = await buildStoreBreakdown(rows)
        const realStoresCount = totalKlaviyoStores ?? storeBreakdown.length
        const elapsed = Date.now() - startTime
        log.info("[CacheStrategy]", {
          endpoint: "total-revenue",
          period,
          storesCount: realStoresCount,
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
        }, realStoresCount)
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
      .or(KLAVIYO_CREDENTIALS_FILTER)

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
      await liveFetchWithTimeout(stores, period, adminSupabase, customStartDate, customEndDate)

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
    // Include "error" rows for timed out stores so hasPartialData is true
    const syntheticRows: Array<{ sync_status: string; fetched_at: string | null }> = [
      ...liveResults.map(() => ({
        sync_status: "ok" as string,
        fetched_at: fetchedAt,
      })),
      ...(timedOut
        ? Array.from({ length: stores.length - liveResults.length }, () => ({
            sync_status: "error" as string,
            fetched_at: fetchedAt,
          }))
        : []),
    ]

    const result = buildResponse(period, liveResults, syntheticRows, {
      dataStatus,
      lastFetchedAt: fetchedAt,
      isRefreshing: false,
      source,
    }, stores.length)
    const response = successResponse(request, result)
    response.headers.set("X-Response-Time", `${elapsed}ms`)
    return response
  } catch (error) {
    return errorResponse(request, error, "TotalRevenue GET")
  }
}
