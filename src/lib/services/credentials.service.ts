/**
 * Credentials Service
 *
 * Centralized access to store credentials via client_stores table.
 * ALL credential reads/writes should go through this service.
 */

import { createAdminClient } from "@/lib/supabase/server"
import {
  encrypt,
  decryptStoreCredentials,
  encryptCredentialsJson,
  decryptCredentialsJson,
} from "@/lib/crypto"
import { AppError, NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { ENCRYPTED_FIELDS, ALL_SENSITIVE_FIELDS } from "@/lib/constants/credentials"

// Re-export for backward compatibility
export { ENCRYPTED_FIELDS, ENCRYPTED_JSON_FIELDS, ALL_SENSITIVE_FIELDS } from "@/lib/constants/credentials"
export type { EncryptedField } from "@/lib/constants/credentials"

const log = logger.child("CredentialsService")

/**
 * Supabase OR filter string for stores with Klaviyo credentials.
 * Used by cron sync-reports and live fetch endpoints to ensure
 * identical store selection.
 *
 * Both klaviyo_private_key (current) and klaviyo_api_key (legacy)
 * are accepted because getStoreCredentials() handles both.
 */
export const KLAVIYO_CREDENTIALS_FILTER =
  "klaviyo_private_key.not.is.null,klaviyo_api_key.not.is.null"

// Fields that must contain only ASCII printable characters (0x20-0x7E).
// meta_access_token is excluded — it comes from OAuth callback, not manual input.
const FIELDS_TO_VALIDATE: ReadonlySet<string> = new Set([
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
])

const ASCII_PRINTABLE = /^[\x20-\x7E]+$/

/**
 * Sanitize a store object for API responses.
 * Replaces all sensitive credential fields with boolean flags (true/false)
 * to prevent ciphertext leaking to the frontend.
 */
export function sanitizeStoreResponse(store: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...store }
  for (const field of ALL_SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = sanitized[field] ? true : false
    }
  }
  return sanitized
}

const DEFAULT_MAX_LENGTH = 2048
const JSON_BLOB_MAX_LENGTH = 16384

export function validateCredentialField(field: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (trimmed.length > DEFAULT_MAX_LENGTH) {
    throw new AppError(
      `Credential field '${field}' exceeds maximum length of ${DEFAULT_MAX_LENGTH} characters`,
      400
    )
  }
  if (!ASCII_PRINTABLE.test(trimmed)) {
    throw new AppError(
      `O campo ${field} contem caracteres invalidos. Copie a API key novamente sem formatacao.`,
      400
    )
  }
  return trimmed
}

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

export type IntegrationConnectionStatus = "not_configured" | "pending_validation" | "connected" | "error"

export interface IntegrationStatusEntry {
  connected: boolean
  configured?: boolean
  status?: IntegrationConnectionStatus
  connected_at?: string
  validated_at?: string | null
  error?: string | null
  hasReportingAccess?: boolean
  missingScopes?: string[]
}

export interface IntegrationStatus {
  shopify?: IntegrationStatusEntry
  klaviyo?: IntegrationStatusEntry
  meta?: IntegrationStatusEntry
  google_ads?: IntegrationStatusEntry
  google_calendar?: IntegrationStatusEntry
  ga4?: IntegrationStatusEntry
}

/**
 * Get decrypted credentials for a store.
 * Uses admin client to bypass RLS.
 *
 * @param storeId - The store UUID
 * @param orgId - Optional org_id to validate store belongs to this org (defense-in-depth)
 */
