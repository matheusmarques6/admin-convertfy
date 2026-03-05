/**
 * Cached wrappers for Klaviyo metadata (account info + placed order metric).
 *
 * Uses dashboard_cache (DB) as persistent L2 cache so cold starts in Vercel
 * serverless don't waste Klaviyo API calls on data that rarely changes.
 * The original functions in account.ts/metrics.ts still have in-memory L1 cache.
 */

import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { getCache, setCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { getAccountInfo, type KlaviyoAccountInfo } from "./account"
import { findPlacedOrderMetric } from "./metrics"
import { KlaviyoPermissionError } from "./client"

const log = logger.child("CachedMetadata")

/**
 * Derive a collision-resistant cache key from a Klaviyo API key.
 * Uses SHA-256 (first 16 hex chars = 64 bits of entropy) so two different
 * Klaviyo accounts never share the same cache entry, even across orgs.
 * The full key is never stored — only its hash.
 */
function cacheKeyFromApiKey(apiKey: string): string {
  const hash = createHash("sha256").update(apiKey).digest("hex")
  return `kl_${hash.slice(0, 16)}`
}

/**
 * Get account info with DB-backed cache (L2).
 * Flow: DB cache → in-memory cache (inside getAccountInfo) → Klaviyo API.
 * Graceful degradation: if DB cache fails, falls through to API call.
 */
export async function getCachedAccountInfo(
  apiKey: string,
  orgId?: string
): Promise<KlaviyoAccountInfo> {
  const storeKey = cacheKeyFromApiKey(apiKey)
  const supabase = createAdminClient()

  try {
    const cached = await getCache<KlaviyoAccountInfo>(supabase, storeKey, "klaviyo_metadata", "account_info")
    if (cached) return cached.data
  } catch {
    // DB cache unavailable — fall through to API
  }

  const accountInfo = await getAccountInfo(apiKey)

  // Save to DB cache in background (don't block the response)
  setCache(supabase, storeKey, "klaviyo_metadata", "account_info", accountInfo as unknown as Record<string, unknown>, orgId).catch(() => {})

  return accountInfo
}

/**
 * Get Placed Order metric ID with DB-backed cache (L2).
 * Flow: DB cache → in-memory cache (inside findPlacedOrderMetric) → Klaviyo API.
 * Graceful degradation: if DB cache fails, falls through to API call.
 */
export async function getCachedPlacedOrderMetric(
  apiKey: string,
  orgId?: string
): Promise<string | null> {
  const storeKey = cacheKeyFromApiKey(apiKey)
  const supabase = createAdminClient()

  try {
    const cached = await getCache<{ metricId: string | null }>(supabase, storeKey, "klaviyo_metadata", "placed_order_metric")
    if (cached) return cached.data.metricId
  } catch {
    // DB cache unavailable — fall through to API
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

  // Only cache in DB when metricId was found — avoid persisting null from API failures
  if (metricId) {
    setCache(supabase, storeKey, "klaviyo_metadata", "placed_order_metric", { metricId } as unknown as Record<string, unknown>, orgId).catch(() => {})
  }

  return metricId
}
