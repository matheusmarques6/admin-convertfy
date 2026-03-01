import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { cleanExpiredCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import {
  klaviyoRequest,
  parseDateRangeInTimezone,
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  MIN_REQUEST_INTERVAL,
  sleep,
  KLAVIYO_API_URL,
} from "@/lib/integrations/klaviyo"

const log = logger.child("CronSyncReports")

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Periods in priority order (30d most used, processed first)
const PERIODS = ["30d", "7d", "15d", "90d"] as const
const BATCH_SIZE = 10
const MAX_DURATION_MS = 240_000 // 80% of 300s — stop before Vercel kills us
const STALE_LOCK_MS = 10 * 60 * 1000 // 10 minutes

interface SyncResult {
  storeId: string
  storeName: string
  period: string
  status: "ok" | "skipped" | "error"
  error?: string
  campaignRevenue?: number
  flowRevenue?: number
}

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
}

// ==============================
// Lock helpers
// ==============================

async function acquireSyncLock(supabase: SupabaseClient): Promise<boolean> {
  const { data: lock } = await supabase
    .from("cron_locks")
    .select("is_running, started_at")
    .eq("lock_name", "sync_reports")
    .single()

  if (lock?.is_running && lock.started_at) {
    const startedAt = new Date(lock.started_at).getTime()
    if (Date.now() - startedAt < STALE_LOCK_MS) {
      log.warn("[Cron] Another sync is running, skipping")
      return false
    }
    log.warn("[Cron] Stale lock detected, proceeding")
  }

  await supabase
    .from("cron_locks")
    .upsert({
      lock_name: "sync_reports",
      is_running: true,
      started_at: new Date().toISOString(),
    }, { onConflict: "lock_name" })

  return true
}

async function releaseSyncLock(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from("cron_locks")
    .update({
      is_running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("lock_name", "sync_reports")
}

// ==============================
// Fetch store revenue from Klaviyo metric-aggregates (Placed Order)
// ==============================

async function fetchStoreRevenueFromMetricAggregates(
  apiKey: string,
  metricId: string,
  startDateStr: string,
  endDateStr: string,
  timezone: string,
): Promise<{ storeRevenue: number; storeOrders: number }> {
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

  log.info(`[Cron] metric-aggregates: storeRevenue=${storeRevenue.toFixed(2)}, storeOrders=${storeOrders}, timezone=${timezone}, buckets=${aggDates.length}`)
  return { storeRevenue, storeOrders }
}

// ==============================
// Core sync logic for one store + one period
// ==============================

async function syncStoreForPeriod(
  store: StoreRow,
  period: string,
  supabase: SupabaseClient,
  // Pre-fetched data shared across periods:
  apiKey: string,
  timezone: string,
  timezoneOffset: string,
  metricId: string,
  flowNames: Map<string, { name: string; status: string; trigger_type: string }>,
  campNames: Map<string, { name: string; status: string; send_time: string | null; channel: string; subject: string | null }>,
): Promise<{ status: "ok" | "skipped"; campaignRevenue: number; flowRevenue: number; storeRevenue: number; storeOrders: number; startDateStr: string; endDateStr: string }> {
  const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, timezone)
  const timeframe = {
    start: `${startDateStr}T00:00:00${timezoneOffset}`,
    end: `${endDateStr}T23:59:59${timezoneOffset}`,
  }

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
              "revenue_per_recipient", "spam_complaint_rate", "unsubscribe_rate", "unsubscribes",
            ],
          },
        },
      },
    }),
    fetchStoreRevenueFromMetricAggregates(apiKey, metricId, startDateStr, endDateStr, timezone),
  ])

  // Track revenue for store_revenue_summary
  let totalFlowRevenue = 0
  let totalCampaignRevenue = 0

  // Aggregate and upsert flow metrics
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

    const flowRows = Array.from(flowAgg.entries()).map(([flowId, m]) => ({
      store_id: store.id,
      flow_id: flowId,
      flow_name: flowNames.get(flowId)?.name || "Unknown",
      flow_status: flowNames.get(flowId)?.status || "unknown",
      trigger_type: flowNames.get(flowId)?.trigger_type || "unknown",
      period_start: startDateStr,
      period_end: endDateStr,
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
      fetched_at: new Date().toISOString(),
    }))

    if (flowRows.length > 0) {
      await supabase
        .from("klaviyo_flow_metrics")
        .upsert(flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
    }

    totalFlowRevenue = flowRows.reduce((sum, r) => sum + (r.conversion_value || 0), 0)
    log.info(`[Cron] ${store.store_name}/${period}: ${flowRows.length} flow metrics`)
  }

  // Aggregate and upsert campaign metrics
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
        spam_complaint_rate: s.spam_complaint_rate ?? ex.spam_complaint_rate ?? 0,
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
      // spam_complaint_rate kept as-is (weighted value from Klaviyo, no count available)
    }

    const campRows = Array.from(campAgg.entries())
      .filter(([cid]) => {
        const info = campNames.get(cid)
        return !info || info.status === "sent"
      })
      .map(([campaignId, m]) => {
        const info = campNames.get(campaignId)
        return {
          store_id: store.id,
          campaign_id: campaignId,
          campaign_name: info?.name || "Unknown",
          campaign_status: info?.status || "sent",
          send_time: info?.send_time || null,
          subject: info?.subject || null,
          channel: info?.channel || "email",
          period_start: startDateStr,
          period_end: endDateStr,
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
          spam_complaints: m.spam_complaint_rate,
          fetched_at: new Date().toISOString(),
        }
      })

    if (campRows.length > 0) {
      await supabase
        .from("klaviyo_campaign_metrics")
        .upsert(campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
    }

    totalCampaignRevenue = campRows.reduce((sum, r) => sum + (r.conversion_value || 0), 0)
    log.info(`[Cron] ${store.store_name}/${period}: ${campRows.length} campaign metrics`)
  }

  return {
    status: "ok",
    campaignRevenue: totalCampaignRevenue,
    flowRevenue: totalFlowRevenue,
    storeRevenue: metricAggResult.storeRevenue,
    storeOrders: metricAggResult.storeOrders,
    startDateStr,
    endDateStr,
  }
}

