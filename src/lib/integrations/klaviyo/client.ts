/**
 * Klaviyo API Client - Unified HTTP helpers
 *
 * Single source of truth for all Klaviyo API communication.
 * Used by all /api/integrations/klaviyo/* routes.
 */

import { logger } from "@/lib/logger"
import { enqueueKlaviyoRequest } from "./rate-limiter"

const log = logger.child("KlaviyoClient")

/**
 * Thrown when Klaviyo returns 429 and we cannot wait for the Retry-After.
 * Callers should catch this and fall back to cached data.
 */
export class KlaviyoRateLimitError extends Error {
  public retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`Klaviyo rate limited (Retry-After: ${retryAfterMs}ms)`)
    this.name = "KlaviyoRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Thrown when the API key contains non-ASCII characters that crash fetch().
 * Not retryable — the key must be fixed in store settings.
 */
export class KlaviyoInvalidKeyError extends Error {
  constructor(detail: string) {
    super(`Klaviyo API key is invalid: ${detail}`)
    this.name = "KlaviyoInvalidKeyError"
  }
}

/**
 * Thrown when Klaviyo returns 403 with permission_denied.
 * Indicates the API key is missing required scopes — not a transient error.
 * Callers should surface this to the user as a configuration issue.
 */
export class KlaviyoPermissionError extends Error {
  public missingScopes: string[]
  constructor(missingScopes: string[]) {
    super(`Klaviyo API key is missing required scopes: ${missingScopes.join(", ")}`)
    this.name = "KlaviyoPermissionError"
    this.missingScopes = missingScopes
  }
}

// Latest stable API revision per Klaviyo documentation
// https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy
// Updated 2026-03-18 (AK-8): 2024-10-15 → 2025-10-15
// Breaking changes reviewed: none affect our endpoints (subscription bulk, push campaigns, pagination changes)
// New: text_message_roi stats in reporting (benefits AK-7 SMS tracking)
// Retirement: 2024-10-15 retires Oct 2026; 2025-10-15 retires Oct 2027
export const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
export const KLAVIYO_REVISION = "2025-10-15"

// Rate limits are now enforced by the tiered rate limiter in rate-limiter.ts.
// This constant is kept for backward compatibility with external imports.
// @deprecated Use TIER_INTERVALS from rate-limiter.ts instead.
export const MIN_REQUEST_INTERVAL = 1000

// Maximum time to wait on a 429 Retry-After header (10 seconds).
// If Klaviyo says "wait 3723s" (62 minutes!), we fail fast and let
// the cache/fallback layer handle it instead of blocking the serverless function.
const MAX_RETRY_AFTER_MS = 10_000

// Timeout for individual Klaviyo HTTP requests.
// 15s: above typical Klaviyo p99 latency (~3s), below Vercel Pro function timeout (60s).
// AbortSignal.timeout() is supported in Node.js 17.3+ and Vercel runtimes without polyfill.
const KLAVIYO_FETCH_TIMEOUT_MS = 15_000

// Maximum cache age for rate-limit fallback.
// When Klaviyo returns 429, we serve cached data up to 48h old.
// Beyond 48h the data is too stale — show a friendly message instead.
export const RATE_LIMIT_MAX_CACHE_AGE_MS = 48 * 60 * 60 * 1000 // 48 hours

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Klaviyo API request with retry logic for rate limiting and server errors.
 *
 * Features:
 * - Global per-API-key queue to prevent concurrent request storms
 * - Exponential backoff on retry (1.5s, 3s, 6s)
 * - Handles 429 rate limiting with capped Retry-After (max 10s)
 * - Fails fast when rate limit wait is too long (prevents Vercel timeouts)
 * - Retries on 5xx server errors
 * - Configurable logging tag for debugging
 *
 * Based on: https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
 */
export async function klaviyoRequest<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: "GET" | "POST"
    body?: Record<string, unknown>
    /** Tag for log messages (e.g. "Report", "Flows"). Defaults to "Klaviyo". */
    logTag?: string
    /** Bypass daily report quota soft halt (e.g. user-triggered refresh). */
    force?: boolean
  }
): Promise<T | null> {
  // Route all requests through the global tiered rate limiter queue
  return enqueueKlaviyoRequest(apiKey, () =>
    _klaviyoRequestInner<T>(apiKey, endpoint, options),
    endpoint,
    { force: options?.force }
  )
}

