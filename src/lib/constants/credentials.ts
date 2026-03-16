/**
 * Credential field constants — single source of truth.
 *
 * ENCRYPTED_FIELDS: string tokens encrypted/decrypted via encrypt()/decrypt().
 * ENCRYPTED_JSON_FIELDS: JSON blobs encrypted/decrypted via encryptCredentialsJson()/decryptCredentialsJson().
 *
 * Consumed by: crypto.ts, credentials.service.ts, credentials route, encrypt-credentials migration.
 */

/** String credential fields — encrypt()/decrypt() */
export const ENCRYPTED_FIELDS = [
  "shopify_access_token",
  "shopify_api_key",
  "shopify_api_secret",
  "klaviyo_api_key",
  "klaviyo_private_key",
  "klaviyo_public_key",
  "meta_access_token",
] as const

export type EncryptedField = (typeof ENCRYPTED_FIELDS)[number]

/** JSON blob credential fields — encryptCredentialsJson()/decryptCredentialsJson() */
export const ENCRYPTED_JSON_FIELDS = [
  "google_ads_credentials",
  "google_calendar_credentials",
  "ga4_credentials",
] as const

export type EncryptedJsonField = (typeof ENCRYPTED_JSON_FIELDS)[number]

/** Superset of all sensitive fields (for sanitization in Story 51.4) */
export const ALL_SENSITIVE_FIELDS = [
  ...ENCRYPTED_FIELDS,
  ...ENCRYPTED_JSON_FIELDS,
] as const