// ==============================
// Fetch flow/campaign names (once per store, reused across periods)
// ==============================

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

async function fetchFlowNames(apiKey: string): Promise<Map<string, { name: string; status: string; trigger_type: string }>> {
  const flowNames = new Map<string, { name: string; status: string; trigger_type: string }>()
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

async function fetchCampaignNames(apiKey: string): Promise<Map<string, { name: string; status: string; send_time: string | null; channel: string; subject: string | null }>> {
  const campNames = new Map<string, { name: string; status: string; send_time: string | null; channel: string; subject: string | null }>()
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

// ==============================
// Fetch audience metrics (lists + segments) — ONCE per store
// ==============================

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

async function fetchAudienceForStore(apiKey: string): Promise<{
  totalLeads: number
  engagedLeads: number
  engagementRate: number
}> {
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

  return { totalLeads, engagedLeads, engagementRate: Math.round(engagementRate * 100) / 100 }
}

// ==============================
// Full sync for one store across all periods
// ==============================

async function syncStore(
  store: StoreRow,
  periods: readonly string[],
  supabase: SupabaseClient,
  startTime: number,
): Promise<SyncResult[]> {
  const results: SyncResult[] = []

  if (!store.org_id) {
    log.warn(`[Cron] Store ${store.store_name} (${store.id}) has no org_id — revenue summary will be skipped`)
  }

  const credentials = await getStoreCredentials(store.id)
  const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
  if (!apiKey) {
    return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No valid API key" }))
  }

  // Pre-fetch shared data (cached, minimal API calls)
  const accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined)
  const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
  const metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined)

  if (!metricId) {
    return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No Placed Order metric" }))
  }

  // Fetch names ONCE per store (reused across all periods)
  const [flowNames, campNames] = await Promise.all([
    fetchFlowNames(apiKey),
    fetchCampaignNames(apiKey),
  ])

  // Fetch audience metrics ONCE per store (not per period — audience is a snapshot)
  let audience = { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }
  try {
    audience = await fetchAudienceForStore(apiKey)
    log.info(`[Cron] ${store.store_name}: audience totalLeads=${audience.totalLeads} engagedLeads=${audience.engagedLeads} rate=${audience.engagementRate}%`)
  } catch (err) {
    log.warn(`[Cron] Failed to fetch audience for ${store.store_name}:`, err)
    // Continue with 0s — audience is optional
  }

  // Sync each period
  for (const period of periods) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "skipped", error: "timeout" })
      continue
    }

    try {
      const result = await syncStoreForPeriod(store, period, supabase, apiKey, accountInfo.timezone, timezoneOffset, metricId, flowNames, campNames)
      results.push({ storeId: store.id, storeName: store.store_name, period, status: result.status, campaignRevenue: result.campaignRevenue, flowRevenue: result.flowRevenue })

      // Upsert store_revenue_summary (only if store has org_id)
      if (store.org_id) {
        const totalKlaviyoRevenue = result.campaignRevenue + result.flowRevenue
        await supabase
          .from("store_revenue_summary")
          .upsert({
            store_id: store.id,
            org_id: store.org_id,
            period_label: period,
            period_start: result.startDateStr,
            period_end: result.endDateStr,
            klaviyo_total_revenue: totalKlaviyoRevenue,
            klaviyo_campaign_revenue: result.campaignRevenue,
            klaviyo_flow_revenue: result.flowRevenue,
            shopify_total_revenue: result.storeRevenue,
            total_leads: audience.totalLeads,
            engaged_leads: audience.engagedLeads,
            engagement_rate: audience.engagementRate,
            sync_status: result.status,
            sync_error: null,
            expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            fetched_at: new Date().toISOString(),
          }, { onConflict: "store_id,period_label" })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      log.warn(`[Cron] Error syncing ${store.store_name}/${period}:`, err)
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: msg })

      // Upsert error status in store_revenue_summary
      if (store.org_id) {
        const { startDateStr: errStartDate, endDateStr: errEndDate } = parseDateRangeInTimezone(period, accountInfo.timezone)
        try {
          await supabase
            .from("store_revenue_summary")
            .upsert({
              store_id: store.id,
              org_id: store.org_id,
              period_label: period,
              period_start: errStartDate,
              period_end: errEndDate,
              klaviyo_total_revenue: 0,
              klaviyo_campaign_revenue: 0,
              klaviyo_flow_revenue: 0,
              shopify_total_revenue: 0,
              sync_status: "error",
              sync_error: msg,
              expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              fetched_at: new Date().toISOString(),
            }, { onConflict: "store_id,period_label" })
        } catch { /* Don't fail the whole store on summary upsert error */ }
      }
    }
  }

  // Update per-store sync status
  await supabase
    .from("klaviyo_sync_config")
    .upsert({
      store_id: store.id,
      last_sync_at: new Date().toISOString(),
      last_sync_status: results.some(r => r.status === "error") ? "partial" : "success",
    }, { onConflict: "store_id" })

  return results
}

