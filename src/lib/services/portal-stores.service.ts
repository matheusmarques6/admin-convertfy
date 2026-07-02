/**
 * Portal Stores Service
 *
 * Lists the stores of a portal client with integration presence flags
 * (never exposes actual credentials).
 *
 * Extracted from portal/stores/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { deriveStatus } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

const log = logger.child("PortalStores")

export interface PortalStoreListItem {
  id: string
  store_name: string
  platform: string
  store_url: string
  is_active: boolean
  created_at: string
  hasKlaviyo: boolean
  shopify_access_token: boolean
  shopify_store_domain: string
}

export async function listPortalStores(
  clientId: string,
  adminClient: SupabaseClient
): Promise<PortalStoreListItem[]> {
  const { data: stores, error } = await adminClient
    .from("client_stores")
    .select(`
      id,
      store_name,
      platform,
      store_url,
      is_active,
      created_at,
      klaviyo_api_key,
      klaviyo_private_key,
      klaviyo_validated_at,
      klaviyo_validation_error,
      shopify_access_token,
      shopify_validated_at,
      shopify_validation_error,
      shopify_store_domain
    `)
    .eq("client_id", clientId)
    .order("store_name")

  if (error) {
    log.error("[Portal Stores] Error:", error)
    throw new AppError("Erro ao buscar lojas", 500)
  }

  // SECURITY: Convert credentials to boolean flags - never expose actual keys to client
  // Derive status from real validation columns (same source of truth as store detail)
  return (stores || []).map((store) => {
    const klaviyoStatus = deriveStatus(
      !!(store.klaviyo_private_key || store.klaviyo_api_key),
      store.klaviyo_validated_at,
      store.klaviyo_validation_error
    )
    const shopifyStatus = deriveStatus(
      !!store.shopify_access_token,
      store.shopify_validated_at,
      store.shopify_validation_error
    )
    return {
      id: store.id,
      store_name: store.store_name,
      platform: store.platform,
      store_url: store.store_url,
      is_active: store.is_active,
      created_at: store.created_at,
      hasKlaviyo: klaviyoStatus.connected || klaviyoStatus.status === "pending_validation",
      shopify_access_token: shopifyStatus.connected || shopifyStatus.status === "pending_validation",
      shopify_store_domain: store.shopify_store_domain || "",
    }
  })
}
