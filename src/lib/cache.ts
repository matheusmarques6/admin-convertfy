import { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("Cache")

// Bump this version to invalidate all cached data when calculation logic changes
export const CACHE_VERSION = 5

// TTL in minutes per cache type and period
// Klaviyo TTLs are longer because:
// 1. Reporting data doesn't change frequently (campaigns/flows processed in batches)
// 2. Klaviyo has strict rate limits (~1 req/s for reports, 75 req/min general)
// 3. With many stores, frequent cache misses cause 429 storms
const CACHE_TTL: Record<string, Record<string, number>> = {
  klaviyo: { "7d": 120, "15d": 180, "30d": 240, "90d": 360, all: 360 },
  klaviyo_perf: { "1d": 60, "7d": 120, "15d": 180, "30d": 240, "90d": 360, "12m": 360 },
  shopify: { "7d": 15, "15d": 20, "30d": 30, "90d": 60, all: 60 },
  ga4: { "7d": 15, "15d": 20, "30d": 30, "90d": 60, all: 60 },
  asaas_payments: { "7d": 10, "15d": 15, "30d": 30, "90d": 60, all: 60 },
  asaas_billing: { "7d": 10, "15d": 15, "30d": 30, "90d": 60, all: 60 },
  client_performance: { today: 30, yesterday: 60, "7d": 120, "15d": 180, "30d": 240 },
  klaviyo_metadata: { account_info: 30, placed_order_metric: 30 },
}

// How long (in minutes) expired cache entries are still usable as fallback
// when a fresh fetch fails (e.g. rate limited). This prevents showing empty data
// when Klaviyo rate limits us.
const STALE_GRACE_MINUTES: Record<string, number> = {
  klaviyo: 1440,         // 24 hours
  klaviyo_perf: 1440,    // 24 hours
  client_performance: 720, // 12 hours
  shopify: 360,          // 6 hours
}

function getTTLMinutes(cacheType: string, period: string): number {
  return CACHE_TTL[cacheType]?.[period] ?? 30
}

export interface CacheResult<T = Record<string, unknown>> {
  data: T
  cachedAt: string
  fromCache: true
}

/**
 * Check dashboard_cache for a cached response.
 * Returns the cached data if valid, or null if expired/missing.
 */
export async function getCache<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  storeId: string,
  cacheType: string,
  period: string
): Promise<CacheResult<T> | null> {
  try {
    const { data: cached } = await supabase
      .from("dashboard_cache")
      .select("data, created_at")
      .eq("store_id", storeId)
      .eq("cache_type", cacheType)
      .eq("period", period)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (cached?.data) {
      // Check cache version - skip old entries when calculation logic changes
      const cachedData = cached.data as Record<string, unknown>
      if ((cachedData._cacheVersion as number) !== CACHE_VERSION) {
        log.info(`[Cache SKIP] Outdated version for ${cacheType}/${period} store ${storeId}`)
        return null
      }
      log.debug(`[Cache HIT] ${cacheType}/${period} for store ${storeId}`)
      return {
        data: cached.data as T,
        cachedAt: cached.created_at,
        fromCache: true,
      }
    }
  } catch {
    // Cache miss or error — proceed to live fetch
  }

  log.debug(`[Cache MISS] ${cacheType}/${period} for store ${storeId}`)
  return null
}

/**
 * Get stale (expired) cached data as a fallback when a fresh fetch fails.
 * Returns data that expired within the STALE_GRACE period (default 24h for Klaviyo).
 * This prevents showing empty data when rate limited by external APIs.
 */
export async function getStaleCache<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  storeId: string,
  cacheType: string,
  period: string
): Promise<CacheResult<T> | null> {
  try {
    const graceMinutes = STALE_GRACE_MINUTES[cacheType] ?? 360
    const staleThreshold = new Date(Date.now() - graceMinutes * 60 * 1000).toISOString()

    const { data: cached } = await supabase
      .from("dashboard_cache")
      .select("data, created_at, expires_at")
      .eq("store_id", storeId)
      .eq("cache_type", cacheType)
      .eq("period", period)
      .gt("expires_at", staleThreshold) // Expired but within grace period
      .single()

    if (cached?.data) {
      const cachedData = cached.data as Record<string, unknown>
      if ((cachedData._cacheVersion as number) !== CACHE_VERSION) {
        return null
      }
      log.info(`[Cache STALE] Using expired ${cacheType}/${period} for store ${storeId} (expired at ${cached.expires_at})`)
      return {
        data: cached.data as T,
        cachedAt: cached.created_at,
        fromCache: true,
      }
    }
  } catch {
    // No stale data available
  }

  return null
}

/**
 * Save a response to dashboard_cache with appropriate TTL.
 */
export async function setCache(
  supabase: SupabaseClient,
  storeId: string,
  cacheType: string,
  period: string,
  data: Record<string, unknown>,
  orgId?: string
): Promise<void> {
  const ttlMinutes = getTTLMinutes(cacheType, period)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

  try {
    await supabase.from("dashboard_cache").upsert(
      {
        store_id: storeId,
        cache_type: cacheType,
        period,
        data: { ...data, _cacheVersion: CACHE_VERSION },
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        ...(orgId && { org_id: orgId }),
      },
      { onConflict: "store_id,cache_type,period" }
    )
    log.debug(`[Cache SET] ${cacheType}/${period} for store ${storeId} (TTL: ${ttlMinutes}min)`)
  } catch (error) {
    log.warn(`[Cache SET FAILED] ${cacheType}/${period}:`, error)
  }
}

/**
 * Delete all expired entries from dashboard_cache.
 * Called by cron job to keep the table clean.
 */
export async function cleanExpiredCache(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("dashboard_cache")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("store_id")

    if (error) {
      log.warn("[Cache CLEANUP FAILED]:", error)
      return 0
    }

    const count = data?.length || 0
    if (count > 0) {
      log.debug(`[Cache CLEANUP] Removed ${count} expired entries`)
    }
    return count
  } catch (error) {
    log.warn("[Cache CLEANUP ERROR]:", error)
    return 0
  }
}

/**
 * Invalidate cache entries for a specific store and type.
 */
export async function invalidateCache(
  supabase: SupabaseClient,
  storeId: string,
  cacheType: string
): Promise<void> {
  try {
    await supabase
      .from("dashboard_cache")
      .delete()
      .eq("store_id", storeId)
      .eq("cache_type", cacheType)
    log.debug(`[Cache INVALIDATED] ${cacheType} for store ${storeId}`)
  } catch (error) {
    log.warn(`[Cache INVALIDATE FAILED]:`, error)
  }
}