export async function getStoreCredentials(storeId: string, orgId?: string): Promise<StoreCredentials & { store_name: string; client_id: string | null }> {
  const adminClient = createAdminClient()

  let query = adminClient
    .from("client_stores")
    .select("*")
    .eq("id", storeId)

  if (orgId) {
    query = query.eq("org_id", orgId)
  }

  const { data: store, error } = await query.single()

  if (error || !store) {
    log.error("Store not found", { storeId, error })
    throw new NotFoundError("Store")
  }

  const decrypted = decryptStoreCredentials(store)

  // Detect decryption failures: field was non-null in DB but null after decrypt
  const failedFields = ENCRYPTED_FIELDS.filter(
    (field) => store[field] != null && decrypted[field] == null
  )
  if (failedFields.length > 0) {
    log.warn(`Decryption failed for store ${storeId}: ${failedFields.join(", ")}`)
  }

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
 * Get decrypted credentials for multiple stores in a single batch query.
 * Returns a Map indexed by store ID.
 */
export async function getMultipleStoreCredentials(
  storeIds: string[],
  orgId?: string
): Promise<Map<string, StoreCredentials & { store_name: string; client_id: string | null }>> {
  if (storeIds.length === 0) return new Map()

  const adminClient = createAdminClient()
  let query = adminClient
    .from("client_stores")
    .select("*")
    .in("id", storeIds)

  if (orgId) {
    query = query.eq("org_id", orgId)
  }

  const { data: stores, error } = await query

  if (error) {
    log.error("Failed to fetch multiple store credentials", { error })
    throw new AppError("Failed to fetch store credentials", 500)
  }

  const result = new Map<string, StoreCredentials & { store_name: string; client_id: string | null }>()

  for (const store of stores || []) {
    const decrypted = decryptStoreCredentials(store)

    // Detect decryption failures
    const failedFields = ENCRYPTED_FIELDS.filter(
      (field) => store[field] != null && decrypted[field] == null
    )
    if (failedFields.length > 0) {
      log.warn(`Decryption failed for store ${store.id}: ${failedFields.join(", ")}`)
    }

    const entry: StoreCredentials & { store_name: string; client_id: string | null } = {
      ...decrypted,
      store_name: store.store_name,
      client_id: store.client_id,
    }

    if (store.ga4_credentials && typeof store.ga4_credentials === "string") {
      entry.ga4_credentials = decryptCredentialsJson(store.ga4_credentials)
    }
    if (store.google_ads_credentials && typeof store.google_ads_credentials === "string") {
      entry.google_ads_credentials = decryptCredentialsJson(store.google_ads_credentials)
    }
    if (store.google_calendar_credentials && typeof store.google_calendar_credentials === "string") {
      entry.google_calendar_credentials = decryptCredentialsJson(store.google_calendar_credentials)
    }

    result.set(store.id, entry)
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
  integrationKey?: keyof IntegrationStatus,
  options?: { resetValidation?: boolean; orgId?: string; skipOrgCheck?: boolean }
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
      const cleaned = FIELDS_TO_VALIDATE.has(key) ? validateCredentialField(key, value) : value
      updateData[key] = encrypt(cleaned)
    } else if (key === "ga4_credentials" && typeof value === "object") {
      const json = JSON.stringify(value)
      if (json.length > JSON_BLOB_MAX_LENGTH) {
        throw new AppError(`Credential field '${key}' exceeds maximum length of ${JSON_BLOB_MAX_LENGTH} characters`, 400)
      }
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else if (key === "google_ads_credentials" && typeof value === "object") {
      const json = JSON.stringify(value)
      if (json.length > JSON_BLOB_MAX_LENGTH) {
        throw new AppError(`Credential field '${key}' exceeds maximum length of ${JSON_BLOB_MAX_LENGTH} characters`, 400)
      }
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else if (key === "google_calendar_credentials" && typeof value === "object") {
      const json = JSON.stringify(value)
      if (json.length > JSON_BLOB_MAX_LENGTH) {
        throw new AppError(`Credential field '${key}' exceeds maximum length of ${JSON_BLOB_MAX_LENGTH} characters`, 400)
      }
      updateData[key] = encryptCredentialsJson(value as Record<string, unknown>)
    } else {
      updateData[key] = value
    }
  }

  // Update integration status if key provided
  if (integrationKey) {
    const resetValidation = options?.resetValidation ?? false
    const now = new Date().toISOString()

    if (integrationKey === "shopify") {
      // Use individual validation columns for Shopify
      updateData.shopify_validated_at = resetValidation ? null : now
      updateData.shopify_validation_error = null
    } else if (integrationKey === "klaviyo") {
      // Use individual validation columns for Klaviyo
      updateData.klaviyo_validated_at = resetValidation ? null : now
      updateData.klaviyo_validation_error = null
      updateData.klaviyo_missing_scopes = null
      updateData.klaviyo_has_reporting_access = null
    } else {
      // GA4, Meta, Google Ads/Calendar still use legacy JSON column
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
          connected_at: now,
        },
      }
    }
  }

  const useOrgCheck = !!options?.orgId && !options?.skipOrgCheck

  let query = adminClient
    .from("client_stores")
    .update(updateData, useOrgCheck ? { count: "exact" } : undefined)
    .eq("id", storeId)

  // Defense-in-depth: filter by org_id to prevent cross-tenant credential overwrites
  if (useOrgCheck) {
    query = query.eq("org_id", options!.orgId!)
  }

  const { error, count } = await query

  if (error) {
    log.error("Failed to update store credentials", { storeId, error })
    throw new AppError("Erro ao atualizar credenciais", 500)
  }

  // If orgId was provided and no rows were updated, store doesn't belong to this org
  if (useOrgCheck && count === 0) {
    log.warn("Store ownership check failed on credential update", { storeId, orgId: options!.orgId })
    throw new AppError("Store not found or does not belong to this organization", 403)
  }

  log.info("Store credentials updated", { storeId, integrationKey })
}

