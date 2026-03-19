/**
 * Klaviyo Sync Service
 *
 * Pure business logic for fetching and aggregating Klaviyo data.
 * NO database access — callers (cron, live endpoints) handle persistence.
 *
 * Extracted from src/app/api/cron/sync-reports/route.ts (Story 10.2)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REVENUE DATA SOURCES — Reporting API vs Metric Aggregates (ADR: AK-9)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This service uses TWO different Klaviyo APIs to fetch revenue data.
 * They have different semantics and will return different numbers for the
 * same time period. This is EXPECTED and documented below.
 *
 * 1. REPORTING API (flow-values-reports, campaign-values-reports)
 *    - Used for: flow/campaign breakdown (per-flow and per-campaign metrics)
 *    - Attribution: revenue attributed by message SEND date
 *    - Matches: Klaviyo dashboard UI exactly
 *    - Endpoint tier: XS (very restrictive rate limits)
 *
 * 2. METRIC AGGREGATES (/metric-aggregates/)
 *    - Used for: total store revenue and order count (no breakdown)
 *    - Attribution: revenue attributed by EVENT date (Placed Order timestamp)
 *    - Does NOT match Klaviyo dashboard (uses event time, not send time)
 *    - Advantage: cheaper API tier, no daily report cap, faster response
 *
 * WHY THE DIFFERENCE:
 *   Reporting API attributes revenue to the date the message was SENT.
 *   Metric Aggregates attributes revenue to the date the order was PLACED.
 *   Example: email sent on Jan 1, customer orders on Jan 3.
 *     - Reporting API: revenue counted on Jan 1
 *     - Metric Aggregates: revenue counted on Jan 3
 *
 * EXPECTED DIVERGENCE:
 *   For periods >= 7 days, the difference is typically <5%.
 *   For shorter periods (1-3 days), divergence can reach ~20% due to
 *   attribution window effects (5-day email window, 1-day SMS window).
 *
 * WHY WE USE BOTH:
 *   - Reporting API for flow/campaign breakdown: business requirement to match
 *     Klaviyo UI numbers exactly (clients compare our admin with Klaviyo dashboard).
 *   - Metric Aggregates for total store revenue: no daily report cap, lower API
 *     cost, and we only need the aggregate total (no per-flow/campaign split).
 *
 * IMPORTANT: Do NOT replace Reporting API with Metric Aggregates for
 * flow/campaign data. This was evaluated in Epic AK (March 2026) and rejected
 * due to unacceptable divergence from Klaviyo UI for short periods.
 *
 * References:
 *   - Klaviyo Attribution Model: https://developers.klaviyo.com/en/docs/changelog_
 *   - ADR: docs/architecture/adr-klaviyo-revenue-source.md
 *   - Decision: Epic AK, March 2026
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  klaviyoRequest,
  parseDateRangeInTimezone,
  KLAVIYO_API_URL,
  sleep,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
} from "@/lib/integrations/klaviyo"
import type { SyncResult } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoSyncService")

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlowNameInfo {
  name: string
  status: string
  trigger_type: string
}

export interface CampaignNameInfo {
  name: string
  status: string
  send_time: string | null
  channel: string
  subject: string | null
}

export interface FlowMetricRow {
  store_id: string
  org_id: string | null
  flow_id: string
  flow_name: string
  flow_status: string
  trigger_type: string
  period_start: string
  period_end: string
  recipients: number
  delivered: number
  delivery_rate: number
  opened: number
  open_rate: number
  clicked: number
  click_rate: number
  click_to_open_rate: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  revenue_per_recipient: number
  average_order_value: number
  bounced: number
  bounce_rate: number
  unsubscribed: number
  unsubscribe_rate: number
  fetched_at: string
}

export type Channel = "email" | "sms"

export interface CampaignMetricRow {
  store_id: string
  org_id: string | null
  campaign_id: string
  campaign_name: string
  campaign_status: string
  send_time: string | null
  subject: string | null
  channel: string
  period_start: string
  period_end: string
  recipients: number
  delivered: number
  delivery_rate: number
  opened: number | null
  open_rate: number | null
  clicked: number
  click_rate: number
  click_to_open_rate: number | null
  conversions: number
  conversion_rate: number
  conversion_value: number
  revenue_per_recipient: number
  average_order_value: number
  bounced: number | null
  bounce_rate: number | null
  unsubscribed: number
  unsubscribe_rate: number
  spam_complaints: number | null
  fetched_at: string
}

// ---------------------------------------------------------------------------
// Channel-specific Klaviyo reporting statistics (AK-7)
// ---------------------------------------------------------------------------

/** Email statistics for campaign-values-reports / flow-values-reports */
export const EMAIL_STATISTICS = [
  "average_order_value", "bounce_rate", "bounced", "click_rate",
  "click_to_open_rate", "clicks", "clicks_unique", "conversion_rate",
  "conversion_uniques", "conversion_value", "conversions", "delivered",
  "delivery_rate", "opens", "opens_unique", "recipients",
  "revenue_per_recipient", "spam_complaints", "unsubscribe_rate", "unsubscribes",
] as const

