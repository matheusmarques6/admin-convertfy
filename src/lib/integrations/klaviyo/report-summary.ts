/**
 * Klaviyo Report Summary - Lightweight revenue fetcher
 *
 * Used by the stores control panel to get Klaviyo revenue data
 * without HTTP self-fetch. Calls Klaviyo reporting API directly.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { klaviyoRequest, parseDateRange, formatDateStr } from "./client"
import { getAccountInfo, getTimezoneOffset } from "./account"
import { findPlacedOrderMetric } from "./metrics"

const log = logger.child("KlaviyoReportSummary")

export interface KlaviyoRevenueSummary {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
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
): Promise<KlaviyoRevenueSummary> {
  try {
    const storeData = await getStoreCredentials(storeId)
    const apiKey = storeData.klaviyo_private_key || storeData.klaviyo_api_key

    if (!apiKey) {
      return { totalRevenue: 0, campaignRevenue: 0, flowRevenue: 0 }
    }

    // Calculate date range
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate)
    const startDateStr = formatDateStr(startDate)
    const endDateStr = formatDateStr(endDate)

    // Get timezone for correct date alignment
    const accountInfo = await getAccountInfo(apiKey)
    const timezone = accountInfo?.timezone || "America/Sao_Paulo"
    const tzOffset = getTimezoneOffset(timezone)

    const startISO = `${startDateStr}T00:00:00${tzOffset}`
    const endISO = `${endDateStr}T23:59:59${tzOffset}`

    // Find Placed Order metric for conversion revenue
    const placedOrderMetric = await findPlacedOrderMetric(apiKey)

    const reportAttributes = {
      statistics: ["conversion_value"],
      timeframe: { start: startISO, end: endISO },
      ...(placedOrderMetric ? { conversion_metric_id: placedOrderMetric } : {}),
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

    return {
      totalRevenue: campaignRevenue + flowRevenue,
      campaignRevenue,
      flowRevenue,
    }
  } catch (error) {
    log.error("Error in getKlaviyoRevenueForStore:", error)
    return { totalRevenue: 0, campaignRevenue: 0, flowRevenue: 0 }
  }
}
