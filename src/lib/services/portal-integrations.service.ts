/**
 * Portal Integrations Service
 *
 * Builds the integration status payload (Shopify, Klaviyo, Omnisend,
 * tracking + carriers) for a store of a portal client.
 *
 * Extracted from portal/integrations/route.ts so Server Components can call
 * it directly without an HTTP hop.
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { deriveStatus } from "@/lib/services/credentials.service"

export async function buildPortalIntegrations(opts: {
  clientId: string
  storeId: string
  adminClient: SupabaseClient
}): Promise<Record<string, unknown> | null> {
  const { clientId, storeId, adminClient } = opts

  // Verify store belongs to this client.
  // Resiliente a migration 20260417 pendente: se colunas omnisend_* nao
  // existirem, usa SELECT legacy sem elas.
  const selectNew = `
      id,
      store_name,
      platform,
      store_url,
      email_platform,
      shopify_store_domain,
      shopify_access_token,
      shopify_validated_at,
      shopify_validation_error,
      klaviyo_api_key,
      klaviyo_private_key,
      klaviyo_public_key,
      klaviyo_validated_at,
      klaviyo_validation_error,
      klaviyo_missing_scopes,
      klaviyo_has_reporting_access,
      omnisend_api_key,
      omnisend_validated_at,
      omnisend_validation_error
    `
  const selectLegacy = `
      id,
      store_name,
      platform,
      store_url,
      shopify_store_domain,
      shopify_access_token,
      shopify_validated_at,
      shopify_validation_error,
      klaviyo_api_key,
      klaviyo_private_key,
      klaviyo_public_key,
      klaviyo_validated_at,
      klaviyo_validation_error,
      klaviyo_missing_scopes,
      klaviyo_has_reporting_access
    `
  let storeResp = await adminClient
    .from("client_stores")
    .select(selectNew)
    .eq("id", storeId)
    .eq("client_id", clientId)
    .single()
  if (storeResp.error && /email_platform|omnisend_api_key/.test(storeResp.error.message || "")) {
    storeResp = await adminClient
      .from("client_stores")
      .select(selectLegacy)
      .eq("id", storeId)
      .eq("client_id", clientId)
      .single()
  }
  const store = storeResp.data as Record<string, unknown> | null
  if (storeResp.error || !store) {
    return null
  }

  // Check tracking store config
  const { data: trackingStore } = await adminClient
    .from("tracking_stores")
    .select("id, is_active, seventeen_track_api_key, carrier_api_keys, widget_config, last_sync_at")
    .eq("client_store_id", storeId)
    .single()

  // Derive status from real validation columns (same source of truth as store detail page)
  const shopifyStatus = deriveStatus(
    !!store.shopify_access_token,
    store.shopify_validated_at as string | null,
    store.shopify_validation_error as string | null
  )
  const klaviyoStatus = deriveStatus(
    !!(store.klaviyo_private_key || store.klaviyo_api_key),
    store.klaviyo_validated_at as string | null,
    store.klaviyo_validation_error as string | null
  )
  const omnisendStatus = deriveStatus(
    !!store.omnisend_api_key,
    store.omnisend_validated_at as string | null,
    store.omnisend_validation_error as string | null
  )

  return {
    store: {
      id: store.id,
      store_name: store.store_name,
      platform: store.platform,
      email_platform: store.email_platform ?? null,
      store_url: store.store_url,
      shopify_store_domain: store.shopify_store_domain || "",
    },
    integrations: {
      shopify: {
        connected: shopifyStatus.connected || shopifyStatus.status === "pending_validation",
        status: shopifyStatus.status,
        domain: (store.shopify_store_domain as string) || "",
        connected_at: shopifyStatus.validated_at || null,
        error: shopifyStatus.error || null,
      },
      klaviyo: {
        connected: klaviyoStatus.connected || klaviyoStatus.status === "pending_validation",
        status: klaviyoStatus.status,
        has_public_key: !!store.klaviyo_public_key,
        connected_at: klaviyoStatus.validated_at || null,
        error: klaviyoStatus.error || null,
        hasReportingAccess: store.klaviyo_has_reporting_access ?? undefined,
        missingScopes: store.klaviyo_missing_scopes ?? undefined,
      },
      omnisend: {
        connected: omnisendStatus.connected || omnisendStatus.status === "pending_validation",
        status: omnisendStatus.status,
        connected_at: omnisendStatus.validated_at || null,
        error: omnisendStatus.error || null,
      },
      tracking: {
        active: trackingStore?.is_active || false,
        tracking_store_id: trackingStore?.id || null,
        // @deprecated — redundant with carrier_keys.seventeen_track; kept for backwards compat with /api/portal/tracking
        has_17track_key: !!trackingStore?.seventeen_track_api_key,
        carrier_keys: {
          seventeen_track: !!trackingStore?.seventeen_track_api_key,
          trackingmore: !!(trackingStore?.carrier_api_keys as Record<string, unknown> | null)?.trackingmore,
          postnl: !!(trackingStore?.carrier_api_keys as Record<string, unknown> | null)?.postnl,
          cainiao: true, // always true — Cainiao is free and requires no API key
          yunexpress: !!((trackingStore?.carrier_api_keys as Record<string, unknown> | null)?.yunexpress as Record<string, unknown> | undefined)?.customer_number,
        },
        widget_config: trackingStore?.widget_config || null,
        last_sync_at: trackingStore?.last_sync_at || null,
      },
    },
  }
}
