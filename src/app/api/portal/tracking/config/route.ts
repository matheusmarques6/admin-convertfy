import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, AppError } from "@/lib/api/errors"
import { encrypt } from "@/lib/crypto"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { getPortalUser } from "@/lib/portal/auth"

const log = logger.child("PortalTrackingConfig")

const DEFAULT_CONFIG = {
  plugin_type: "complete" as const,
  primary_color: "#6366F1",
  accent_color: "#8B5CF6",
  icon_color: "#6366F1",
  hide_carrier: false,
  hide_redirect: false,
  blocked_words: "",
  not_found_message: "Pedido não encontrado. Verifique o número informado e tente novamente.",
  custom_css: "",
  show_estimated_delivery: true,
  show_carrier_logo: true,
  language: "pt-BR",
}

/**
 * Auto-provision: if no tracking_stores exist but client_stores has a Shopify integration,
 * automatically create a tracking_store record so the tracking module works seamlessly.
 */
async function autoProvisionTrackingStore(
  adminClient: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<{ id: string; shop_domain: string; shop_name: string | null; is_active: boolean } | null> {
  try {
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id, store_name, shopify_store_domain, shopify_access_token, store_url, org_id, platform")
      .eq("client_id", clientId)
      .eq("is_active", true)

    if (!clientStores || clientStores.length === 0) return null

    const shopifyStore = clientStores.find((s) => {
      return !!s.shopify_access_token && !!s.shopify_store_domain
    })

    if (!shopifyStore) return null

    let shopDomain = shopifyStore.shopify_store_domain || ""
    if (!shopDomain && shopifyStore.store_url) {
      shopDomain = shopifyStore.store_url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    }
    if (!shopDomain) return null

    shopDomain = shopDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")

    let accessToken = ""
    try {
      if (shopifyStore.shopify_access_token) {
        const creds = await getStoreCredentials(shopifyStore.id)
        accessToken = creds.shopify_access_token || ""
      }
    } catch {
      log.warn("Could not decrypt Shopify token for auto-provision", { clientId })
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
      .select("id, shop_domain, shop_name, is_active")
      .single()

    if (error) {
      log.error("Error auto-provisioning tracking store", { clientId, error })
      return null
    }

    log.info("Auto-provisioned tracking store from client_stores", {
      trackingStoreId: newStore.id,
      shopDomain,
      clientId,
    })

    return newStore
  } catch (err) {
    log.error("Unexpected error in auto-provision", err)
    return null
  }
}

/**
 * GET - Get tracking plugin configuration for the client's store
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const adminClient = createAdminClient()

    // Get client_stores for this client
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id")
      .eq("client_id", portalUser.client_id)
      .eq("is_active", true)

    if (!clientStores || clientStores.length === 0) {
      return successResponse(request, {
        config: DEFAULT_CONFIG,
        stores: [],
        selected_store_id: null,
      })
    }

    const clientStoreIds = clientStores.map(cs => cs.id)

    // Get tracking stores via client_store_id
    let { data: stores } = await adminClient
      .from("tracking_stores")
      .select("id, shop_domain, shop_name, is_active, client_store_id")
      .in("client_store_id", clientStoreIds)

    // Auto-provision if no tracking stores exist
    if (!stores || stores.length === 0) {
      const provisioned = await autoProvisionTrackingStore(adminClient, portalUser.client_id)
      if (provisioned) {
        stores = [{ ...provisioned, client_store_id: clientStores[0].id }]
      }
    }

    if (!stores || stores.length === 0) {
      return successResponse(request, {
        config: DEFAULT_CONFIG,
        stores: [],
        selected_store_id: null,
      })
    }

    // Use the first active store's config
    const activeStore = stores.find(s => s.is_active) || stores[0]

    const { data: storeWithConfig } = await adminClient
      .from("tracking_stores")
      .select("*")
      .eq("id", activeStore.id)
      .single()

    const widgetConfig = (storeWithConfig as Record<string, unknown>)?.widget_config as Record<string, unknown> | null

    return successResponse(request, {
      config: widgetConfig ? { ...DEFAULT_CONFIG, ...widgetConfig } : DEFAULT_CONFIG,
      stores: stores.map(s => ({
        id: s.id,
        shop_domain: s.shop_domain,
        shop_name: s.shop_name,
        is_active: s.is_active,
      })),
      selected_store_id: activeStore.id,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingConfig GET")
  }
}

/**
 * PUT - Save tracking plugin configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const portalUser = await getPortalUser(supabase)

    if (!portalUser) {
      throw new AppError("Não autorizado", 401)
    }

    const body = await request.json()
    const { store_id, config } = body

    if (!store_id) {
      throw new AppError("store_id é obrigatório", 400)
    }

    const adminClient = createAdminClient()

    // Verify store belongs to this client via client_stores
    const { data: clientStores } = await adminClient
      .from("client_stores")
      .select("id")
      .eq("client_id", portalUser.client_id)

    if (!clientStores || clientStores.length === 0) {
      throw new AppError("Loja de rastreamento não encontrada", 404)
    }

    const clientStoreIds = clientStores.map(cs => cs.id)

    const { data: store } = await adminClient
      .from("tracking_stores")
      .select("id")
      .eq("id", store_id)
      .in("client_store_id", clientStoreIds)
      .single()

    if (!store) {
      throw new AppError("Loja de rastreamento não encontrada", 404)
    }

    // Sanitize config
    const sanitizeColor = (val: unknown, fallback: string) =>
      typeof val === "string" && /^#[0-9A-Fa-f]{3,6}$/.test(val) ? val.slice(0, 7) : fallback

    const sanitizedConfig = {
      plugin_type: config.plugin_type === "basic" ? "basic" : "complete",
      primary_color: sanitizeColor(config.primary_color, DEFAULT_CONFIG.primary_color),
      accent_color: sanitizeColor(config.accent_color, DEFAULT_CONFIG.accent_color),
      icon_color: sanitizeColor(config.icon_color, DEFAULT_CONFIG.icon_color),
      hide_carrier: !!config.hide_carrier,
      hide_redirect: !!config.hide_redirect,
      blocked_words: typeof config.blocked_words === "string" ? config.blocked_words.slice(0, 500) : "",
      not_found_message: typeof config.not_found_message === "string" ? config.not_found_message.slice(0, 300) : DEFAULT_CONFIG.not_found_message,
      custom_css: typeof config.custom_css === "string" ? config.custom_css.slice(0, 2000) : "",
      show_estimated_delivery: config.show_estimated_delivery !== false,
      show_carrier_logo: config.show_carrier_logo !== false,
      language: ["pt-BR", "en", "de", "it", "es"].includes(config.language) ? config.language : "pt-BR",
    }

    // Save config in widget_config column
    const { error: updateError } = await adminClient
      .from("tracking_stores")
      .update({
        widget_config: sanitizedConfig,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("id", store_id)

    if (updateError) {
      log.error("Error saving plugin config", { store_id, error: updateError })
      throw new AppError("Erro ao salvar configurações", 500)
    }

    log.info("Tracking plugin config saved", { store_id })

    return successResponse(request, {
      success: true,
      config: sanitizedConfig,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalTrackingConfig PUT")
  }
}
