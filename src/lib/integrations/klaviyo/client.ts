/**
 * Klaviyo API Client - Unified HTTP helpers
 *
 * Single source of truth for all Klaviyo API communication.
 * Used by all /api/integrations/klaviyo/* routes.
 */

import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoClient")

// Latest stable API revision per Klaviyo documentation
// https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation_policy
export const KLAVIYO_API_URL = "https://a.klaviyo.com/api"
export const KLAVIYO_REVISION = "2024-10-15"

// Rate limits per Klaviyo docs:
// - Burst: 3/s for most endpoints, 1/s for reporting
// - Steady: 75/m for most endpoints
// https://developers.klaviyo.com/en/docs/rate_limits_and_error_handling
export const MIN_REQUEST_INTERVAL = 1000 // 1 second between reporting requests

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Klaviyo API request with retry logic for rate limiting and server errors.
 *
 * Features:
 * - Exponential backoff on retry (1.5s, 3s, 6s)
 * - Handles 429 rate limiting with Retry-After header
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
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000
        log.warn(`[${logTag}] Rate limited. Waiting ${waitTime}ms`)

        if (attempt < maxRetries) {
          await sleep(waitTime)
          continue
        }
        log.error(`[${logTag}] Max retries reached for rate limiting`)
        return null
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
        startDate.setFullYear(now.getFullYear() - 1)
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
 * Format Date to YYYY-MM-DD string.
 */
export function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}
