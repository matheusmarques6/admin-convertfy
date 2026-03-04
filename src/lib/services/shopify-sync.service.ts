/**
 * Shopify Sync Service - Thin wrapper over generateShopifyReport
 *
 * Returns SyncResult<T> for standardized error handling.
 * Used by portal dashboard (direct import, no HTTP self-call)
 * and future live fallback (Stories 10.5/10.6).
 *
 * Story 10.3 - Extract Shopify Sync Service + Eliminar Self-Call no Portal
 */

import { generateShopifyReport } from "@/lib/integrations/shopify/report"
import type { ShopifyFullReportData } from "@/lib/integrations/shopify/report"
import type { SyncResult } from "@/lib/shared/data-status"

export type { ShopifyFullReportData } from "@/lib/integrations/shopify/report"

export async function syncShopifyForStore(
  storeId: string,
  period: string,
  options?: { customStartDate?: string; customEndDate?: string },
): Promise<SyncResult<ShopifyFullReportData>> {
  try {
    const data = await generateShopifyReport(storeId, {
      period,
      customStartDate: options?.customStartDate || null,
      customEndDate: options?.customEndDate || null,
    })
    return {
      success: data.success && data.connected,
      data: data.success && data.connected ? data : null,
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "Unknown Shopify error",
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  }
}
