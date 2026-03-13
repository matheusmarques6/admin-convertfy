/**
 * Klaviyo Report Summary - Lightweight revenue fetcher
 *
 * Used by the stores control panel to get Klaviyo revenue data
 * without HTTP self-fetch. Calls Klaviyo reporting API directly.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { klaviyoRequest, parseDateRangeInTimezone, RATE_LIMIT_MAX_CACHE_AGE_MS } from "./client"
import { KlaviyoRateLimitError } from "./client"
import { getTimezoneOffset } from "./account"
import { getCachedAccountInfo } from "./cached-metadata"
import { getCachedPlacedOrderMetric } from "./cached-metadata"
import { type SyncResult, isCachedPeriod } from "@/lib/shared/data-status"
import { createAdminClient } from "@/lib/supabase/server"

const log = logger.child("KlaviyoReportSummary")

export interface KlaviyoRevenueSummary {
  totalRevenue: number
  campaignRevenue: number
  flowRevenue: number
  /** ISO 4217 currency code from Klaviyo account (e.g. "USD", "BRL") */
  currency: string
  campaignReportAvailable?: boolean
  flowReportAvailable?: boolean
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

    // Get timezone + currency for correct date alignment and currency tracking
    const accountInfo = await getCachedAccountInfo(apiKey, undefined, storeId)
    const accountTimezone = accountInfo?.timezone
    if (!accountTimezone) {
      log.warn(`Store ${storeId}: no timezone from account info, falling back to America/Sao_Paulo`)
    }
    const timezone = accountTimezone || "America/Sao_Paulo"
    const currency = accountInfo?.currency || "BRL"

    // Calculate date range using account timezone (consistent with cron)
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, timezone, customStartDate, customEndDate)
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
        campaignReportAvailable: campaignReport !== null,
        flowReportAvailable: flowReport !== null,
      },
      source: "live", fetchedAt: new Date().toISOString(),
    }
  } catch (error) {
    // Rate limit: try to serve stale data from store_revenue_summary
    if (error instanceof KlaviyoRateLimitError) {
      log.warn(`Store ${storeId}: rate limited, attempting stale cache fallback...`)
      try {
        if (isCachedPeriod(period)) {
          const adminClient = createAdminClient()
          const { data: row } = await adminClient
            .from("store_revenue_summary")
            .select("*")
            .eq("store_id", storeId)
            .eq("period_label", period)
            .order("fetched_at", { ascending: false })
            .limit(1)
            .single()

          if (row) {
            const fetchedAt = new Date(row.fetched_at as string)
            const isStale = Date.now() - fetchedAt.getTime() > RATE_LIMIT_MAX_CACHE_AGE_MS
            const isError = row.sync_status === "error" && row.campaign_revenue === 0 && row.flow_revenue === 0

            if (!isStale && !isError) {
              const cached: KlaviyoRevenueSummary = {
                totalRevenue: ((row.campaign_revenue as number) || 0) + ((row.flow_revenue as number) || 0),
                campaignRevenue: (row.campaign_revenue as number) || 0,
                flowRevenue: (row.flow_revenue as number) || 0,
                currency: (row.currency as string) || "BRL",
              }
              log.info(`Store ${storeId}: rate limit fallback serving stale cache from ${row.fetched_at}`)
              return {
                success: true, data: cached,
                source: "stale-cache", fetchedAt: row.fetched_at as string,
              }
            }
          }
        }
      } catch (fallbackErr) {
        log.error(`Store ${storeId}: rate limit fallback error:`, fallbackErr)
      }
      return {
        success: false, data: null,
        error: "Rate limited, sem dados em cache",
        source: "live", fetchedAt: new Date().toISOString(),
      }
    }

    log.error("Error in getKlaviyoRevenueForStore:", error)
    return {
      success: false, data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      source: "live", fetchedAt: new Date().toISOString(),
    }
  }
}
