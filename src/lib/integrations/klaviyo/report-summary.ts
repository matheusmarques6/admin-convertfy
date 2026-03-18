/**
 * Klaviyo Report Summary - Lightweight revenue fetcher
 *
 * Used by the stores control panel to get Klaviyo revenue data
 * without HTTP self-fetch. Calls Klaviyo reporting API directly.
 *
 * NOTE: This module uses the Reporting API (campaign-values-reports,
 * flow-values-reports) which attributes revenue by message SEND date.
 * This matches the Klaviyo dashboard UI exactly.
 *
 * The total store revenue (storeRevenue) used elsewhere comes from
 * Metric Aggregates (event-date attribution) in klaviyo-sync.service.ts.
 * A <5% divergence between these sources is expected for periods >= 7d.
 * See docs/architecture/adr-klaviyo-revenue-source.md for full rationale.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"
import { klaviyoRequest, parseDateRangeInTimezone, RATE_LIMIT_MAX_CACHE_AGE_MS } from "./client"
import { KlaviyoRateLimitError } from "./client"
import { getTimezoneOffset } from "./account"
import { getCachedAccountInfo } from "./cached-metadata"
import { getCachedPlacedOrderMetric } from "./cached-metadata"
import { type SyncResult, isCachedPeriod, isCustomPeriod, buildCustomPeriodLabel, LIVE_FETCH_CACHE_TTL_MS, isCustomRangeCacheFresh, getCustomRangeTTL } from "@/lib/shared/data-status"
import { createAdminClient } from "@/lib/supabase/server"

const log = logger.child("KlaviyoReportSummary")

/**
 * Maximum age (ms) for cache to be considered "fresh" in admin panel lookups.
 * Set to 1 hour — the cron syncs every ~4 min, so cached data is almost always
 * fresher than this. This threshold only guards against serving very stale data
 * if the cron has been down.
 */
