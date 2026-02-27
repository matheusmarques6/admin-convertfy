import { NextRequest } from "next/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { encrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("PortalIntegrations")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * Helper: get authenticated portal user with client_id
 */
async function getPortalUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()
  const { data: portalUser } = await adminClient
    .from("client_portal_users")
    .select("client_id, permissions")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .single()

  return portalUser
}

/**
 * GET - Get integration status for the active store
 * Returns boolean flags (never actual credentials) + tracking config
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

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client
    const { data: store, error: storeError } = await adminClient
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        shopify_store_domain,
        shopify_access_token,
        klaviyo_api_key,
        klaviyo_private_key,
        klaviyo_public_key,
        integration_status
      `)
      .eq("id", storeId)
      .eq("client_id", portalUser.client_id)
      .single()

    if (storeError || !store) {
      throw new AppError("Loja não encontrada", 404)
    }

    // Check tracking store config
    const { data: trackingStore } = await adminClient
      .from("tracking_stores")
      .select("id, is_active, seventeen_track_api_key, widget_config, last_sync_at")
      .eq("client_store_id", storeId)
      .single()

    // SECURITY: Return only boolean flags for credentials, never actual values
    const integrationStatus = (store.integration_status as Record<string, unknown>) || {}

    return successResponse(request, {
      store: {
        id: store.id,
        store_name: store.store_name,
        platform: store.platform,
        store_url: store.store_url,
        shopify_store_domain: store.shopify_store_domain || "",
      },
      integrations: {
        shopify: {
          connected: !!store.shopify_access_token,
          domain: store.shopify_store_domain || "",
          connected_at: (integrationStatus.shopify as Record<string, string>)?.connected_at || null,
        },
        klaviyo: {
          connected: !!(store.klaviyo_private_key || store.klaviyo_api_key),
          has_public_key: !!store.klaviyo_public_key,
          connected_at: (integrationStatus.klaviyo as Record<string, string>)?.connected_at || null,
        },
        tracking: {
          active: trackingStore?.is_active || false,
          tracking_store_id: trackingStore?.id || null,
          has_17track_key: !!trackingStore?.seventeen_track_api_key,
          widget_config: trackingStore?.widget_config || null,
          last_sync_at: trackingStore?.last_sync_at || null,
        },
      },
    })
  } catch (error) {
    return errorResponse(request, error, "PortalIntegrations")
  }
}

/**
 * PUT - Update integration credentials for the active store
 * Supports saving Shopify, Klaviyo, and Tracking (17track) credentials
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const {
      store_id,
      integration_type,
      // Shopify fields
      shopify_store_domain,
      shopify_access_token,
      // Klaviyo fields
      klaviyo_private_key,
      klaviyo_public_key,
      // Tracking fields
      activate_tracking,
      widget_config,
    } = body

    if (!store_id || !integration_type) {
      throw new AppError("store_id e integration_type são obrigatórios", 400)
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client
    const { data: store } = await adminClient
      .from("client_stores")
      .select("id, client_id, org_id, integration_status, store_name, shopify_store_domain, shopify_access_token")
      .eq("id", store_id)
      .eq("client_id", portalUser.client_id)
      .single()

    if (!store) {
      throw new AppError("Loja não encontrada", 404)
    }

    const currentStatus = (store.integration_status as Record<string, unknown>) || {}

    if (integration_type === "shopify") {
      const updateData: Record<string, unknown> = {}

      if (shopify_store_domain) {
        updateData.shopify_store_domain = shopify_store_domain
      }
      if (shopify_access_token) {
        updateData.shopify_access_token = encrypt(shopify_access_token)
        updateData.integration_status = {
          ...currentStatus,
          shopify: { connected: true, connected_at: new Date().toISOString() },
        }
      }

      if (Object.keys(updateData).length === 0) {
        throw new AppError("Nenhuma credencial informada", 400)
      }

      const { error: updateError } = await adminClient
        .from("client_stores")
        .update(updateData)
        .eq("id", store_id)

      if (updateError) {
        log.error("Error updating Shopify credentials:", updateError)
        throw new AppError("Erro ao salvar credenciais Shopify", 500)
      }

      return successResponse(request, { success: true, message: "Credenciais Shopify atualizadas" })
    }

    if (integration_type === "klaviyo") {
      const updateData: Record<string, unknown> = {}

      if (klaviyo_private_key) {
        updateData.klaviyo_private_key = encrypt(klaviyo_private_key)
        updateData.klaviyo_api_key = encrypt(klaviyo_private_key)
        updateData.integration_status = {
          ...currentStatus,
          klaviyo: { connected: true, connected_at: new Date().toISOString() },
        }
      }
      if (klaviyo_public_key) {
        updateData.klaviyo_public_key = encrypt(klaviyo_public_key)
      }

      if (Object.keys(updateData).length === 0) {
        throw new AppError("Nenhuma credencial informada", 400)
      }

      const { error: updateError } = await adminClient
        .from("client_stores")
        .update(updateData)
        .eq("id", store_id)

      if (updateError) {
        log.error("Error updating Klaviyo credentials:", updateError)
        throw new AppError("Erro ao salvar credenciais Klaviyo", 500)
      }

      return successResponse(request, { success: true, message: "Credenciais Klaviyo atualizadas" })
    }

    if (integration_type === "tracking") {
      // Check if tracking store exists
      const { data: existing } = await adminClient
        .from("tracking_stores")
        .select("id")
        .eq("client_store_id", store_id)
        .single()

      const trackingData: Record<string, unknown> = {
        client_store_id: store_id,
        org_id: store.org_id,
        shop_domain: store.shopify_store_domain || "",
        shop_name: store.store_name,
      }

      if (activate_tracking !== undefined) {
        trackingData.is_active = activate_tracking
      }

      // Copy Shopify credentials from client_stores
      if (store.shopify_access_token) {
        trackingData.shopify_access_token = store.shopify_access_token
      }

      if (widget_config) {
        trackingData.widget_config = widget_config
      }

      if (existing) {
        const { error: updateError } = await adminClient
          .from("tracking_stores")
          .update(trackingData)
          .eq("id", existing.id)

        if (updateError) {
          log.error("Error updating tracking store:", updateError)
          throw new AppError("Erro ao atualizar rastreamento", 500)
        }
      } else {
        trackingData.is_active = activate_tracking ?? true
        const { error: insertError } = await adminClient
          .from("tracking_stores")
          .insert(trackingData)

        if (insertError) {
          log.error("Error creating tracking store:", insertError, JSON.stringify(insertError))
          throw new AppError(`Erro ao ativar rastreamento: ${insertError.message}`, 500)
        }
      }

      return successResponse(request, {
        success: true,
        message: existing ? "Rastreamento atualizado" : "Rastreamento ativado",
      })
    }

    throw new AppError(`Tipo de integração não suportado: ${integration_type}`, 400)
  } catch (error) {
    return errorResponse(request, error, "PortalIntegrations")
  }
}
