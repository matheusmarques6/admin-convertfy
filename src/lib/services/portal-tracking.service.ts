/**
 * Portal Tracking Service
 *
 * Builds the tracking overview payload (stats, recent orders, stores)
 * for a portal client, auto-provisioning tracking_stores when possible.
 *
 * Extracted from portal/tracking/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { encrypt } from "@/lib/crypto"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("PortalTracking")

/**
 * Auto-provision tracking_store from client_stores if needed
 */
async function ensureTrackingStores(
  adminClient: SupabaseClient,
  clientId: string
): Promise<string[]> {
  // Get client_stores for this client
  const { data: clientStores } = await adminClient
    .from("client_stores")
    .select("id, store_name, shopify_store_domain, shopify_access_token, store_url, org_id")
    .eq("client_id", clientId)
    .eq("is_active", true)

  if (!clientStores || clientStores.length === 0) return []

  // Check if tracking_stores already exist for these client_stores
  const clientStoreIds = clientStores.map(cs => cs.id)
  const { data: existing } = await adminClient
    .from("tracking_stores")
    .select("id, client_store_id")
    .in("client_store_id", clientStoreIds)
    .eq("is_active", true)

  if (existing && existing.length > 0) {
    return existing.map(s => s.id)
  }

  // No tracking_stores - try to auto-provision from client_stores with Shopify
  try {
    const shopifyStore = clientStores.find((s) => {
      return !!s.shopify_access_token && !!s.shopify_store_domain
    })

    if (!shopifyStore) return []

    let shopDomain = shopifyStore.shopify_store_domain || ""
    if (!shopDomain && shopifyStore.store_url) {
      shopDomain = shopifyStore.store_url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    }
    if (!shopDomain) return []
    shopDomain = shopDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")

    let accessToken = ""
    try {
      if (shopifyStore.shopify_access_token) {
        const creds = await getStoreCredentials(shopifyStore.id)
        accessToken = creds.shopify_access_token || ""
      }
    } catch {
      log.warn("Could not decrypt Shopify token for auto-provision", { storeId: shopifyStore.id })
    }

    const crypto = await import("crypto")
    const webhookSecret = crypto.randomBytes(32).toString("hex")

    const { data: newStore, error } = await adminClient
      .from("tracking_stores")
      .insert({
        client_store_id: shopifyStore.id,
        org_id: shopifyStore.org_id,
        shop_domain: shopDomain,
        shop_name: shopifyStore.store_name || shopDomain,
        shopify_access_token: accessToken ? encrypt(accessToken) : null,
        webhook_secret: webhookSecret,
        is_active: true,
      })
      .select("id")
      .single()

    if (error) {
      log.error("Error auto-provisioning tracking store", { error })
      return []
    }

    log.info("Auto-provisioned tracking store for dashboard", { storeId: newStore.id, shopDomain })
    return [newStore.id]
  } catch (err) {
    log.error("Auto-provision error in tracking dashboard", err)
    return []
  }
}

export async function buildPortalTracking(opts: {
  clientId: string
  storeId: string | null
  adminClient: SupabaseClient
}): Promise<Record<string, unknown>> {
  const { clientId, storeId, adminClient } = opts

  // Get store IDs (with auto-provision fallback)
  const storeIds = await ensureTrackingStores(adminClient, clientId)

  if (storeIds.length === 0) {
    // Return stores info even if no tracking stores exist yet
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id, store_name, platform, shopify_store_domain, shopify_access_token, is_active")
      .eq("client_id", clientId)

    const stores = (clientStores || []).map((cs) => ({
      client_store_id: cs.id,
      store_name: cs.store_name,
      platform: cs.platform,
      shopify_connected: !!cs.shopify_access_token,
      shopify_store_domain: cs.shopify_store_domain || "",
      tracking_store_id: null,
      tracking_active: false,
      has_17track_key: false,
      last_sync_at: null,
      widget_config: null,
      stats: { orders: 0, pending: 0, delivered: 0 },
    }))

    return {
      stats: { totalOrders: 0, inTransit: 0, delivered: 0, pending: 0, deliveryRate: 0 },
      recentOrders: [],
      stores,
    }
  }

  // Filter by specific store if requested
  const activeStoreIds = storeId
    ? storeIds.filter(id => id === storeId)
    : storeIds

  // Get stats from tracking_codes
  const { data: allCodes } = await adminClient
    .from("tracking_codes")
    .select("status")
    .in("tracking_store_id", activeStoreIds)

  const totalOrders = allCodes?.length || 0
  const delivered = allCodes?.filter((c) => c.status === "delivered").length || 0
  const inTransit = allCodes?.filter((c) =>
    ["in_transit", "out_for_delivery"].includes(c.status)
  ).length || 0
  const pending = allCodes?.filter((c) =>
    ["pending", "info_received"].includes(c.status)
  ).length || 0
  const deliveryRate = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0

  // Get recent orders with tracking
  const { data: recentOrders } = await adminClient
    .from("tracking_orders")
    .select(`
      id, order_name, customer_name, customer_email, total_price, currency,
      financial_status, fulfillment_status, shipped_at, delivered_at,
      order_created_at,
      tracking_codes (
        id, tracking_number, carrier_name, status, status_detail,
        last_event, last_event_at, tracking_events
      )
    `)
    .in("tracking_store_id", activeStoreIds)
    .order("order_created_at", { ascending: false })
    .limit(20)

  // Get client stores info
  const { data: clientStores } = await adminClient
    .from("client_stores")
    .select("id, store_name, platform, shopify_store_domain, shopify_access_token, is_active")
    .eq("client_id", clientId)

  const { data: trackingStores } = await adminClient
    .from("tracking_stores")
    .select("id, client_store_id, is_active, last_sync_at, widget_config, seventeen_track_api_key")
    .in("id", storeIds)

  const stores = (clientStores || []).map((cs) => {
    const ts = trackingStores?.find(t => t.client_store_id === cs.id)
    return {
      client_store_id: cs.id,
      store_name: cs.store_name,
      platform: cs.platform,
      shopify_connected: !!cs.shopify_access_token,
      shopify_store_domain: cs.shopify_store_domain || "",
      tracking_store_id: ts?.id || null,
      tracking_active: ts?.is_active || false,
      has_17track_key: !!ts?.seventeen_track_api_key,
      last_sync_at: ts?.last_sync_at || null,
      widget_config: ts?.widget_config || null,
      stats: { orders: 0, pending: 0, delivered: 0 },
    }
  })

  return {
    stats: { totalOrders, inTransit, delivered, pending, deliveryRate },
    recentOrders: recentOrders || [],
    stores,
  }
}