export const CACHE_FRESH_MS = 60 * 60 * 1000

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
  customEndDate?: string | null,
  orgId?: string | null
): Promise<SyncResult<KlaviyoRevenueSummary>> {
  try {
    const storeData = await getStoreCredentials(storeId, orgId ?? undefined)
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

    // AK-3: Cache-first — return fresh cached data without calling API.
    // When operators open multiple stores in the admin panel, this avoids redundant
    // XS-tier API calls (4s each) for data the cron already synced.
    if (isCachedPeriod(period)) {
      try {
        const adminClient = createAdminClient()
        const { data: row } = await adminClient
          .from("store_revenue_summary")
          .select("klaviyo_campaign_revenue, klaviyo_flow_revenue, currency, fetched_at, sync_status")
          .eq("store_id", storeId)
          .eq("period_label", period)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .single()

        if (row && row.sync_status !== "error") {
          const fetchedAt = new Date(row.fetched_at as string)
          const ageMs = Date.now() - fetchedAt.getTime()
          if (ageMs < CACHE_FRESH_MS) {
            const cached: KlaviyoRevenueSummary = {
              totalRevenue: ((row.klaviyo_campaign_revenue as number) ?? 0) + ((row.klaviyo_flow_revenue as number) ?? 0),
              campaignRevenue: (row.klaviyo_campaign_revenue as number) ?? 0,
              flowRevenue: (row.klaviyo_flow_revenue as number) ?? 0,
              currency: (row.currency as string) || currency,
            }
            log.info(`Store ${storeId}: serving fresh cache (age=${Math.round(ageMs / 1000)}s) for period ${period}`)
            return {
              success: true, data: cached,
              source: "cache", fetchedAt: row.fetched_at as string,
            }
          }
        }
      } catch {
        // Cache lookup failed — fall through to live API call
      }
    }

    // AK-13: Cache-first for 1d — check write-through cache before live fetch.
    // 1d is LIVE_ONLY (not pre-populated by cron), but previous live fetches are persisted
    // with a 5-minute TTL to deduplicate requests across operators.
    if (period === "1d") {
      try {
        const adminClient = createAdminClient()
        const { data: row } = await adminClient
          .from("store_revenue_summary")
          .select("klaviyo_campaign_revenue, klaviyo_flow_revenue, currency, fetched_at, sync_status")
          .eq("store_id", storeId)
          .eq("period_label", "1d")
          .single()

        if (row && row.sync_status !== "error") {
          const fetchedAt = new Date(row.fetched_at as string)
          const ageMs = Date.now() - fetchedAt.getTime()
          if (ageMs < LIVE_FETCH_CACHE_TTL_MS) {
            const cached: KlaviyoRevenueSummary = {
              totalRevenue: ((row.klaviyo_campaign_revenue as number) ?? 0) + ((row.klaviyo_flow_revenue as number) ?? 0),
              campaignRevenue: (row.klaviyo_campaign_revenue as number) ?? 0,
              flowRevenue: (row.klaviyo_flow_revenue as number) ?? 0,
              currency: (row.currency as string) || currency,
            }
            log.info(`Store ${storeId}: 1d cache hit (age=${Math.round(ageMs / 1000)}s)`)
            return {
              success: true, data: cached,
              source: "cache", fetchedAt: row.fetched_at as string,
            }
          }
        }
      } catch {
        // Cache lookup failed — fall through to live API call
      }
    }

    // CR2: Cache-first for custom ranges — check write-through cache before live fetch.
    // Custom ranges use the upsert_custom_range_cache RPC with (store_id, range_start, range_end) uniqueness.
    if (isCustomPeriod(period) && customStartDate && customEndDate) {
      try {
        const adminClient = createAdminClient()
        const customLabel = buildCustomPeriodLabel(customStartDate, customEndDate)
        const { data: row } = await adminClient
          .from("store_revenue_summary")
          .select("klaviyo_campaign_revenue, klaviyo_flow_revenue, currency, fetched_at, sync_status")
          .eq("store_id", storeId)
          .eq("period_label", customLabel)
          .single()

        if (row && row.sync_status !== "error") {
          const rangeStart = new Date(customStartDate)
          const rangeEnd = new Date(customEndDate)
          if (isCustomRangeCacheFresh(row.fetched_at as string, rangeStart, rangeEnd)) {
            const cached: KlaviyoRevenueSummary = {
              totalRevenue: ((row.klaviyo_campaign_revenue as number) ?? 0) + ((row.klaviyo_flow_revenue as number) ?? 0),
              campaignRevenue: (row.klaviyo_campaign_revenue as number) ?? 0,
              flowRevenue: (row.klaviyo_flow_revenue as number) ?? 0,
              currency: (row.currency as string) || currency,
            }
            const ageMs = Date.now() - new Date(row.fetched_at as string).getTime()
            log.info(`Store ${storeId}: custom range cache hit (age=${Math.round(ageMs / 1000)}s, ${customStartDate}..${customEndDate})`)
            return {
              success: true, data: cached,
              source: "cache", fetchedAt: row.fetched_at as string,
            }
          }
        }
      } catch {
        // Cache lookup failed — fall through to live API call
      }
    }

    const reportAttributes = {
      statistics: ["conversion_value"],
      timeframe: { start: startISO, end: endISO },
      conversion_metric_id: placedOrderMetric,
    }

    // Fetch campaign and flow reports sequentially (AK-4)
    // Reporting API is tier XS (1 req/s burst). Promise.all would violate burst limit.
    const campaignReport = await klaviyoRequest<KlaviyoValuesReport>(apiKey, "/campaign-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "campaign-values-report",
          attributes: reportAttributes,
        },
      },
      logTag: "KlaviyoReportSummary",
    })
    const flowReport = await klaviyoRequest<KlaviyoValuesReport>(apiKey, "/flow-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "flow-values-report",
          attributes: reportAttributes,
        },
      },
      logTag: "KlaviyoReportSummary",
    })

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

    // AK-13: Write-through — persist 1d live fetch results for 5-minute deduplication
    if (period === "1d") {
      try {
        const adminClient = createAdminClient()

        const { data: storeRow } = await adminClient
          .from("client_stores")
          .select("org_id")
          .eq("id", storeId)
          .single()

        if (storeRow?.org_id) {
          const expiresAt = new Date(Date.now() + LIVE_FETCH_CACHE_TTL_MS).toISOString()

          await adminClient
            .from("store_revenue_summary")
            .upsert({
              store_id: storeId,
              org_id: storeRow.org_id,
              period_label: "1d",
              period_start: startISO,
              period_end: endISO,
              klaviyo_total_revenue: campaignRevenue + flowRevenue,
              klaviyo_campaign_revenue: campaignRevenue,
              klaviyo_flow_revenue: flowRevenue,
              store_total_revenue: 0,
              currency,
              sync_status: "ok",
              sync_source: "live",
              sync_error: null,
              expires_at: expiresAt,
              fetched_at: new Date().toISOString(),
            }, { onConflict: "store_id,period_label" })

          log.info(`Store ${storeId}: 1d write-through cache saved (TTL=5min)`)
        }
      } catch (cacheErr) {
        // Write-through is best-effort — do not fail the request
        log.warn(`Store ${storeId}: failed to write-through 1d cache:`, cacheErr)
      }
    }

    // CR2: Write-through for custom ranges — persist via upsert_custom_range_cache RPC
    if (isCustomPeriod(period) && customStartDate && customEndDate) {
      try {
        const adminClient = createAdminClient()

        const { data: storeRow } = await adminClient
          .from("client_stores")
          .select("org_id")
          .eq("id", storeId)
          .single()

        if (storeRow?.org_id) {
          const rangeStart = new Date(customStartDate)
          const rangeEnd = new Date(customEndDate)
          const ttlMs = getCustomRangeTTL(rangeStart, rangeEnd)
          const expiresAt = new Date(Date.now() + ttlMs).toISOString()

          await adminClient.rpc("upsert_custom_range_cache", {
            p_store_id: storeId,
            p_org_id: storeRow.org_id,
            p_range_start: customStartDate,
            p_range_end: customEndDate,
            p_period_start: startISO,
            p_period_end: endISO,
            p_klaviyo_total_revenue: campaignRevenue + flowRevenue,
            p_klaviyo_campaign_revenue: campaignRevenue,
            p_klaviyo_flow_revenue: flowRevenue,
            p_currency: currency,
            p_expires_at: expiresAt,
          })

          log.info(`Store ${storeId}: custom range write-through saved (${customStartDate}..${customEndDate}, TTL=${Math.round(ttlMs / 60_000)}min)`)
        }
      } catch (cacheErr) {
        // Write-through is best-effort — do not fail the request
        log.warn(`Store ${storeId}: failed to write-through custom range cache:`, cacheErr)
      }
    }

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
        if (isCachedPeriod(period) || period === "1d" || isCustomPeriod(period)) {
          const adminClient = createAdminClient()
          let query = adminClient
            .from("store_revenue_summary")
            .select("klaviyo_campaign_revenue, klaviyo_flow_revenue, currency, fetched_at, sync_status")
            .eq("store_id", storeId)

          if (isCustomPeriod(period) && customStartDate && customEndDate) {
            query = query.eq("period_label", buildCustomPeriodLabel(customStartDate, customEndDate))
          } else {
            query = query.eq("period_label", period)
          }

          const { data: row } = await query.single()

          if (row) {
            const fetchedAt = new Date(row.fetched_at as string)
            const isStale = Date.now() - fetchedAt.getTime() > RATE_LIMIT_MAX_CACHE_AGE_MS
            const isError = row.sync_status === "error"
              && (row.klaviyo_campaign_revenue as number) === 0
              && (row.klaviyo_flow_revenue as number) === 0

            if (!isStale && !isError) {
              const cached: KlaviyoRevenueSummary = {
                totalRevenue: ((row.klaviyo_campaign_revenue as number) ?? 0) + ((row.klaviyo_flow_revenue as number) ?? 0),
                campaignRevenue: (row.klaviyo_campaign_revenue as number) ?? 0,
                flowRevenue: (row.klaviyo_flow_revenue as number) ?? 0,
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
