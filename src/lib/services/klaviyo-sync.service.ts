/**
 * Klaviyo Sync Service
 *
 * Pure business logic for fetching and aggregating Klaviyo data.
 * NO database access — callers (cron, live endpoints) handle persistence.
 *
 * Extracted from src/app/api/cron/sync-reports/route.ts (Story 10.2)
 */

import {
  klaviyoRequest,
  parseDateRangeInTimezone,
  KLAVIYO_API_URL,
  sleep,
  MIN_REQUEST_INTERVAL,
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
  spam_complaints: number
  fetched_at: string
}

export interface AudienceData {
  totalLeads: number
  engagedLeads: number
  engagementRate: number
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
  data: Array<{ id: string; attributes: { profile_count?: number } }>
  links?: { next?: string }
}

type AudienceSegResp = {
  data: Array<{ id: string; attributes: { name: string; profile_count?: number } }>
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
    // 1. Fetch all lists, find largest by profile count
    const allLists: Array<{ id: string; profileCount: number }> = []
    let listPage: string | null = "/lists/"
    while (listPage) {
      const resp: AudienceListResp | null = await klaviyoRequest<AudienceListResp>(apiKey, listPage)
      if (!resp?.data) break
      for (const l of resp.data) {
        allLists.push({ id: l.id, profileCount: l.attributes.profile_count || 0 })
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
      { id: "", profileCount: 0 },
    )
    const totalLeads = largestList.profileCount

    // 2. Fetch segments, find "Engaged" segment
    const allSegments: Array<{ id: string; name: string; profileCount: number }> = []
    let segPage: string | null = "/segments/"
    while (segPage) {
      const resp: AudienceSegResp | null = await klaviyoRequest<AudienceSegResp>(apiKey, segPage)
      if (!resp?.data) break
      for (const s of resp.data) {
        allSegments.push({ id: s.id, name: s.attributes.name, profileCount: s.attributes.profile_count || 0 })
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
    const engagementRate = totalLeads > 0 ? (engagedLeads / totalLeads) * 100 : 0

    return {
      success: true,
      data: { totalLeads, engagedLeads, engagementRate: Math.round(engagementRate * 100) / 100 },
      source: "live",
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
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

    // Fetch flow + campaign reports + store revenue in parallel
    await sleep(MIN_REQUEST_INTERVAL)
    const [flowResponse, campaignResponse, metricAggResult] = await Promise.all([
      klaviyoRequest<{
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
      }),
      klaviyoRequest<{
        data: { attributes: { results: Array<{ groupings: { campaign_id: string; send_channel: string }; statistics: Record<string, number | undefined> }> } }
      }>(apiKey, "/campaign-values-reports/", {
        method: "POST",
        body: {
          data: {
            type: "campaign-values-report",
            attributes: {
              timeframe,
              conversion_metric_id: metricId,
              statistics: [
                "average_order_value", "bounce_rate", "bounced", "click_rate",
                "click_to_open_rate", "clicks", "clicks_unique", "conversion_rate",
                "conversion_uniques", "conversion_value", "conversions", "delivered",
                "delivery_rate", "opens", "opens_unique", "recipients",
                "revenue_per_recipient", "spam_complaints", "unsubscribe_rate", "unsubscribes",
              ],
            },
          },
        },
      }),
      fetchStoreRevenueFromMetricAggregates(apiKey, metricId, startDateStr, endDateStr, timezone),
    ])

    // Track revenue
    let totalFlowRevenue = 0
    let totalCampaignRevenue = 0
    const flowRows: FlowMetricRow[] = []
    const campRows: CampaignMetricRow[] = []

    // Aggregate flow metrics
    if (flowResponse?.data?.attributes?.results) {
      const flowAgg = new Map<string, Record<string, number>>()
      for (const r of flowResponse.data.attributes.results) {
        const fid = r.groupings.flow_id
        const s = r.statistics
        const ex = flowAgg.get(fid) || {}
        flowAgg.set(fid, {
          recipients: (ex.recipients || 0) + (s.recipients || 0),
          delivered: (ex.delivered || 0) + (s.delivered || 0),
          opened: (ex.opened || 0) + (s.opens || 0),
          clicked: (ex.clicked || 0) + (s.clicks || 0),
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

      // Recalculate rates from aggregated counts
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
          flow_status: flowNames.get(flowId)?.status || "unknown",
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

    // Aggregate campaign metrics
    if (campaignResponse?.data?.attributes?.results) {
      const campAgg = new Map<string, Record<string, number>>()
      for (const r of campaignResponse.data.attributes.results) {
        const cid = r.groupings.campaign_id
        const s = r.statistics
        const ex = campAgg.get(cid) || {}
        campAgg.set(cid, {
          recipients: (ex.recipients || 0) + (s.recipients || 0),
          delivered: (ex.delivered || 0) + (s.delivered || 0),
          opened: (ex.opened || 0) + (s.opens || 0),
          clicked: (ex.clicked || 0) + (s.clicks || 0),
          conversions: (ex.conversions || 0) + (s.conversions || 0),
          conversion_value: (ex.conversion_value || 0) + (s.conversion_value || 0),
          bounced: (ex.bounced || 0) + (s.bounced || 0),
          unsubscribed: (ex.unsubscribed || 0) + (s.unsubscribes || 0),
          spam_complaints: (ex.spam_complaints || 0) + (s.spam_complaints || 0),
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

      // Recalculate rates from aggregated counts
      for (const [, m] of campAgg) {
        m.delivery_rate = m.recipients > 0 ? (m.delivered / m.recipients) * 100 : 0
        m.open_rate = m.delivered > 0 ? (m.opened / m.delivered) * 100 : 0
        m.click_rate = m.delivered > 0 ? (m.clicked / m.delivered) * 100 : 0
        m.click_to_open_rate = m.opened > 0 ? (m.clicked / m.opened) * 100 : 0
        m.bounce_rate = m.recipients > 0 ? (m.bounced / m.recipients) * 100 : 0
        m.unsubscribe_rate = m.delivered > 0 ? (m.unsubscribed / m.delivered) * 100 : 0
        m.conversion_rate = m.delivered > 0 ? (m.conversions / m.delivered) * 100 : 0
        m.revenue_per_recipient = m.recipients > 0 ? m.conversion_value / m.recipients : 0
        m.average_order_value = m.conversions > 0 ? m.conversion_value / m.conversions : 0
        // spam_complaints is a count, kept as aggregated sum
      }

      const fetchedAt = new Date().toISOString()
      for (const [campaignId, m] of campAgg) {
        const info = campNames.get(campaignId)
        // Filter: only include sent campaigns (or unknown)
        if (info && info.status !== "sent") continue

        campRows.push({
          store_id: storeId,
          org_id: orgId,
          campaign_id: campaignId,
          campaign_name: info?.name || "Unknown",
          campaign_status: info?.status || "sent",
          send_time: info?.send_time || null,
          subject: info?.subject || null,
          channel: info?.channel || "email",
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
          spam_complaints: m.spam_complaints,
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
