/**
 * Klaviyo Report Summary - Lightweight revenue fetcher
 *
 * Used by the stores control panel to get Klaviyo revenue data
 * without HTTP self-fetch. Calls Klaviyo reporting API directly.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { klaviyoRequest, parseDateRange, formatDateStr } from "./client"
import { getTimezoneOffset } from "./account"
import { getCachedAccountInfo } from "./cached-metadata"
import { getCachedPlacedOrderMetric } from "./cached-metadata"
import { type SyncResult } from "@/lib/shared/data-status"

const log = logger.child("KlaviyoReportSummary")

export interface KlaviyoRevenueSummary {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  /** ISO 4217 currency code from Klaviyo account (e.g. "USD", "BRL") */
  currency: string
}

interface KlaviyoValuesReport {
  data?: {
    attributes?: {
      results?: Array<{
        statistics?: Record<string, number | string>
      }>
    }
  }
}

/**
 * Lightweight function that returns only the revenue data needed by the
 * stores control panel.
 *
 * Does NOT depend on NextRequest or cookies. Fetches credentials via
 * admin client internally.
 */
export async function getKlaviyoRevenueForStore(
  storeId: string,
  period: string,
  customStartDate?: string | null,
  customEndDate?: string | null
): Promise<SyncResult<KlaviyoRevenueSummary>> {
  try {
    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key

    if (!apiKey) {
      log.warn(`Store ${storeId}: no Klaviyo API key found after decryption`)
      return {
        success: false, data: null,
        error: "No valid Klaviyo API key",
        source: "live", fetchedAt: new Date().toISOString(),
      }
    }

    // Calculate date range
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Get timezone + currency for correct date alignment and currency tracking
    const accountInfo = await getCachedAccountInfo(apiKey, undefined, storeId)
    const timezone = accountInfo?.timezone || "America/Sao_Paulo"
    const currency = accountInfo?.currency || "BRL"
    const tzOffset = getTimezoneOffset(timezone)

    const startISO = `${startDateStr}T00:00:00${tzOffset}`
    const endISO = `${endDateStr}T23:59:59${tzOffset}`

    // Find Placed Order metric for conversion revenue (DB-cached)
    const placedOrderMetric = await getCachedPlacedOrderMetric(apiKey, undefined, storeId)

    // conversion_metric_id is required by Klaviyo API — skip reports if metric not found
    if (!placedOrderMetric) {
      log.warn(`Store ${storeId}: Placed Order metric not found (missing metrics:read scope or no e-commerce integration). Returning zero revenue.`)
      return {
        success: true,
        data: { totalRevenue: 0, campaignRevenue: 0, flowRevenue: 0, currency },
        source: "live", fetchedAt: new Date().toISOString(),
      }
    }

    const reportAttributes = {
      statistics: ["conversion_value"],
      timeframe: { start: startISO, end: endISO },
      conversion_metric_id: placedOrderMetric,
    }

    // Fetch campaign and flow reports in parallel
    const [campaignReport, flowReport] = await Promise.all([
      klaviyoRequest<KlaviyoValuesReport>(apiKey, "/campaign-values-reports/", {
        method: "POST",
        body: {
          data: {
            type: "campaign-values-report",
            attributes: reportAttributes,
          },
        },
        logTag: "KlaviyoReportSummary",
      }),
      klaviyoRequest<KlaviyoValuesReport>(apiKey, "/flow-values-reports/", {
        method: "POST",
        body: {
          data: {
            type: "flow-values-report",
            attributes: reportAttributes,
          },
        },
        logTag: "KlaviyoReportSummary",
      }),
    ])

    if (!campaignReport && !flowReport) {
      log.warn(`Store ${storeId}: both Klaviyo report requests returned null (API error or rate limit)`)
      return {
        success: false, data: null,
        error: "Both campaign and flow report requests failed",
        source: "live", fetchedAt: new Date().toISOString(),
      }
    }

    // Sum up revenue from campaign results
    let campaignRevenue = 0
    const campaignResults = campaignReport?.data?.attributes?.results || []
    for (const r of campaignResults) {
      campaignRevenue += Number(r.statistics?.conversion_value) || 0
    }

    // Sum up revenue from flow results
    let flowRevenue = 0
    const flowResults = flowReport?.data?.attributes?.results || []
    for (const r of flowResults) {
      flowRevenue += Number(r.statistics?.conversion_value) || 0
    }

    log.info(`Store ${storeId}: campaign=${currency} ${campaignRevenue}, flow=${currency} ${flowRevenue}`)

    return {
      success: true,
      data: {
        totalRevenue: campaignRevenue + flowRevenue,
        campaignRevenue,
        flowRevenue,
        currency,
      },
      source: "live", fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    log.error("Error in getKlaviyoRevenueForStore:", error)
    return {
      success: false, data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      source: "live", fetchedAt: new Date().toISOString(),
    }
  }
}