/** Inner implementation — called from the rate limiter queue. */
async function _klaviyoRequestInner<T>(
  apiKey: string,
  endpoint: string,
  options?: {
    method?: "GET" | "POST"
    body?: Record<string, unknown>
    logTag?: string
  }
): Promise<T | null> {
  const { method = "GET", body, logTag = "Klaviyo" } = options || {}
  const url = endpoint.startsWith("http") ? endpoint : `${KLAVIYO_API_URL}${endpoint}`
  const maxRetries = 3

  log.info(`[${logTag}] REQUEST: ${method} ${endpoint}`)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 16000)
      log.info(`[${logTag}] Retry ${attempt}/${maxRetries} - waiting ${backoff}ms`)
      await sleep(backoff)
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Klaviyo-API-Key ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
          "revision": KLAVIYO_REVISION,
        },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(KLAVIYO_FETCH_TIMEOUT_MS),
      })

      log.info(`[${logTag}] RESPONSE: ${response.status} ${response.statusText}`)

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        const rawWaitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000

        // Fail fast if Klaviyo wants us to wait too long (prevents Vercel timeout).
        // Throw instead of returning null so callers can fall back to cached data.
        if (rawWaitTime > MAX_RETRY_AFTER_MS) {
          log.warn(`[${logTag}] Rate limited with Retry-After ${rawWaitTime}ms (>${MAX_RETRY_AFTER_MS}ms cap). Throwing — callers should use cached data.`)
          throw new KlaviyoRateLimitError(rawWaitTime)
        }

        log.warn(`[${logTag}] Rate limited. Waiting ${rawWaitTime}ms`)

        if (attempt < maxRetries) {
          await sleep(rawWaitTime)
          continue
        }
        log.error(`[${logTag}] Max retries reached for rate limiting`)
        throw new KlaviyoRateLimitError(rawWaitTime)
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < maxRetries) {
        log.warn(`[${logTag}] Server error ${response.status}, retrying...`)
        continue
      }

      const responseText = await response.text()

      if (!response.ok) {
        // Detect 401 authentication_failed — API key inválida/revogada.
        // Throw KlaviyoInvalidKeyError pra cron marcar a loja e nao
        // ficar retentando a cada ciclo (estava produzindo log spam).
        if (response.status === 401) {
          let authFailed = false
          try {
            const errBody = JSON.parse(responseText)
            const firstError = errBody?.errors?.[0]
            if (firstError?.code === "authentication_failed") authFailed = true
          } catch {
            // Body nao JSON — assume auth failure se status 401
            authFailed = true
          }
          if (authFailed) {
            const masked = apiKey.slice(0, 6) + "..." + apiKey.slice(-4)
            log.warn(`[${logTag}] 401 authentication_failed for key ${masked} — marking invalid`)
            throw new KlaviyoInvalidKeyError(`Klaviyo API key invalid (401 authentication_failed) for ${masked}`)
          }
        }

        // Detect 403 permission_denied — not retryable, surface to caller
        if (response.status === 403) {
          try {
            const errBody = JSON.parse(responseText)
            const firstError = errBody?.errors?.[0]
            if (firstError?.code === "permission_denied") {
              const detail: string = firstError.detail ?? ""
              const match = detail.match(/scopes?:\s*(.+)$/i)
              const parsed = match
                ? match[1].split(",").map((s: string) => s.trim()).filter(Boolean)
                : null
              if (!parsed || parsed.length === 0) {
                log.warn(`[${logTag}] Could not parse scopes from 403 detail: "${detail.substring(0, 200)}"`)
              }
              const missingScopes = parsed && parsed.length > 0 ? parsed : ["unknown"]
              log.error(`[${logTag}] Permission denied — missing scopes: ${missingScopes.join(", ")}`)
              throw new KlaviyoPermissionError(missingScopes)
            }
          } catch (parseErr) {
            if (parseErr instanceof KlaviyoPermissionError) throw parseErr
            // Parse failed — fall through to generic error handling
          }
        }

        // 4xx logam como warn (esperado: invalid key, scopes faltando, etc).
        // 5xx ou outros logam como error.
        if (response.status >= 400 && response.status < 500) {
          log.warn(`[${logTag}] API ERROR ${response.status}:`, responseText.substring(0, 500))
        } else {
          log.error(`[${logTag}] API ERROR ${response.status}:`, responseText.substring(0, 500))
        }
        return null
      }

      const data = JSON.parse(responseText) as T
      return data
    } catch (error) {
      if (error instanceof KlaviyoPermissionError) {
        throw error  // not retryable — permanent configuration error
      }
      if (error instanceof KlaviyoInvalidKeyError) {
        throw error  // not retryable — permanent key error
      }
      if (error instanceof KlaviyoRateLimitError) {
        log.warn(`[${logTag}] Rate limited after all retries for ${endpoint}`)
        throw error
      }
      if (error instanceof Error && error.name === "AbortError") {
        log.error(`[${logTag}] REQUEST TIMEOUT after ${KLAVIYO_FETCH_TIMEOUT_MS}ms: ${endpoint}`)
        if (attempt < maxRetries) continue  // timeout is recoverable — retry
        return null
      }
      // Detect non-ASCII characters in API key — fail fast, no retry
      if (error instanceof TypeError && error.message.includes("ByteString")) {
        const masked = apiKey.length > 8 ? `...${apiKey.slice(-4)}` : "***"
        log.error(`[${logTag}] API key ${masked} contains invalid non-ASCII characters. Fix the key in store settings.`)
        throw new KlaviyoInvalidKeyError(`Non-ASCII character in API key ${masked}`)
      }
      log.error(`[${logTag}] REQUEST ERROR:`, error)
      if (attempt < maxRetries) continue
      return null
    }
  }

  return null
}

