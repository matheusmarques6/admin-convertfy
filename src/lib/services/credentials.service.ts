/**
 * Credentials Service
 *
 * Centralized access to store credentials via client_stores table.
 * ALL credential reads/writes should go through this service.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  encrypt,
  decrypt,
  decryptStoreCredentials,
  encryptCredentialsJson,
  decryptCredentialsJson,
} from "@/lib/crypto"
import { AppError, NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CredentialsService")

// Fields that are always encrypted in client_stores
const ENCRYPTED_FIELDS = [
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
  "meta_access_token",
] as const

export interface StoreCredentials {
  // Shopify
  shopify_store_domain?: string
  shopify_access_token?: string
  shopify_api_key?: string
  shopify_api_secret?: string
  // Klaviyo
  klaviyo_api_key?: string
  klaviyo_private_key?: string
  klaviyo_public_key?: string
  klaviyo_list_id?: string
  // Google Analytics
  ga4_property_id?: string
  ga4_credentials?: Record<string, string>
  // Meta
  meta_access_token?: string
  meta_page_id?: string
  meta_user_id?: string
  meta_ad_account_id?: string
  meta_instagram_account_id?: string
  // Google Ads / Calendar
  google_ads_credentials?: Record<string, string>
  google_calendar_credentials?: Record<string, string>
}

export interface IntegrationStatus {
  shopify?: { connected: boolean; connected_at?: string }
  klaviyo?: { connected: boolean; connected_at?: string }
  meta?: { connected: boolean; connected_at?: string }
  google_ads?: { connected: boolean; connected_at?: string }
  google_calendar?: { connected: boolean; connected_at?: string }
  ga4?: { connected: boolean; connected_at?: string }
}

/**
 * Get decrypted credentials for a store.
 * Uses admin client to bypass RLS.
 */
export async function getStoreCredentials(storeId: string): Promise<StoreCredentials & { store_name: string; client_id: string | null }> {
  const adminClient = createAdminClient()

  const { data: store, error } = await adminClient
    .from("client_stores")
    .select("*")
    .eq("id", storeId)
    .single()

  if (error || !store) {
    log.error("Store not found", { storeId, error })
    throw new NotFoundError("Store")
  }

  const decrypted = decryptStoreCredentials(store)

  // Decrypt JSON fields separately
  const result: StoreCredentials & { store_name: string; client_id: string | null } = {
    ...decrypted,
    store_name: store.store_name,
    client_id: store.client_id,
  }

  if (store.ga4_credentials && typeof store.ga4_credentials === "string") {
    result.ga4_credentials = decryptCredentialsJson(store.ga4_credentials)
  }

  if (store.google_ads_credentials && typeof store.google_ads_credentials === "string") {
    result.google_ads_credentials = decryptCredentialsJson(store.google_ads_credentials)
  }

  if (store.google_calendar_credentials && typeof store.google_calendar_credentials === "string") {
    result.google_calendar_credentials = decryptCredentialsJson(store.google_calendar_credentials)
  }

  return result
}

/**
 * Update credentials for a specific store.
 * Encrypts all sensitive fields before writing.
 */
export async function updateStoreCredentials(
  storeId: string,
  credentials: Partial<StoreCredentials>,
  integrationKey?: keyof IntegrationStatus
): Promise<void> {
  const adminClient = createAdminClient()

  // Build update object with encryption
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  // Encrypt string credential fields
  for (const [key, value] of Object.entries(credentials)) {
    if (value === undefined) continue

    if (ENCRYPTED_FIELDS.includes(key as (typeof ENCRYPTED_FIELDS)[number]) && typeof value === "string") {
      updateData[key] = encrypt(value)
    } else if (key === "ga4_credentials" && typeof value === "object") {
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else if (key === "google_ads_credentials" && typeof value === "object") {
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else if (key === "google_calendar_credentials" && typeof value === "object") {
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else {
      updateData[key] = value
    }
  }

  // Update integration status if key provided
  if (integrationKey) {
    const { data: current } = await adminClient
      .from("client_stores")
      .select("integration_status")
      .eq("id", storeId)
      .single()

    const currentStatus = (current?.integration_status as IntegrationStatus) || {}
    updateData.integration_status = {
      ...currentStatus,
      [integrationKey]: {
        connected: true,
        connected_at: new Date().toISOString(),
      },
    }
  }

  const { error } = await adminClient
    .from("client_stores")
    .update(updateData)
    .eq("id", storeId)

  if (error) {
    log.error("Failed to update store credentials", { storeId, error })
    throw new AppError("Erro ao atualizar credenciais", 500)
  }

  log.info("Store credentials updated", { storeId, integrationKey })
}

/**
 * Get the integration status for a store.
 */
export async function getStoreIntegrationStatus(storeId: string): Promise<IntegrationStatus> {
  const adminClient = createAdminClient()

  const { data: store, error } = await adminClient
    .from("client_stores")
    .select(`
      integration_status,
      shopify_access_token,
      klaviyo_api_key,
      klaviyo_private_key,
      ga4_credentials,
      meta_access_token
    `)
    .eq("id", storeId)
    .single()

  if (error || !store) {
    throw new NotFoundError("Store")
  }

  // If integration_status exists, use it; otherwise infer from credentials
  const saved = (store.integration_status as IntegrationStatus) || {}

  return {
    shopify: saved.shopify || { connected: !!store.shopify_access_token },
    klaviyo: saved.klaviyo || { connected: !!(store.klaviyo_api_key || store.klaviyo_private_key) },
    ga4: saved.ga4 || { connected: !!store.ga4_credentials },
    meta: saved.meta || { connected: !!store.meta_access_token },
    google_ads: saved.google_ads || { connected: false },
    google_calendar: saved.google_calendar || { connected: false },
  }
}
