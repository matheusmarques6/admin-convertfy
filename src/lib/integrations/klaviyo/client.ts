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

// Latest stable API revision per Klaviyo documentation
// https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy
export const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
export const KLAVIYO_REVISION = "2024-10-15"

// Rate limits per Klaviyo docs:
// - Burst: 3/s for most endpoints, 1/s for reporting
// - Steady: 75/m for most endpoints
// https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
export const MIN_REQUEST_INTERVAL = 1000 // 1 second between reporting requests

// Maximum time to wait on a 429 Retry-After header (10 seconds).
// If Klaviyo says "wait 3723s" (62 minutes!), we fail fast and let
// the cache/fallback layer handle it instead of blocking the serverless function.
const MAX_RETRY_AFTER_MS = 10_000

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
  }
): Promise<T | null> {
  // Route all requests through the global rate limiter queue
  return enqueueKlaviyoRequest(apiKey, () =>
    _klaviyoRequestInner<T>(apiKey, endpoint, options)
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
        log.error(`[${logTag}] API ERROR ${response.status}:`, responseText.substring(0, 500))
        return null
      }

      const data = JSON.parse(responseText) as T
      return data
    } catch (error) {
      if (error instanceof KlaviyoRateLimitError) {
        log.warn(`[${logTag}] Rate limited after all retries for ${endpoint}`)
      } else {
        log.error(`[${logTag}] REQUEST ERROR:`, error)
      }
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
    "AUD": "A$", "CAD": "C$", "JPY": "¥", "MXN": "MX$",
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
