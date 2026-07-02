import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { encrypt } from "@/lib/crypto"
import { buildPortalTracking } from "@/lib/services/portal-tracking.service"
import { logger } from "@/lib/logger"
import { getPortalUser } from "@/lib/portal/auth"

const log = logger.child("PortalTracking")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
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

    const payload = await buildPortalTracking({
      clientId: portalUser.client_id,
      storeId,
      adminClient,
    })

    return successResponse(request, payload)
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
