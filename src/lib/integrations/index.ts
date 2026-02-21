// Types
export * from "./types"
export * from "./config"

// Services
export { AsaasService, createAsaasService, mapAsaasStatusToInternal } from "./asaas"
export { MetaAdsService, createMetaAdsService } from "./meta-ads"
export { GoogleAdsService, createGoogleAdsService, formatCustomerId } from "./google-ads"
export { ShopifyService, createShopifyService } from "./shopify"
export { WhatsAppService, createWhatsAppService } from "./whatsapp"
export { GoogleCalendarService, createGoogleCalendarService } from "./google-calendar"

// Klaviyo uses functional modules (not class-based)
export { testApiConnection as testKlaviyoConnection } from "./klaviyo"

import { IntegrationType } from "@/types"
import { createAsaasService } from "./asaas"
import { createMetaAdsService } from "./meta-ads"
import { createGoogleAdsService } from "./google-ads"
import { createShopifyService } from "./shopify"
import { createWhatsAppService } from "./whatsapp"
import { createGoogleCalendarService } from "./google-calendar"
import { testApiConnection, getAccountInfo, findPlacedOrderMetric } from "./klaviyo"

// Minimal Klaviyo adapter for the factory pattern
function createKlaviyoAdapter(credentials: Record<string, string>) {
  const apiKey = credentials.private_key || credentials.api_key || ""
  return {
    async testConnection(): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }> {
      const connected = await testApiConnection(apiKey)
      if (!connected) {
        return { success: false, error: "Klaviyo API connection failed" }
      }

      // Check reporting access by fetching account info + placed order metric
      const [accountInfo, placedOrderMetricId] = await Promise.all([
        getAccountInfo(apiKey).catch(() => null),
        findPlacedOrderMetric(apiKey).catch(() => null),
      ])

      return {
        success: true,
        details: {
          hasReportingAccess: placedOrderMetricId !== null,
          timezone: accountInfo?.timezone,
          orgName: accountInfo?.orgName,
          currency: accountInfo?.currency,
        },
      }
    },
  }
}

// Factory to create integration service by type
export function createIntegrationService(
  type: IntegrationType,
  credentials: Record<string, string>
) {
  switch (type) {
    case "asaas":
      return createAsaasService(credentials)
    case "meta_ads":
      return createMetaAdsService(credentials)
    case "google_ads":
      return createGoogleAdsService(credentials)
    case "klaviyo":
      return createKlaviyoAdapter(credentials)
    case "shopify":
      return createShopifyService(credentials)
    case "whatsapp":
      return createWhatsAppService(credentials)
    case "google_calendar":
      return createGoogleCalendarService(credentials)
    case "instagram":
      // Instagram uses the same Meta API
      return createMetaAdsService(credentials)
    default:
      throw new Error(`Unknown integration type: ${type}`)
  }
}

// Test integration connection
export async function testIntegrationConnection(
  type: IntegrationType,
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }> {
  try {
    const service = createIntegrationService(type, credentials)

    if ("testConnection" in service && typeof service.testConnection === "function") {
      return await service.testConnection()
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    }
  }
}