/** SMS statistics for campaign-values-reports */
export const SMS_STATISTICS = [
  "recipients_sms", "delivered_sms", "delivered_sms_unique",
  "clicked_sms", "clicked_sms_unique", "click_rate_sms",
  "conversion_rate_sms", "conversion_value_sms", "conversions_sms",
  "revenue_per_recipient_sms", "unsubscribed_sms", "unsubscribed_sms_unique",
] as const

/** Combined statistics for mixed-channel campaign reports (email + SMS in one request) */
export const CAMPAIGN_STATISTICS_MIXED = [
  ...EMAIL_STATISTICS,
  ...SMS_STATISTICS,
] as const

export interface AudienceItem {
  klaviyoId: string
  type: "list" | "segment"
  name: string
  profileCount: number
  isActive?: boolean
  isStarred?: boolean
  isMainList: boolean
  isEngagedSegment: boolean
  createdAtKlaviyo?: string
}

export interface AudienceData {
  totalLeads: number
  engagedLeads: number
  engagementRate: number
  items: AudienceItem[]
}

export interface StoreRevenueData {
  storeRevenue: number
  storeOrders: number
}

export interface KlaviyoSyncParams {
  storeId: string
  orgId: string | null
  apiKey: string
  timezone: string
  timezoneOffset: string
  metricId: string
  period: string
  flowNames: Map<string, FlowNameInfo>
  campNames: Map<string, CampaignNameInfo>
  /** ISO 4217 currency from Klaviyo account */
  currency: string
}

export interface KlaviyoSyncData {
  campaignRevenue: number
  flowRevenue: number
  campaignDataAvailable: boolean
  flowDataAvailable: boolean
  storeRevenue: number
  storeOrders: number
  startDateStr: string
  endDateStr: string
  flowRows: FlowMetricRow[]
  campRows: CampaignMetricRow[]
  /** ISO 4217 currency code from Klaviyo account (e.g. "USD", "BRL") */
  currency: string
}

// ── API Response Types (internal) ────────────────────────────────────────────

type FlowListResp = {
  data: Array<{ id: string; attributes: { name: string; status: string; trigger_type: string } }>
  links?: { next?: string }
}

type CampListResp = {
  data: Array<{
    id: string
    attributes: {
      name: string; status: string; send_time: string | null
      channel?: string; send_options?: { subject?: string }; message?: { subject?: string }
    }
  }>
  links?: { next?: string }
}

type AudienceListResp = {
  data: Array<{ id: string; attributes: { name: string; profile_count?: number; created?: string } }>
  links?: { next?: string }
}

type AudienceSegResp = {
  data: Array<{ id: string; attributes: { name: string; profile_count?: number; is_active?: boolean; is_starred?: boolean; created?: string } }>
  links?: { next?: string }
}

type AudienceDetailResp = {
  data: { attributes: { profile_count?: number } }
}

// ── Flow/Campaign Name Fetch ─────────────────────────────────────────────────

export async function fetchFlowNames(apiKey: string): Promise<Map<string, FlowNameInfo>> {
  const flowNames = new Map<string, FlowNameInfo>()
  let flowPage: string | null = "/flows/"
  while (flowPage) {
    const resp: FlowListResp | null = await klaviyoRequest<FlowListResp>(apiKey, flowPage)
    if (!resp?.data) break
    for (const f of resp.data) {
      flowNames.set(f.id, { name: f.attributes.name, status: f.attributes.status, trigger_type: f.attributes.trigger_type })
    }
    flowPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
    if (flowPage) await sleep(500)
  }
  return flowNames
}

