/**
 * Klaviyo API Client - Unified HTTP helpers
 *
 * Single source of truth for all Klaviyo API communication.
 * Used by all /api/integrations/klaviyo/* routes.
 */

import { logger } from "@/lib/logger"
import { fetchWithRetry } from "@/lib/utils/retry"

const log = logger.child("Klaviyo")

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
 * CORS headers for API routes.
 */
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

/**
 * Klaviyo API request with retry logic for rate limiting and server errors.
 *
 * Uses shared fetchWithRetry utility for exponential backoff.
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

  log.info(`${logTag} REQUEST: ${method} ${endpoint}`)

  try {
    const response = await fetchWithRetry(url, {
      method,
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "revision": KLAVIYO_REVISION,
      },
      ...(body && { body: JSON.stringify(body) }),
    })

    log.info(`${logTag} RESPONSE: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const responseText = await response.text()
      log.error(`${logTag} API ERROR ${response.status}: ${responseText.substring(0, 500)}`)
      return null
    }

    const responseText = await response.text()
    const data = JSON.parse(responseText) as T
    return data
  } catch (error) {
    log.error(`${logTag} REQUEST ERROR`, error instanceof Error ? { error: error.message } : { error })
    return null
  }
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
        startDate.setHours(0, 0, 0, 0)
        break
      case "yesterday":
        startDate = new Date(now)
        startDate.setDate(now.getDate() - 1)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(now)
        endDate.setDate(now.getDate() - 1)
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
