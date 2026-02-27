import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { encrypt } from "@/lib/crypto"
import { getPortalUser } from "@/lib/portal/auth"
import { logger } from "@/lib/logger"

const log = logger.child("PortalTracking")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET - Get tracking store config and stats for active store
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

    // Get the client stores
    const storeQuery = adminClient
      .from("client_stores")
      .select("id, store_name, platform, shopify_store_domain, shopify_access_token, is_active")
      .eq("client_id", portalUser.client_id)

    if (storeId) {
      storeQuery.eq("id", storeId)
    }

    const { data: clientStores, error: storesError } = await storeQuery

    if (storesError) {
      log.error("Error fetching client stores:", storesError)
      throw new AppError("Erro ao buscar lojas", 500)
    }

    // For each client store, check if there's a tracking store configured
    const stores = await Promise.all(
      (clientStores || []).map(async (cs) => {
        const { data: trackingStore } = await adminClient
          .from("tracking_stores")
          .select("id, is_active, last_sync_at, widget_config, seventeen_track_api_key")
          .eq("client_store_id", cs.id)
          .single()

        // Get order and code counts
        let orderCount = 0
        let pendingCount = 0
        let deliveredCount = 0

        if (trackingStore) {
          const { count: total } = await adminClient
            .from("tracking_orders")
            .select("id", { count: "exact", head: true })
            .eq("tracking_store_id", trackingStore.id)

          const { count: pending } = await adminClient
            .from("tracking_codes")
            .select("id", { count: "exact", head: true })
            .eq("tracking_store_id", trackingStore.id)
            .in("status", ["pending", "in_transit", "pick_up"])

          const { count: delivered } = await adminClient
            .from("tracking_codes")
            .select("id", { count: "exact", head: true })
            .eq("tracking_store_id", trackingStore.id)
            .eq("status", "delivered")

          orderCount = total || 0
          pendingCount = pending || 0
          deliveredCount = delivered || 0
        }

        return {
          client_store_id: cs.id,
          store_name: cs.store_name,
          platform: cs.platform,
          shopify_connected: !!cs.shopify_access_token,
          shopify_store_domain: cs.shopify_store_domain || "",
          tracking_store_id: trackingStore?.id || null,
          tracking_active: trackingStore?.is_active || false,
          has_17track_key: !!trackingStore?.seventeen_track_api_key,
          last_sync_at: trackingStore?.last_sync_at || null,
          widget_config: trackingStore?.widget_config || null,
          stats: {
            orders: orderCount,
            pending: pendingCount,
            delivered: deliveredCount,
          },
        }
      })
    )

    return successResponse(request, { stores })
  } catch (error) {
    return errorResponse(request, error, "PortalTracking")
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
