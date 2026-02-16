/**
 * Klaviyo Account helpers - connection test, account info, timezone.
 */

import { logger } from "@/lib/logger"
import { klaviyoRequest } from "./client"

const log = logger.child("KlaviyoAccount")

/**
 * Test API connection by calling the /accounts/ endpoint.
 */
export async function testApiConnection(apiKey: string): Promise<boolean> {
  log.info("Testing API connection...")
  const response = await klaviyoRequest<{
    data: Array<{ id: string }>
  }>(apiKey, "/accounts/")

  if (response?.data) {
    log.info("API connection successful")
    return true
  }
  log.error("API connection failed")
  return false
}

export interface KlaviyoAccountInfo {
  currency: string
  locale: string
  orgName: string
  timezone: string
}

/**
 * Get account info including timezone, currency, locale, and org name.
 * All consumers get the full object; each uses what it needs.
 */
export async function getAccountInfo(apiKey: string): Promise<KlaviyoAccountInfo> {
  const response = await klaviyoRequest<{
    data: Array<{
      id: string
      attributes: {
        preferred_currency: string
        locale: string
        timezone: string
        test_account: boolean
        contact_information: { organization_name: string }
      }
    }>
  }>(apiKey, "/accounts/")

  if (!response?.data?.[0]) {
    return { currency: "BRL", locale: "pt-BR", orgName: "", timezone: "America/Sao_Paulo" }
  }

  const attrs = response.data[0].attributes
  log.info(`Account timezone: ${attrs.timezone}`)

  return {
    currency: attrs.preferred_currency || "BRL",
    locale: attrs.locale || "pt-BR",
    orgName: attrs.contact_information?.organization_name || "",
    timezone: attrs.timezone || "America/Sao_Paulo"
  }
}

/**
 * Convert timezone name to UTC offset string.
 *
 * Examples:
 *   "America/Sao_Paulo" -> "-03:00"
 *   "America/New_York"  -> "-05:00"
 *   "Europe/London"     -> "+00:00"
 *
 * Uses Intl.DateTimeFormat with longOffset for reliable parsing.
 * Falls back to "+00:00" (UTC) on any error.
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    })
    const parts = formatter.formatToParts(now)
    const offsetPart = parts.find(p => p.type === 'timeZoneName')

    if (offsetPart && offsetPart.value.includes('GMT')) {
      // Parse "GMT-03:00" or "GMT+05:30" or "GMT" (UTC)
      const match = offsetPart.value.match(/GMT([+-]\d{2}):?(\d{2})?/)
      if (match) {
        const hours = match[1]
        const minutes = match[2] || '00'
        return `${hours}:${minutes}`
      }
      // "GMT" without offset means UTC
      if (offsetPart.value === 'GMT') {
        return "+00:00"
      }
    }
  } catch {
    log.warn(`Error parsing timezone ${timezone}, using UTC`)
  }
  return "+00:00"
}