// ==============================
// Main handler
// ==============================

export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    const startTime = Date.now()

    log.info("[Cron] Starting sync-reports...")

    // Idempotency lock
    const canRun = await acquireSyncLock(supabase)
    if (!canRun) {
      return NextResponse.json({ status: "skipped", reason: "another instance running" }, { status: 409 })
    }

    try {
      // Clean expired cache + revenue summary entries
      const cleanedCount = await cleanExpiredCache(supabase)
      if (cleanedCount > 0) log.info(`[Cron] Cleaned ${cleanedCount} expired cache entries`)

      const { data: revCleanResult } = await supabase.rpc("clean_expired_revenue_summaries")
      if (revCleanResult && revCleanResult > 0) {
        log.info(`[Cron] Cleaned ${revCleanResult} expired revenue summaries`)
      }

      // Get all stores with Klaviyo credentials
      const { data: stores, error: storesError } = await supabase
        .from("client_stores")
        .select("id, store_name, org_id")
        .not("klaviyo_private_key", "is", null)

      if (storesError || !stores) {
        log.error("[Cron] Failed to fetch stores:", storesError)
        return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
      }

      log.info(`[Cron] Found ${stores.length} stores × ${PERIODS.length} periods`)

      const allResults: SyncResult[] = []
      let timedOut = false

      // Process stores in batches
      for (let i = 0; i < stores.length; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_DURATION_MS) {
          timedOut = true
          log.warn(`[Cron] Timeout approaching at store batch ${i}/${stores.length}`)
          break
        }

        const batch = stores.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map(store => syncStore(store as StoreRow, PERIODS, supabase, startTime))
        )

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j]
          if (result.status === "fulfilled") {
            allResults.push(...result.value)
          } else {
            const msg = result.reason instanceof Error ? result.reason.message : "Unknown error"
            for (const period of PERIODS) {
              allResults.push({
                storeId: batch[j].id,
                storeName: batch[j].store_name,
                period,
                status: "error",
                error: msg,
              })
            }
          }
        }
      }

      const elapsed = Date.now() - startTime
      const okCount = allResults.filter(r => r.status === "ok").length
      const errorCount = allResults.filter(r => r.status === "error").length
      const skippedCount = allResults.filter(r => r.status === "skipped").length

      log.info(`[Cron] Sync completed in ${elapsed}ms. ok=${okCount} error=${errorCount} skipped=${skippedCount}${timedOut ? " (timed out)" : ""}`)

      return NextResponse.json({
        status: timedOut ? "partial" : errorCount > 0 ? "partial" : "ok",
        elapsed: `${elapsed}ms`,
        cleanedCacheEntries: cleanedCount,
        summary: { ok: okCount, error: errorCount, skipped: skippedCount },
        stores: allResults,
      })
    } finally {
      await releaseSyncLock(supabase)
    }
  } catch (error) {
    log.error("[Cron] Fatal error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
