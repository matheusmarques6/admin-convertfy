import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { encrypt, decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { getPortalUser } from "@/lib/portal/auth"

const log = logger.child("PortalTracking")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * Auto-provision tracking_store from client_stores if needed
 */
async function ensureTrackingStores(
  adminClient: ReturnType<typeof createAdminClient>,
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
        accessToken = decrypt(shopifyStore.shopify_access_token) || ""
      }
    } catch {
      // ok
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

/**
 * GET - Get tracking stats and recent orders for the client
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const url = new URL(request.url)
    const storeId = url.searchParams.get("store_id")

    const adminClient = createAdminClient()

    // Get store IDs (with auto-provision fallback)
    const storeIds = await ensureTrackingStores(adminClient, portalUser.client_id)

    if (storeIds.length === 0) {
      // Return stores info even if no tracking stores exist yet
      const { data: clientStores } = await adminClient
        .from("client_stores")
        .select("id, store_name, platform, shopify_store_domain, shopify_access_token, is_active")
        .eq("client_id", portalUser.client_id)

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

      return successResponse(request, {
        stats: { totalOrders: 0, inTransit: 0, delivered: 0, pending: 0, deliveryRate: 0 },
        recentOrders: [],
        stores,
      })
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
      .eq("client_id", portalUser.client_id)

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

    return successResponse(request, {
      stats: { totalOrders, inTransit, delivered, pending, deliveryRate },
      recentOrders: recentOrders || [],
      stores,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalTracking GET")
  }
}

/**
 * POST - Create or update tracking store config
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const { client_store_id, seventeen_track_api_key, widget_config } = body

    if (!client_store_id) {
      throw new AppError("client_store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client
    const { data: clientStore } = await adminClient
      .from("client_stores")
      .select("id, org_id, shopify_store_domain, shopify_access_token, store_name")
      .eq("id", client_store_id)
      .eq("client_id", portalUser.client_id)
      .single()

    if (!clientStore) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Check if tracking store already exists
    const { data: existing } = await adminClient
      .from("tracking_stores")
      .select("id")
      .eq("client_store_id", client_store_id)
      .single()

    const trackingData: Record<string, unknown> = {
      client_store_id,
      org_id: clientStore.org_id,
      shop_domain: clientStore.shopify_store_domain || "",
      shop_name: clientStore.store_name,
      is_active: true,
    }

    // Copy Shopify credentials from client_stores (encrypted)
    if (clientStore.shopify_access_token) {
      trackingData.shopify_access_token = clientStore.shopify_access_token
    }

    if (seventeen_track_api_key) {
      trackingData.seventeen_track_api_key = encrypt(seventeen_track_api_key)
    }

    if (widget_config) {
      trackingData.widget_config = widget_config
    }

    if (existing) {
      // Update
      const { error: updateError } = await adminClient
        .from("tracking_stores")
        .update(trackingData)
        .eq("id", existing.id)

      if (updateError) {
        log.error("Error updating tracking store:", updateError)
        throw new AppError("Erro ao atualizar configuração", 500)
      }
    } else {
      // Generate webhook secret for new stores
      const crypto = await import("crypto")
      trackingData.webhook_secret = crypto.randomBytes(32).toString("hex")

      // Insert
      const { error: insertError } = await adminClient
        .from("tracking_stores")
        .insert(trackingData)

      if (insertError) {
        log.error("Error creating tracking store:", insertError)
        throw new AppError("Erro ao criar configuração", 500)
      }
    }

    return successResponse(request, {
      success: true,
      message: existing ? "Configuração atualizada" : "Rastreamento ativado",
    })
  } catch (error) {
    return errorResponse(request, error, "PortalTracking")
  }
}