export async function fetchCampaignNames(apiKey: string): Promise<Map<string, CampaignNameInfo>> {
  const campNames = new Map<string, CampaignNameInfo>()
  for (const channel of ["email", "sms"]) {
    let campPage: string | null = `/campaigns?filter=equals(messages.channel,'${channel}')`
    while (campPage) {
      const resp: CampListResp | null = await klaviyoRequest<CampListResp>(apiKey, campPage)
      if (!resp?.data) break
      for (const c of resp.data) {
        campNames.set(c.id, {
          name: c.attributes.name,
          status: c.attributes.status,
          send_time: c.attributes.send_time,
          channel: c.attributes.channel || channel,
          subject: c.attributes.send_options?.subject || c.attributes.message?.subject || null,
        })
      }
      campPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (campPage) await sleep(500)
    }
  }
  return campNames
}

// ── Audience Fetch ───────────────────────────────────────────────────────────

export async function fetchAudienceForStore(apiKey: string): Promise<SyncResult<AudienceData>> {
  try {
    // 1. Fetch all lists with name and profile count
    const allLists: Array<{ id: string; name: string; profileCount: number; created?: string }> = []
    let listPage: string | null = "/lists/"
    while (listPage) {
      const resp: AudienceListResp | null = await klaviyoRequest<AudienceListResp>(apiKey, listPage)
      if (!resp?.data) break
      for (const l of resp.data) {
        allLists.push({ id: l.id, name: l.attributes.name, profileCount: l.attributes.profile_count ?? 0, created: l.attributes.created })
      }
      listPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (listPage) await sleep(500)
    }

    // Individual fetch for lists with 0 count (API quirk: collection endpoint may not return count)
    const allListsZero = allLists.length > 0 && allLists.every(l => l.profileCount === 0)
    if (allListsZero) {
      for (const list of allLists.slice(0, 5)) {
        const detail: AudienceDetailResp | null = await klaviyoRequest<AudienceDetailResp>(apiKey, `/lists/${list.id}/?additional-fields[list]=profile_count`)
        if (detail?.data?.attributes?.profile_count) {
          list.profileCount = detail.data.attributes.profile_count
        }
        await sleep(500)
      }
    }

    const largestList = allLists.reduce(
      (max, l) => (l.profileCount > max.profileCount ? l : max),
      { id: "", name: "", profileCount: 0 },
    )
    // totalLeads = sum of ALL lists (not just largest) to avoid engagementRate >100%
    const totalLeads = allLists.reduce((sum, l) => sum + l.profileCount, 0)

    // 2. Fetch all segments with name, profile count, and metadata
    const allSegments: Array<{ id: string; name: string; profileCount: number; isActive?: boolean; isStarred?: boolean; created?: string }> = []
    let segPage: string | null = "/segments/"
    while (segPage) {
      const resp: AudienceSegResp | null = await klaviyoRequest<AudienceSegResp>(apiKey, segPage)
      if (!resp?.data) break
      for (const s of resp.data) {
        allSegments.push({
          id: s.id, name: s.attributes.name, profileCount: s.attributes.profile_count ?? 0,
          isActive: s.attributes.is_active, isStarred: s.attributes.is_starred, created: s.attributes.created,
        })
      }
      segPage = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (segPage) await sleep(500)
    }

    // Find engaged segment: prefer "Engaged 90d" / "Engajados 90d", fallback to any "engaged"
    const engagedSegment = allSegments.find(s => {
      const name = s.name.toLowerCase()
      return (name.includes("engaged") || name.includes("engajados")) && name.includes("90")
    }) || allSegments.find(s => {
      const name = s.name.toLowerCase()
      return name.includes("engaged") || name.includes("engajados")
    })

    // Individual fetch if engaged segment has 0 count
    if (engagedSegment && engagedSegment.profileCount === 0) {
      const detail: AudienceDetailResp | null = await klaviyoRequest<AudienceDetailResp>(apiKey, `/segments/${engagedSegment.id}/?additional-fields[segment]=profile_count`)
      if (detail?.data?.attributes?.profile_count) {
        engagedSegment.profileCount = detail.data.attributes.profile_count
      }
      await sleep(500)
    }

    const engagedLeads = engagedSegment?.profileCount || 0
    const rawEngagementRate = totalLeads > 0 ? (engagedLeads / totalLeads) * 100 : 0
    if (rawEngagementRate > 100) {
      log.warn(`[Audience] Engagement rate ${rawEngagementRate.toFixed(1)}% exceeds 100% — capping. totalLeads=${totalLeads}, engagedLeads=${engagedLeads}`)
    }
    const engagementRate = Math.min(rawEngagementRate, 100)

    // Build unified audience items array
    const items: AudienceItem[] = [
      ...allLists.map(l => ({
        klaviyoId: l.id,
        type: "list" as const,
        name: l.name,
        profileCount: l.profileCount,
        isMainList: l.id === largestList.id && largestList.profileCount > 0,
        isEngagedSegment: false,
        createdAtKlaviyo: l.created,
      })),
      ...allSegments.map(s => ({
        klaviyoId: s.id,
        type: "segment" as const,
        name: s.name,
        profileCount: s.profileCount,
        isActive: s.isActive,
        isStarred: s.isStarred,
        isMainList: false,
        isEngagedSegment: engagedSegment?.id === s.id,
        createdAtKlaviyo: s.created,
      })),
    ]

    return {
      success: true,
      data: {
        totalLeads,
        engagedLeads,
        engagementRate: Math.round(engagementRate * 100) / 100,
        items,
      },
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    // Re-throw non-retryable errors — must not be silenced (same pattern as syncKlaviyoForPeriod)
    if (err instanceof KlaviyoPermissionError) throw err
    if (err instanceof KlaviyoRateLimitError) throw err

    const message = err instanceof Error ? err.message : "Unknown error fetching audience"
    log.warn("[KlaviyoSyncService] fetchAudienceForStore failed:", err)
    return {
      success: false,
      data: null,
      error: message,
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  }
}

// ── Metric Aggregates ────────────────────────────────────────────────────────

export async function fetchStoreRevenueFromMetricAggregates(
  apiKey: string,
  metricId: string,
  startDateStr: string,
  endDateStr: string,
  timezone: string,
): Promise<SyncResult<StoreRevenueData>> {
  try {
    const pad2 = (n: number) => String(n).padStart(2, "0")
    const nextDay = new Date(`${endDateStr}T12:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = `${nextDay.getFullYear()}-${pad2(nextDay.getMonth() + 1)}-${pad2(nextDay.getDate())}`

    const metricAgg = await klaviyoRequest<{
      data: {
        attributes: {
          dates: string[]
          data: Array<{
            measurements: Record<string, number[]>
          }>
        }
      }
    }>(apiKey, "/metric-aggregates/", {
      method: "POST",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: metricId,
            measurements: ["sum_value", "count"],
            interval: "day",
            page_size: 500,
            filter: [
              `greater-or-equal(datetime,${startDateStr}T00:00:00)`,
              `less-than(datetime,${nextDayStr}T00:00:00)`,
            ],
            timezone,
          },
        },
      },
    })

    if (!metricAgg) {
      return {
        success: false,
        data: null,
        error: "Klaviyo metric-aggregates returned null (possible rate limit or auth error)",
        source: "live",
        fetchedAt: new Date().toISOString(),
      }
    }

    // Klaviyo returns an extra bucket for the day BEFORE the requested start date — skip it
    const aggDates = metricAgg?.data?.attributes?.dates || []
    const aggData = metricAgg?.data?.attributes?.data || []
    const startThreshold = new Date(`${startDateStr}T00:00:00Z`).getTime()

    let storeRevenue = 0
    let storeOrders = 0

    for (const row of aggData) {
      const m = row.measurements || {}
      const sumValues = Array.isArray(m.sum_value) ? m.sum_value : [m.sum_value || 0]
      const countValues = Array.isArray(m.count) ? m.count : [m.count || 0]

      for (let i = 0; i < sumValues.length; i++) {
        if (aggDates[i]) {
          const bucketTime = new Date(aggDates[i]).getTime()
          if (bucketTime < startThreshold) continue
        }
        storeRevenue += Number(sumValues[i]) || 0
        storeOrders += Number(countValues[i]) || 0
      }
    }

    log.info(`[KlaviyoSyncService] metric-aggregates: storeRevenue=${storeRevenue.toFixed(2)}, storeOrders=${storeOrders}, timezone=${timezone}, buckets=${aggDates.length}`)

    return {
      success: true,
      data: { storeRevenue, storeOrders },
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    // Re-throw non-retryable errors — must not be silenced
    if (err instanceof KlaviyoRateLimitError) throw err
    const message = err instanceof Error ? err.message : "Unknown error fetching metric aggregates"
    log.warn("[KlaviyoSyncService] fetchStoreRevenueFromMetricAggregates failed:", err)
    return {
      success: false,
      data: null,
      error: message,
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  }
}

// ── Core Sync ────────────────────────────────────────────────────────────────

export async function syncKlaviyoForPeriod(
  params: KlaviyoSyncParams,
): Promise<SyncResult<KlaviyoSyncData>> {
  const { apiKey, period, timezone, timezoneOffset, metricId, flowNames, campNames, storeId, orgId, currency } = params

  try {
    const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, timezone)
    const timeframe = {
      start: `${startDateStr}T00:00:00${timezoneOffset}`,
      end: `${endDateStr}T23:59:59${timezoneOffset}`,
    }

    // Convert date strings to ISO timestamps for TIMESTAMPTZ columns
    const periodStartISO = new Date(`${startDateStr}T00:00:00Z`).toISOString()
    const periodEndISO = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()

    // Report API calls are serialized by the tiered rate limiter (AK-1: 4s interval for XS tier).
    // No manual delay needed — the rate limiter enforces correct spacing per Klaviyo's tier system.
    //
    // DATA SOURCE DECISION (AK-3):
    // - flow-values-reports + campaign-values-reports: Reporting API — matches Klaviyo UI exactly
    //   (revenue attributed by message SEND date, same attribution model as Klaviyo dashboard).
    // - metric-aggregates: Used ONLY for total store revenue and order count (not breakdown).
    //   DO NOT replace Reporting API with metric-aggregates — causes up to ~20% divergence
    //   for short periods due to event-date vs send-date attribution difference.

    // 1. Flow report
    const startFlow = Date.now()
    const flowResponse = await klaviyoRequest<{
      data: { attributes: { results: Array<{ groupings: { flow_id: string; send_channel: string; flow_message_id: string }; statistics: Record<string, number | undefined> }> } }
    }>(apiKey, "/flow-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "flow-values-report",
          attributes: {
            timeframe,
            conversion_metric_id: metricId,
            statistics: [
              "average_order_value", "bounce_rate", "bounced", "click_rate",
              "click_to_open_rate", "clicks", "clicks_unique", "conversion_rate",
              "conversion_uniques", "conversion_value", "conversions", "delivered",
              "delivery_rate", "opens", "opens_unique", "recipients",
              "revenue_per_recipient", "unsubscribe_rate", "unsubscribes",
            ],
          },
        },
      },
    })
    const flowOk = flowResponse != null
    if (flowOk) {
      log.info(`[CronSync] flow-values-report completed for store ${storeId} in ${Date.now() - startFlow}ms`)
    } else {
      log.warn(`[CronSync] flow-values-report FAILED for store ${storeId}: null response (API error or timeout)`)
    }

    // 2. Campaign report — split email/SMS requests (AK-7 fix).
    // Klaviyo rejects SMS stat names in a single mixed request, so we send
    // email stats first, then SMS stats only if the store has SMS campaigns.
    const startCamp = Date.now()
    type CampReportResp = {
      data: { attributes: { results: Array<{ groupings: { campaign_id: string; send_channel: string }; statistics: Record<string, number | undefined> }> } }
    }

    // 2a. Email campaign report (always)
    const emailCampaignResponse = await klaviyoRequest<CampReportResp>(apiKey, "/campaign-values-reports/", {
      method: "POST",
      body: {
        data: {
          type: "campaign-values-report",
          attributes: {
            timeframe,
            conversion_metric_id: metricId,
            statistics: [...EMAIL_STATISTICS],
          },
        },
      },
    })

    // 2b. SMS campaign report (only if store has SMS campaigns)
    const hasSms = Array.from(campNames.values()).some(c => c.channel === "sms")
    let smsCampaignResponse: CampReportResp | null = null
    if (hasSms) {
      // Throttle between email and SMS requests — XS-tier endpoint has strict burst limits
      await sleep(1000)
      smsCampaignResponse = await klaviyoRequest<CampReportResp>(apiKey, "/campaign-values-reports/", {
        method: "POST",
        body: {
          data: {
            type: "campaign-values-report",
            attributes: {
              timeframe,
              conversion_metric_id: metricId,
              statistics: [...SMS_STATISTICS],
            },
          },
        },
      })
    }

    // Merge email + SMS results into a single response shape
    const emailResults = emailCampaignResponse?.data?.attributes?.results || []
    const smsResults = smsCampaignResponse?.data?.attributes?.results || []
    const mergedResults = [...emailResults, ...smsResults]
    const campaignResponse = emailCampaignResponse != null
      ? { data: { attributes: { results: mergedResults } } }
      : null

    const campOk = campaignResponse != null
    if (campOk) {
      log.info(`[CronSync] campaign-values-report completed for store ${storeId} in ${Date.now() - startCamp}ms${hasSms ? " (email+sms)" : ""}`)
    } else {
      log.warn(`[CronSync] campaign-values-report FAILED for store ${storeId}: null response (API error or timeout)`)
    }

    // 3. Metric aggregates (store revenue)
    const startMetric = Date.now()
    const metricAggResult = await fetchStoreRevenueFromMetricAggregates(apiKey, metricId, startDateStr, endDateStr, timezone)
    const metricOk = metricAggResult.success
    if (metricOk) {
      log.info(`[CronSync] metric-aggregates completed for store ${storeId} in ${Date.now() - startMetric}ms`)
    } else {
      log.warn(`[CronSync] metric-aggregates FAILED for store ${storeId}: ${metricAggResult.error || "unknown error"}`)
    }

    // Summary: which reports succeeded/failed
    log.info(`[CronSync] store ${storeId}/${period} report summary: flow=${flowOk ? "OK" : "FAIL"}, campaign=${campOk ? "OK" : "FAIL"}, metric-agg=${metricOk ? "OK" : "FAIL"}`)

    // Track revenue
    let totalFlowRevenue = 0
    let totalCampaignRevenue = 0
    let campaignDataAvailable = false
    let flowDataAvailable = false
    const flowRows: FlowMetricRow[] = []
    const campRows: CampaignMetricRow[] = []

    // Aggregate flow metrics (guard against empty results array — [] is truthy in JS)
    if (flowResponse?.data?.attributes?.results?.length) {
      flowDataAvailable = true
      const flowAgg = new Map<string, Record<string, number>>()
      for (const r of flowResponse.data.attributes.results) {
        const fid = r.groupings.flow_id
        const s = r.statistics
        const ex = flowAgg.get(fid) || {}
        flowAgg.set(fid, {
          recipients: (ex.recipients || 0) + (s.recipients || 0),
          delivered: (ex.delivered || 0) + (s.delivered || 0),
          opened: (ex.opened || 0) + (s.opens_unique || 0),
          clicked: (ex.clicked || 0) + (s.clicks_unique || 0),
          conversions: (ex.conversions || 0) + (s.conversions || 0),
          conversion_value: (ex.conversion_value || 0) + (s.conversion_value || 0),
          bounced: (ex.bounced || 0) + (s.bounced || 0),
          unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribes || 0),
          // Rates recalculated after aggregation loop
          delivery_rate: 0,
          open_rate: 0,
          click_rate: 0,
          click_to_open_rate: 0,
          bounce_rate: 0,
          unsubscribe_rate: 0,
          conversion_rate: 0,
          revenue_per_recipient: 0,
          average_order_value: 0,
        })
      }

      // Recalculate rates from aggregated counts (using unique opens/clicks)
      for (const [, m] of flowAgg) {
        m.delivery_rate = m.recipients > 0 ? (m.delivered / m.recipients) * 100 : 0
        m.open_rate = m.delivered > 0 ? (m.opened / m.delivered) * 100 : 0
        m.click_rate = m.delivered > 0 ? (m.clicked / m.delivered) * 100 : 0
        m.click_to_open_rate = m.opened > 0 ? (m.clicked / m.opened) * 100 : 0
        m.bounce_rate = m.recipients > 0 ? (m.bounced / m.recipients) * 100 : 0
        m.unsubscribe_rate = m.delivered > 0 ? (m.unsubscribed / m.delivered) * 100 : 0
        m.conversion_rate = m.delivered > 0 ? (m.conversions / m.delivered) * 100 : 0
        m.revenue_per_recipient = m.recipients > 0 ? m.conversion_value / m.recipients : 0
        m.average_order_value = m.conversions > 0 ? m.conversion_value / m.conversions : 0
      }

      const fetchedAt = new Date().toISOString()
      for (const [flowId, m] of flowAgg) {
        flowRows.push({
          store_id: storeId,
          org_id: orgId,
          flow_id: flowId,
          flow_name: flowNames.get(flowId)?.name || "Unknown",
          flow_status: flowNames.get(flowId)?.status?.toLowerCase() || "unknown",
          trigger_type: flowNames.get(flowId)?.trigger_type || "unknown",
          period_start: periodStartISO,
          period_end: periodEndISO,
          recipients: m.recipients,
          delivered: m.delivered,
          delivery_rate: m.delivery_rate,
          opened: m.opened,
          open_rate: m.open_rate,
          clicked: m.clicked,
          click_rate: m.click_rate,
          click_to_open_rate: m.click_to_open_rate,
          conversions: m.conversions,
          conversion_rate: m.conversion_rate,
          conversion_value: m.conversion_value,
          revenue_per_recipient: m.revenue_per_recipient,
          average_order_value: m.average_order_value,
          bounced: m.bounced,
          bounce_rate: m.bounce_rate,
          unsubscribed: m.unsubscribed,
          unsubscribe_rate: m.unsubscribe_rate,
          fetched_at: fetchedAt,
        })
      }

      totalFlowRevenue = flowRows.reduce((sum, r) => sum + (r.conversion_value || 0), 0)
      log.info(`[KlaviyoSyncService] ${storeId}/${period}: ${flowRows.length} flow metrics`)
    }

    // Aggregate campaign metrics (guard against empty results array — [] is truthy in JS)
    // AK-7: SMS campaigns use *_sms stat names. We map them to canonical column names
    // based on send_channel from the groupings, so email and SMS data land in the same columns.
    if (campaignResponse?.data?.attributes?.results?.length) {
      campaignDataAvailable = true
      const campAgg = new Map<string, { channel: Channel; counts: Record<string, number> }>()
      for (const r of campaignResponse.data.attributes.results) {
        const cid = r.groupings.campaign_id
        const ch = (r.groupings.send_channel === "sms" ? "sms" : "email") as Channel
        const s = r.statistics
        const entry = campAgg.get(cid) || { channel: ch, counts: {} }
        const ex = entry.counts

        // Guard: Klaviyo campaigns are single-channel. If we see mixed channels
        // for the same campaign_id, log a warning and keep the first channel seen.
        if (ex.recipients !== undefined && entry.channel !== ch) {
          log.warn(`[CronSync] Campaign ${cid} has mixed channels (${entry.channel} + ${ch}) — keeping ${entry.channel}`)
          continue
        }

        if (ch === "sms") {
          // Map SMS stat names → canonical column names
          entry.counts = {
            recipients: (ex.recipients || 0) + (s.recipients_sms || 0),
            delivered: (ex.delivered || 0) + (s.delivered_sms || 0),
            clicked: (ex.clicked || 0) + (s.clicked_sms_unique || 0),
            conversions: (ex.conversions || 0) + (s.conversions_sms || 0),
            conversion_value: (ex.conversion_value || 0) + (s.conversion_value_sms || 0),
            unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribed_sms || 0),
            // SMS has no opens, bounces, or spam complaints
          }
        } else {
          // Email stats — same as before
          entry.counts = {
            recipients: (ex.recipients || 0) + (s.recipients || 0),
            delivered: (ex.delivered || 0) + (s.delivered || 0),
            opened: (ex.opened || 0) + (s.opens_unique || 0),
            clicked: (ex.clicked || 0) + (s.clicks_unique || 0),
            conversions: (ex.conversions || 0) + (s.conversions || 0),
            conversion_value: (ex.conversion_value || 0) + (s.conversion_value || 0),
            bounced: (ex.bounced || 0) + (s.bounced || 0),
            unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribes || 0),
            spam_complaints: (ex.spam_complaints || 0) + (s.spam_complaints || 0),
          }
        }

        campAgg.set(cid, entry)
      }

      // Recalculate rates from aggregated counts
      const fetchedAt = new Date().toISOString()
      for (const [campaignId, { channel: ch, counts: m }] of campAgg) {
        const info = campNames.get(campaignId)
        const normalizedStatus = info?.status?.toLowerCase() || "sent"
        // Filter: only include sent campaigns (or unknown)
        if (info && normalizedStatus !== "sent") continue

        const isSms = ch === "sms"

        const deliveryRate = m.recipients > 0 ? (m.delivered / m.recipients) * 100 : 0
        const clickRate = m.delivered > 0 ? (m.clicked / m.delivered) * 100 : 0
        const conversionRate = m.delivered > 0 ? (m.conversions / m.delivered) * 100 : 0
        const unsubscribeRate = m.delivered > 0 ? (m.unsubscribed / m.delivered) * 100 : 0
        const revenuePerRecipient = m.recipients > 0 ? m.conversion_value / m.recipients : 0
        const avgOrderValue = m.conversions > 0 ? m.conversion_value / m.conversions : 0

        // Email-only rates: open_rate, click_to_open_rate, bounce_rate — NULL for SMS
        const openRate = isSms ? null : (m.delivered > 0 ? ((m.opened || 0) / m.delivered) * 100 : 0)
        const clickToOpenRate = isSms ? null : ((m.opened || 0) > 0 ? (m.clicked / (m.opened || 1)) * 100 : 0)
        const bounceRate = isSms ? null : (m.recipients > 0 ? ((m.bounced || 0) / m.recipients) * 100 : 0)

        campRows.push({
          store_id: storeId,
          org_id: orgId,
          campaign_id: campaignId,
          campaign_name: info?.name || "Unknown",
          campaign_status: normalizedStatus,
          send_time: info?.send_time || null,
          subject: info?.subject || null,
          channel: info?.channel || ch,
          period_start: periodStartISO,
          period_end: periodEndISO,
          recipients: m.recipients || 0,
          delivered: m.delivered || 0,
          delivery_rate: deliveryRate,
          opened: isSms ? null : (m.opened || 0),
          open_rate: openRate,
          clicked: m.clicked || 0,
          click_rate: clickRate,
          click_to_open_rate: clickToOpenRate,
          conversions: m.conversions || 0,
          conversion_rate: conversionRate,
          conversion_value: m.conversion_value || 0,
          revenue_per_recipient: revenuePerRecipient,
          average_order_value: avgOrderValue,
          bounced: isSms ? null : (m.bounced || 0),
          bounce_rate: bounceRate,
          unsubscribed: m.unsubscribed || 0,
          unsubscribe_rate: unsubscribeRate,
          spam_complaints: isSms ? null : (m.spam_complaints || 0),
          fetched_at: fetchedAt,
        })
      }

      totalCampaignRevenue = campRows.reduce((sum, r) => sum + (r.conversion_value || 0), 0)
      log.info(`[KlaviyoSyncService] ${storeId}/${period}: ${campRows.length} campaign metrics`)
    }

    // Use metric aggregates result (fallback to 0 on failure)
    const storeRevenue = metricAggResult.success && metricAggResult.data ? metricAggResult.data.storeRevenue : 0
    const storeOrders = metricAggResult.success && metricAggResult.data ? metricAggResult.data.storeOrders : 0

    return {
      success: true,
      data: {
        campaignRevenue: totalCampaignRevenue,
        flowRevenue: totalFlowRevenue,
        campaignDataAvailable,
        flowDataAvailable,
        storeRevenue,
        storeOrders,
        startDateStr: periodStartISO,
        endDateStr: periodEndISO,
        flowRows,
        campRows,
        currency,
      },
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    // Re-throw non-retryable errors — must not be silenced
    if (err instanceof KlaviyoPermissionError) throw err
    if (err instanceof KlaviyoRateLimitError) throw err
    const message = err instanceof Error ? err.message : "Unknown error in syncKlaviyoForPeriod"
    log.warn("[KlaviyoSyncService] syncKlaviyoForPeriod failed:", err)
    return {
      success: false,
      data: null,
      error: message,
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  }
}
