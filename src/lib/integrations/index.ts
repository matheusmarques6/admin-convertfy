// Types
export * from "./types"
export * from "./config"

// Services
export { AsaasService, createAsaasService, mapAsaasStatusToInternal } from "./asaas"
export { MetaAdsService, createMetaAdsService } from "./meta-ads"
export { GoogleAdsService, createGoogleAdsService, formatCustomerId } from "./google-ads"
export { KlaviyoService, createKlaviyoService } from "./klaviyo"
export { ShopifyService, createShopifyService } from "./shopify"
export { WhatsAppService, createWhatsAppService } from "./whatsapp"
export { GoogleCalendarService, createGoogleCalendarService } from "./google-calendar"

import { IntegrationType } from "@/types"
import { createAsaasService } from "./asaas"
import { createMetaAdsService } from "./meta-ads"
import { createGoogleAdsService } from "./google-ads"
import { createKlaviyoService } from "./klaviyo"
import { createShopifyService } from "./shopify"
import { createWhatsAppService } from "./whatsapp"
import { createGoogleCalendarService } from "./google-calendar"

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
      return createKlaviyoService(credentials)
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
): Promise<{ success: boolean; error?: string }> {
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
