/**
 * Portal Shopify Cache Service
 *
 * Reads Shopify data from dashboard_cache, maps it to the portal
 * response format, and triggers background syncs on cache miss.
 *
 * Extracted from portal/dashboard/route.ts — Story 54.6 (AC 54.6.2)
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { CACHE_VERSION } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { syncShopifyForStore } from "@/lib/services/shopify-sync.service"
import { tryAcquireLiveFetch, releaseLiveFetch } from "@/lib/services/fetch-cooldown.service"

const log = logger.child("PortalShopifyCache")

// Cache TTL in minutes based on period (used for Shopify dashboard_cache only)
const CACHE_TTL: Record<string, number> = {
  "1d": 60,
  "7d": 120,
  "15d": 180,
  "30d": 240,
  "90d": 360,
  "12m": 360,
}

/** Result of reading Shopify cache: data + whether a background sync was triggered */
export interface ShopifyCacheReadResult {
  data: Record<string, unknown> | null
  /** true when cache was empty/expired and a background sync was kicked off */
  isSyncing: boolean
}

/** Store shape needed by Shopify cache functions */
export interface ShopifyStoreInfo {
  id: string
  shopify_access_token: string | null
  shopify_store_domain: string | null
}

// ─── getCachedShopifyData ───────────────────────────────────────────────────

export async function getCachedShopifyData(
  adminClient: SupabaseClient,
  storeId: string,
  period: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await adminClient
      .from("dashboard_cache")
      .select("data, expires_at")
      .eq("store_id", storeId)
      .eq("cache_type", "shopify")
      .eq("period", period)
      .maybeSingle()

    if (data && new Date(data.expires_at) > new Date()) {
      const cached = data.data as Record<string, unknown>
      if ((cached._cacheVersion as number) !== CACHE_VERSION) {
        return null
      }
      return cached
    }
    return null
  } catch {
    return null
  }
}

// ─── saveShopifyToCache ─────────────────────────────────────────────────────

export async function saveShopifyToCache(
  adminClient: SupabaseClient,
  storeId: string,
  period: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const ttlMinutes = CACHE_TTL[period] || 30
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()

    await adminClient
      .from("dashboard_cache")
      .upsert({
        store_id: storeId,
        cache_type: "shopify",
        period,
        data: { ...data, _cacheVersion: CACHE_VERSION },
        expires_at: expiresAt,
      }, {
        onConflict: "store_id,cache_type,period"
      })
  } catch (error) {
    log.error(`[Cache ERROR] Failed to save shopify for store ${storeId}:`, error)
  }
}

// ─── fetchShopifyData: cache-only read, background sync on miss (Story 54.5) ─

export async function fetchShopifyData(
  store: ShopifyStoreInfo,
  period: string,
  adminClient: SupabaseClient,
): Promise<ShopifyCacheReadResult> {
  if (!(store.shopify_access_token && store.shopify_store_domain)) {
    return { data: null, isSyncing: false }
  }

  const cached = await getCachedShopifyData(adminClient, store.id, period)
  if (cached) return { data: cached, isSyncing: false }

  // Cache miss — fire background sync (fire-and-forget, does NOT block response)
  const shopifyFetchKey = `shopify_${period}`
  const canFetch = await tryAcquireLiveFetch(adminClient, store.id, shopifyFetchKey, "portal-shopify")

  if (canFetch) {
    // Fire-and-forget: sync runs in background, result saved to cache.
    // Next portal request will pick up the cached data.
    // NOTE (AC 54.5.3): Shopify is NOT included in the Klaviyo cron (sync-reports).
    // Decision: Shopify data volume per-store is small and period-dependent,
    // making on-demand background sync more appropriate than cron pre-population.
    // This may be revisited in a future story if Shopify data freshness becomes critical.
    syncShopifyForStore(store.id, period)
      .then(async (result) => {
        if (result.success && result.data) {
          await saveShopifyToCache(adminClient, store.id, period, result.data as unknown as Record<string, unknown>)
          await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "completed")
          log.info(`[Portal] Shopify background sync completed for store ${store.id}`)
        } else {
          await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "failed")
          log.warn(`[Portal] Shopify background sync returned no data for store ${store.id}`)
        }
      })
      .catch(async (error) => {
        await releaseLiveFetch(adminClient, store.id, shopifyFetchKey, "failed").catch(() => {})
        log.error(`[Portal] Shopify background sync failed for store ${store.id}:`, error)
      })
  }

  return { data: null, isSyncing: true }
}

// ─── mapShopifyData: transforms cached Shopify data to portal format ────────

export function mapShopifyData(shopifyData: Record<string, unknown>) {
  const orders = shopifyData.orders as Record<string, unknown> || {}
  const customers = shopifyData.customers as Record<string, unknown> || {}
  const coupons = orders.coupons as Record<string, unknown> || {}
  const utmConversions = orders.utmConversions as Record<string, unknown> || {}
  const topCustomers = (orders.topCustomers as Array<Record<string, unknown>>) || []

  return {
    totalRevenue: (orders.totalRevenue as number) || 0,
    totalOrders: (orders.totalOrders as number) || 0,
    paidOrders: (orders.paidOrders as number) || 0,
    averageOrderValue: (orders.averageOrderValue as number) || 0,
    totalCustomers: (customers.totalCustomers as number) || 0,
    newCustomers: (customers.newCustomersLast30Days as number) || 0,
    recurringCustomerRate: (orders.recurringCustomerRate as number) || 0,
    topProducts: ((shopifyData.bestSellingProducts as Array<Record<string, unknown>>) || []).slice(0, 10).map((p) => ({
      name: (p.title as string) || "Unknown Product",
      quantity: (p.quantitySold as number) || 0,
      revenue: (p.revenue as number) || 0,
    })),
    topCustomers: topCustomers.slice(0, 10).map((c) => ({
      email: (c.email as string) || "",
      name: (c.name as string) || "",
      ordersCount: (c.ordersCount as number) || 0,
      totalSpent: (c.totalSpent as number) || 0,
      averageOrderValue: (c.averageOrderValue as number) || 0,
      lastOrderDate: (c.lastOrderDate as string) || "",
    })),
    coupons: {
      totalOrdersWithCoupon: (coupons.totalOrdersWithCoupon as number) || 0,
      couponUsageRate: (coupons.couponUsageRate as number) || 0,
      topCoupons: (coupons.topCoupons as Array<Record<string, unknown>>) || [],
      totalDiscount: (coupons.totalDiscount as number) || 0,
    },
    utmConversions: {
      totalOrdersWithUtm: (utmConversions.totalOrdersWithUtm as number) || 0,
      utmTrackingRate: (utmConversions.utmTrackingRate as number) || 0,
      bySource: (utmConversions.bySource as Array<Record<string, unknown>>) || [],
      byMedium: (utmConversions.byMedium as Array<Record<string, unknown>>) || [],
      byCampaign: (utmConversions.byCampaign as Array<Record<string, unknown>>) || [],
    },
  }
}

/** Return type of mapShopifyData for use in aggregation */
export type PortalShopifyData = ReturnType<typeof mapShopifyData>