/**
 * Currency symbol lookup.
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    "USD": "$", "EUR": "€", "GBP": "£", "BRL": "R$",
    "AUD": "A$", "CAD": "C$", "JPY": "¥", "CNY": "¥",
    "MXN": "MX$", "ARS": "AR$", "CLP": "CL$", "COP": "CO$", "PEN": "S/",
  }
  return symbols[currency] || currency
}

/**
 * Parse period string into start/end Date objects.
 */
export function parseDateRange(
  period: string,
  customStartDate?: string | null,
  customEndDate?: string | null
): { startDate: Date; endDate: Date } {
  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now)

  if (period === "custom" && customStartDate && customEndDate) {
    startDate = new Date(customStartDate)
    endDate = new Date(customEndDate)
  } else {
    endDate.setHours(23, 59, 59, 999)

    switch (period) {
      case "1d":
      case "today":
        startDate = new Date(now)
        break
      case "yesterday":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 1)
        endDate = new Date(startDate)
        endDate.setHours(23, 59, 59, 999)
        break
      case "7d":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 7)
        break
      case "15d":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 15)
        break
      case "30d":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 30)
        break
      case "90d":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 90)
        break
      case "12m":
      case "all":
        startDate = new Date(now)
        startDate.setMonth(now.getMonth() - 12)
        break
      default:
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 30)
    }
    startDate.setHours(0, 0, 0, 0)
  }

  return { startDate, endDate }
}

/**
 * Compute "now" in a given IANA timezone and return YYYY-MM-DD strings.
 *
 * On Vercel (UTC), new Date() gives UTC time. If the Klaviyo account is in
 * America/Sao_Paulo (UTC-3), "today" at 22h SP = tomorrow 01h UTC.
 * This function ensures the date range matches what the Klaviyo dashboard shows.
 */
export function parseDateRangeInTimezone(
  period: string,
  timezone: string,
  customStartDate?: string | null,
  customEndDate?: string | null
): { startDateStr: string; endDateStr: string } {
  if (period === "custom" && customStartDate && customEndDate) {
    return { startDateStr: customStartDate, endDateStr: customEndDate }
  }

  // Get current date components in the target timezone
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  // en-CA format is YYYY-MM-DD
  const todayStr = formatter.format(now)

  // Parse the "today" in target timezone to do arithmetic
  const [y, m, d] = todayStr.split("-").map(Number)
  const todayLocal = new Date(y, m - 1, d)

  let startLocal: Date

  switch (period) {
    case "today":
    case "1d":
      startLocal = new Date(todayLocal)
      break
    case "yesterday":
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 1)
      return { startDateStr: formatDateStr(startLocal), endDateStr: formatDateStr(startLocal) }
    case "7d":
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 7)
      break
    case "15d":
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 15)
      break
    case "30d":
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 30)
      break
    case "90d":
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 90)
      break
    case "12m":
    case "all":
      startLocal = new Date(todayLocal)
      startLocal.setMonth(startLocal.getMonth() - 12)
      break
    default:
      startLocal = new Date(todayLocal)
      startLocal.setDate(startLocal.getDate() - 30)
  }

  return { startDateStr: formatDateStr(startLocal), endDateStr: todayStr }
}

/**
 * Format Date to YYYY-MM-DD string.
 * Uses local date components (not UTC) to avoid timezone shift on servers running in UTC.
 */
export function formatDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
