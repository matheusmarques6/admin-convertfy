/**
 * Google Auth Service
 *
 * Manages Google OAuth tokens per-user (user_google_tokens table).
 * Handles token encryption, automatic refresh, revocation detection,
 * and connection status queries.
 *
 * Tokens are encrypted with AES-256-GCM via @/lib/crypto (prefix enc:v1:).
 * Uses createAdminClient() for writes (service role bypasses RLS).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleAuth")

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dono de um token Google.
 * - profile: admin (profiles.id = auth.uid)
 * - portal_user: usuario do portal do cliente
 * - org: conta compartilhada da organizacao ("convertfy"), user_id = org_id
 */
export type GoogleUserType = "profile" | "portal_user" | "org"

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
}

export interface GoogleUserInfo {
  email: string
  id: string // google account id (sub claim)
}

export interface ConnectionStatus {
  connected: boolean
  google_email: string | null
  is_active: boolean
  last_synced_at: string | null
  sync_error: string | null
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class GoogleTokenRevokedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoogleTokenRevokedError"
  }
}

export class GoogleTokenMissingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoogleTokenMissingError"
  }
}

// ---------------------------------------------------------------------------
// saveTokens
// ---------------------------------------------------------------------------

/**
 * Save (upsert) Google OAuth tokens for a user.
 *
 * - Encrypts access_token and refresh_token with AES-256-GCM.
 * - Computes expires_at from expires_in.
 * - On conflict (same user_type + user_id), updates tokens (reconnection).
 * - Uses adminClient (service role) for write.
 */
export async function saveTokens(
  userId: string,
  userType: GoogleUserType,
  orgId: string,
  tokens: GoogleTokens,
  userInfo: GoogleUserInfo
): Promise<void> {
  const adminClient = createAdminClient()

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const scopes = tokens.scope ? tokens.scope.split(" ") : []

  const row: Record<string, unknown> = {
    user_type: userType,
    user_id: userId,
    google_email: userInfo.email,
    google_account_id: userInfo.id,
    access_token: encrypt(tokens.access_token),
    token_type: tokens.token_type || "Bearer",
    expires_at: expiresAt,
    scopes,
    is_active: true,
    sync_error: null,
    org_id: orgId,
  }

  // Only include refresh_token if provided (Google only sends it on first consent)
  if (tokens.refresh_token) {
    row.refresh_token = encrypt(tokens.refresh_token)
  }

  // Upsert: if user already has a record, update tokens (reconnection)
  // Only update refresh_token if a new one was provided (Google only sends it on first consent)
  const updateFields: Record<string, unknown> = {
    google_email: row.google_email,
    google_account_id: row.google_account_id,
    access_token: row.access_token,
    token_type: row.token_type,
    expires_at: row.expires_at,
    scopes: row.scopes,
    is_active: true,
    sync_error: null,
  }

  if (tokens.refresh_token) {
    updateFields.refresh_token = row.refresh_token
  }

  const { error } = await adminClient
    .from("user_google_tokens")
    .upsert(row, { onConflict: "user_type,user_id" })

  if (error) {
    // If upsert with all fields failed because refresh_token shouldn't be overwritten,
    // fall back to a selective update
    log.error("Failed to save Google tokens", { userId, userType, error: error.message })
    throw new Error(`Failed to save Google tokens: ${error.message}`)
  }

  log.info("Google tokens saved", { userId, userType, google_email: userInfo.email })
}

// ---------------------------------------------------------------------------
// getValidAccessToken
// ---------------------------------------------------------------------------

/**
 * Get a valid (non-expired) access token for a user.
 *
 * - Returns decrypted access_token if still valid.
 * - If expired (or expiring within 5 min), refreshes automatically.
 * - If connection is inactive, throws GoogleTokenRevokedError.
 * - If no record found, returns null.
 */
export async function getValidAccessToken(
  userId: string,
  userType: GoogleUserType
): Promise<string | null> {
  const adminClient = createAdminClient()

  const { data: record, error } = await adminClient
    .from("user_google_tokens")
    .select("*")
    .eq("user_type", userType)
    .eq("user_id", userId)
    .single()

  if (error || !record) {
    return null
  }

  // Check if connection is active
  if (!record.is_active) {
    throw new GoogleTokenRevokedError(
      record.sync_error || "Google connection is inactive. Please reconnect."
    )
  }

  // Check expiration (with 5 min buffer)
  const expiresAt = new Date(record.expires_at).getTime()
  const now = Date.now()

  if (expiresAt - now > TOKEN_EXPIRY_BUFFER_MS) {
    // Token is still valid
    return decrypt(record.access_token)
  }

  // Token expired or expiring soon — refresh
  log.info("Access token expired, refreshing", { userId, userType })
  const newAccessToken = await refreshAccessToken(userId, userType, record)
  return newAccessToken
}

// ---------------------------------------------------------------------------
// refreshAccessToken (internal)
// ---------------------------------------------------------------------------

/**
 * Refresh the access token using the refresh_token.
 *
 * - On success: updates access_token + expires_at in DB, returns new access_token.
 * - On failure (400/401 = token revoked): marks is_active=false, sets sync_error.
 * - On missing refresh_token: marks is_active=false with descriptive error.
 */