/**
 * Derive integration connection status from credential + validation fields.
 */
export function deriveStatus(
  hasCredential: boolean,
  validatedAt: string | null | undefined,
  validationError: string | null | undefined
): IntegrationStatusEntry {
  if (!hasCredential) {
    return {
      connected: false,
      configured: false,
      status: "not_configured",
    }
  }

  if (validationError) {
    return {
      connected: false,
      configured: true,
      status: "error",
      validated_at: validatedAt,
      error: validationError,
    }
  }

  if (validatedAt) {
    return {
      connected: true,
      configured: true,
      status: "connected",
      validated_at: validatedAt,
    }
  }

  // Credential exists but never validated (legacy data)
  return {
    connected: false,
    configured: true,
    status: "pending_validation",
  }
}

/**
 * Get the integration status for a store.
 * Uses real validation fields (validated_at, validation_error) for Shopify/Klaviyo.
 */
export async function getStoreIntegrationStatus(storeId: string): Promise<IntegrationStatus> {
  const adminClient = createAdminClient()

  const { data: store, error } = await adminClient
    .from("client_stores")
    .select(`
      integration_status,
      shopify_access_token,
      shopify_validated_at,
      shopify_validation_error,
      klaviyo_api_key,
      klaviyo_private_key,
      klaviyo_validated_at,
      klaviyo_validation_error,
      klaviyo_missing_scopes,
      klaviyo_has_reporting_access,
      ga4_credentials,
      meta_access_token
    `)
    .eq("id", storeId)
    .single()

  if (error || !store) {
    throw new NotFoundError("Store")
  }

  // For backward compatibility, still read saved integration_status for non-validated integrations
  const saved = (store.integration_status as IntegrationStatus) || {}

  return {
    shopify: deriveStatus(
      !!store.shopify_access_token,
      store.shopify_validated_at,
      store.shopify_validation_error
    ),
    klaviyo: {
      ...deriveStatus(
        !!(store.klaviyo_api_key || store.klaviyo_private_key),
        store.klaviyo_validated_at,
        store.klaviyo_validation_error
      ),
      hasReportingAccess: store.klaviyo_has_reporting_access ?? undefined,
      missingScopes: store.klaviyo_missing_scopes ?? undefined,
    },
    ga4: saved.ga4 || { connected: !!store.ga4_credentials, status: store.ga4_credentials ? "connected" : "not_configured" },
    meta: saved.meta || { connected: !!store.meta_access_token, status: store.meta_access_token ? "connected" : "not_configured" },
    google_ads: saved.google_ads || { connected: false, status: "not_configured" },
    google_calendar: saved.google_calendar || { connected: false, status: "not_configured" },
  }
}
