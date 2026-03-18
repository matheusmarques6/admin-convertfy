/**
 * Cached wrappers for Klaviyo metadata (account info + placed order metric).
 *
 * Uses dashboard_cache (DB) as persistent L2 cache so cold starts in Vercel
 * serverless don't waste Klaviyo API calls on data that rarely changes.
 * The original functions in account.ts/metrics.ts still have in-memory L1 cache.
 *
 * IMPORTANT: storeId (UUID from client_stores.id) is required for DB caching.
 * Without it, the DB cache is skipped and only in-memory L1 cache is used.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getCache, setCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { getAccountInfo, type KlaviyoAccountInfo } from "./account"
import { findPlacedOrderMetric } from "./metrics"
import { KlaviyoPermissionError } from "./client"

const log = logger.child("CachedMetadata")

/**
 * Get account info with DB-backed cache (L2).
 * Flow: DB cache → in-memory cache (inside getAccountInfo) → Klaviyo API.
 * Graceful degradation: if DB cache fails or storeId not provided, falls through to API call.
 */
export async function getCachedAccountInfo(
  apiKey: string,
  orgId?: string,
  storeId?: string
): Promise<KlaviyoAccountInfo> {
  if (storeId) {
    const supabase = createAdminClient()
    try {
      const cached = await getCache<KlaviyoAccountInfo>(supabase, storeId, "klaviyo_metadata", "account_info")
      if (cached) {
        log.debug(`[AccountInfo] DB cache HIT for store ${storeId}`)
        return cached.data
      }
    } catch {
      // DB cache unavailable — fall through to API
    }

    log.info(`[AccountInfo] DB cache MISS for store ${storeId}, fetching from API`)
    const accountInfo = await getAccountInfo(apiKey)
    setCache(supabase, storeId, "klaviyo_metadata", "account_info", accountInfo as unknown as Record<string, unknown>).catch(() => {})
    return accountInfo
  }

  // No storeId — skip DB cache, rely on in-memory L1 cache only
  return getAccountInfo(apiKey)
}

/**
 * Get Placed Order metric ID with DB-backed cache (L2).
 * Flow: DB cache → in-memory cache (inside findPlacedOrderMetric) → Klaviyo API.
 * Graceful degradation: if DB cache fails or storeId not provided, falls through to API call.
 */
export async function getCachedPlacedOrderMetric(
  apiKey: string,
  orgId?: string,
  storeId?: string
): Promise<string | null> {
  const supabase = storeId ? createAdminClient() : null

  if (storeId && supabase) {
    try {
      const cached = await getCache<{ metricId: string | null }>(supabase, storeId, "klaviyo_metadata", "placed_order_metric")
      if (cached) {
        log.debug(`[PlacedOrderMetric] DB cache HIT for store ${storeId}`)
        return cached.data.metricId
      }
    } catch {
      // DB cache unavailable — fall through to API
    }
    log.info(`[PlacedOrderMetric] DB cache MISS for store ${storeId}, fetching from API`)
  }

  let metricId: string | null = null
  try {
    metricId = await findPlacedOrderMetric(apiKey)
  } catch (err) {
    // Re-throw non-retryable errors — must not be silenced
    if (err instanceof KlaviyoPermissionError) throw err
    log.warn(`[PlacedOrderMetric] Klaviyo API call failed for key ...${apiKey.slice(-4)}:`, err)
    return null
  }

  if (!metricId) {
    log.warn(`[PlacedOrderMetric] Klaviyo API returned no Placed Order metric for key ...${apiKey.slice(-4)}. This blocks all revenue fetching.`)
  }

  // Only cache in DB when metricId was found and storeId is available
  if (metricId && storeId && supabase) {
    setCache(supabase, storeId, "klaviyo_metadata", "placed_order_metric", { metricId } as unknown as Record<string, unknown>).catch(() => {})
  }

  return metricId
}