async function refreshAccessToken(
  userId: string,
  userType: GoogleUserType,
  record: Record<string, unknown>
): Promise<string | null> {
  const adminClient = createAdminClient()

  // Decrypt refresh_token
  const refreshToken = decrypt(record.refresh_token as string)

  // AC 42.2.7: Handle missing refresh_token
  if (!refreshToken) {
    log.warn("Missing refresh_token, marking inactive", { userId, userType })

    await adminClient
      .from("user_google_tokens")
      .update({
        is_active: false,
        sync_error: "Refresh token ausente. Reconecte com prompt de consentimento.",
      })
      .eq("user_type", userType)
      .eq("user_id", userId)

    throw new GoogleTokenMissingError(
      "Refresh token ausente. Reconecte com prompt de consentimento."
    )
  }

  // Call Google token endpoint
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const errorDesc = errorBody.error_description || errorBody.error || `HTTP ${response.status}`

      // 400 or 401 = token revoked or invalid
      if (response.status === 400 || response.status === 401) {
        log.warn("Refresh token revoked/invalid", {
          userId,
          userType,
          status: response.status,
          error: errorDesc,
        })

        await adminClient
          .from("user_google_tokens")
          .update({
            is_active: false,
            sync_error: "Token revogado pelo usuario. Reconecte seu Google Calendar.",
          })
          .eq("user_type", userType)
          .eq("user_id", userId)

        throw new GoogleTokenRevokedError(
          "Token revogado pelo usuario. Reconecte seu Google Calendar."
        )
      }

      // Other error — don't mark inactive, might be transient
      log.error("Google token refresh failed", {
        userId,
        userType,
        status: response.status,
        error: errorDesc,
      })
      return null
    }

    const data = await response.json()
    const newAccessToken = data.access_token as string
    const expiresIn = data.expires_in as number
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Update access_token and expires_at in DB
    const updatePayload: Record<string, unknown> = {
      access_token: encrypt(newAccessToken),
      expires_at: newExpiresAt,
      sync_error: null,
    }

    // Google may return a new refresh_token (rare but possible)
    if (data.refresh_token) {
      updatePayload.refresh_token = encrypt(data.refresh_token)
    }

    await adminClient
      .from("user_google_tokens")
      .update(updatePayload)
      .eq("user_type", userType)
      .eq("user_id", userId)

    log.info("Access token refreshed successfully", { userId, userType })
    return newAccessToken
  } catch (error) {
    // Re-throw our custom errors
    if (
      error instanceof GoogleTokenRevokedError ||
      error instanceof GoogleTokenMissingError
    ) {
      throw error
    }

    log.error("Token refresh network error", {
      userId,
      userType,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// getConnectionStatus
// ---------------------------------------------------------------------------

/**
 * Get the Google Calendar connection status for a user.
 *
 * Returns connection info without exposing tokens.
 */
export async function getConnectionStatus(
  userId: string,
  userType: GoogleUserType
): Promise<ConnectionStatus> {
  const adminClient = createAdminClient()

  const { data: record, error } = await adminClient
    .from("user_google_tokens")
    .select("google_email, is_active, last_synced_at, sync_error")
    .eq("user_type", userType)
    .eq("user_id", userId)
    .single()

  if (error || !record) {
    return {
      connected: false,
      google_email: null,
      is_active: false,
      last_synced_at: null,
      sync_error: null,
    }
  }

  return {
    connected: true,
    google_email: record.google_email,
    is_active: record.is_active,
    last_synced_at: record.last_synced_at,
    sync_error: record.sync_error,
  }
}

// ---------------------------------------------------------------------------
// disconnectGoogle
// ---------------------------------------------------------------------------

/**
 * Disconnect Google Calendar for a user.
 *
 * - Revokes the token at Google (best effort — token may already be revoked).
 * - Deletes the record from user_google_tokens.
 * - Uses adminClient (service role) for delete.
 */
export async function disconnectGoogle(
  userId: string,
  userType: GoogleUserType
): Promise<void> {
  const adminClient = createAdminClient()

  // Fetch the current record to get the access_token for revocation
  const { data: record } = await adminClient
    .from("user_google_tokens")
    .select("access_token")
    .eq("user_type", userType)
    .eq("user_id", userId)
    .single()

  if (record) {
    // Best-effort revoke at Google
    try {
      const accessToken = decrypt(record.access_token)
      await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    } catch {
      // Ignore — token may already be revoked
      log.warn("Google token revoke failed (may already be revoked)", { userId, userType })
    }

    // Delete the record
    const { error } = await adminClient
      .from("user_google_tokens")
      .delete()
      .eq("user_type", userType)
      .eq("user_id", userId)

    if (error) {
      log.error("Failed to delete Google token record", { userId, userType, error: error.message })
      throw new Error(`Failed to disconnect Google: ${error.message}`)
    }
  }

  log.info("Google disconnected", { userId, userType })
}

// ---------------------------------------------------------------------------
// hasValidConnection
// ---------------------------------------------------------------------------

/**
 * Quick check if a user has a valid (active) Google connection.
 */
export async function hasValidConnection(
  userId: string,
  userType: GoogleUserType
): Promise<boolean> {
  const status = await getConnectionStatus(userId, userType)
  return status.connected && status.is_active
}
