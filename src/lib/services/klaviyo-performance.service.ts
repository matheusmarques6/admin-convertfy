/**
 * Shared Klaviyo Performance Service
 *
 * Used by BOTH:
 * - /api/clients/[id]/performance (admin client overview)
 * - /api/portal/dashboard (portal dashboard)
 *
 * Single source of truth for Klaviyo revenue, campaign, and flow data.
 */
import {
  klaviyoRequest,
  getAccountInfo,
  findPlacedOrderMetric,
  getTimezoneOffset,
  parseDateRangeInTimezone,
  sleep,
  MIN_REQUEST_INTERVAL,
  KLAVIYO_API_URL,
} from "@/lib/integrations/klaviyo"
import { logger } from "@/lib/logger"

const log = logger.child("KlaviyoPerf")

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KlaviyoCampaignItem {
  campaignId: string
  name: string
  sendTime: string
  recipients: number
  delivered: number
  openRate: number
  clickRate: number
  revenue: number
}

export interface KlaviyoFlowItem {
  flowId: string
  name: string
  status: string
  delivered: number
  revenue: number
  openRate: number
  clickRate: number
}

export interface KlaviyoPerformanceData {
  // Revenue (from metric-aggregates: ALL Placed Orders)
  storeRevenue: number
  storeOrders: number
  // Revenue (from reporting API: only Klaviyo-attributed)
  attributedRevenue: number
  campaignRevenue: number
  flowRevenue: number
  recoveryRate: number
  // Counts
  sentCampaigns: number
  totalFlows: number
  liveFlows: number
  // Email metrics (aggregated from campaign + flow reports)
  totalDelivered: number
  totalOpens: number
  totalClicks: number
  avgOpenRate: number
  avgClickRate: number
  bounceRate: number
  unsubscribeRate: number
  // Lists
  recentCampaigns: KlaviyoCampaignItem[]
  topFlows: KlaviyoFlowItem[]
}

// ─── Klaviyo API Response Types ──────────────────────────────────────────────

interface KlaviyoReportResult {
  groupings?: Record<string, string>
  statistics?: Record<string, number | string>
}

interface KlaviyoReport {
  data?: {
    attributes?: {
      results?: KlaviyoReportResult[]
    }
  }
}

interface KlaviyoMetricAggregate {
  data?: {
    attributes?: Record<string, unknown> & {
      data?: Array<{
        measurements?: Record<string, number | number[]>
      }>
    }
  }
}

type NameListResp = {
  data: Array<{ id: string; attributes: { name: string; status?: string; send_time?: string | null; archived?: boolean } }>
  links?: { next?: string }
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Fetch Klaviyo performance data.
 *
 * Accepts EITHER:
 * - period string (e.g. "30d") — dates are calculated in the account's timezone
 * - explicit startDate/endDate strings (YYYY-MM-DD) — used as-is
 */
export async function fetchKlaviyoPerformance(
  apiKey: string,
  startDateOrPeriod: string,
  endDate?: string,
  customStartDate?: string | null,
  customEndDate?: string | null,
): Promise<KlaviyoPerformanceData> {
  const accountInfo = await getAccountInfo(apiKey)
  const timezone = accountInfo?.timezone || "America/Sao_Paulo"
  const tzOffset = getTimezoneOffset(timezone)

  let startDate: string
  let finalEndDate: string

  // If endDate is provided, treat as explicit date strings (legacy callers)
  // If not, treat first arg as period and compute dates in account timezone
  if (endDate) {
    startDate = startDateOrPeriod
    finalEndDate = endDate
  } else {
    const range = parseDateRangeInTimezone(startDateOrPeriod, timezone, customStartDate, customEndDate)
    startDate = range.startDateStr
    finalEndDate = range.endDateStr
  }

  const startISO = `${startDate}T00:00:00${tzOffset}`
  const endISO = `${finalEndDate}T23:59:59${tzOffset}`

  log.info(`[KlaviyoPerf] Date range: ${startDate} to ${finalEndDate} (timezone: ${timezone}, offset: ${tzOffset})`)
  log.info(`[KlaviyoPerf] Metric-agg filter: ${startDate}T00:00:00 to ${finalEndDate}T23:59:59 (tz param: ${timezone})`)
  log.info(`[KlaviyoPerf] Report timeframe: ${startISO} to ${endISO}`)

  const placedOrderMetric = await findPlacedOrderMetric(apiKey)
  if (!placedOrderMetric) {
    log.warn("No Placed Order metric found - cannot fetch revenue data")
    return emptyPerformanceData()
  }

  const reportStats = [
    "recipients", "delivered", "opens_unique", "click_rate",
    "click_to_open_rate", "conversion_rate", "conversion_value",
    "revenue_per_recipient", "bounce_rate", "unsubscribe_rate",
  ]

  // ── 1. Campaign Values Report ──
  await sleep(MIN_REQUEST_INTERVAL)
  const campaignReport = await klaviyoRequest<KlaviyoReport>(apiKey, "/campaign-values-reports/", {
    method: "POST",
    logTag: "PerfCampaignReport",
    body: {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          conversion_metric_id: placedOrderMetric,
        },
      },
    },
  })

  // ── 2. Flow Values Report ──
  await sleep(MIN_REQUEST_INTERVAL)
  const flowReport = await klaviyoRequest<KlaviyoReport>(apiKey, "/flow-values-reports/", {
    method: "POST",
    logTag: "PerfFlowReport",
    body: {
      data: {
        type: "flow-values-report",
        attributes: {
          statistics: reportStats,
          timeframe: { start: startISO, end: endISO },
          conversion_metric_id: placedOrderMetric,
        },
      },
    },
  })

  // ── 3. Store revenue via metric-aggregates (Placed Order) ──
  // Uses the same parameters as the Klaviyo dashboard:
  // - interval: "day" for daily bucketing
  // - timezone: account timezone (e.g. America/Sao_Paulo)
  // - exclusive end date: next day T00:00:00
  // - page_size: 500 (max supported)
  // Single API call — no pagination needed, no rate limit risk.
  let storeRevenue = 0
  let storeOrders = 0

  {
    const pad2 = (n: number) => String(n).padStart(2, "0")
    const nextDay = new Date(`${finalEndDate}T12:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = `${nextDay.getFullYear()}-${pad2(nextDay.getMonth() + 1)}-${pad2(nextDay.getDate())}`

    await sleep(MIN_REQUEST_INTERVAL)
    const metricAgg = await klaviyoRequest<KlaviyoMetricAggregate>(apiKey, "/metric-aggregates/", {
      method: "POST",
      logTag: "PerfMetricAgg",
      body: {
        data: {
          type: "metric-aggregate",
          attributes: {
            metric_id: placedOrderMetric,
            measurements: ["sum_value", "count"],
            interval: "day",
            page_size: 500,
            filter: [
              `greater-or-equal(datetime,${startDate}T00:00:00)`,
              `less-than(datetime,${nextDayStr}T00:00:00)`,
            ],
            timezone,
          },
        },
      },
    })

    const aggData = metricAgg?.data?.attributes?.data || []
    for (const row of aggData) {
      const m = row.measurements || {}
      if (Array.isArray(m.sum_value)) {
        for (const v of m.sum_value) storeRevenue += Number(v) || 0
      } else {
        storeRevenue += Number(m.sum_value) || 0
      }
      if (Array.isArray(m.count)) {
        for (const c of m.count) storeOrders += Number(c) || 0
      } else {
        storeOrders += Number(m.count) || 0
      }
    }

    log.info(`[KlaviyoPerf] metric-aggregates: storeRevenue=${storeRevenue.toFixed(2)}, storeOrders=${storeOrders}, timezone=${timezone}`)
  }

  if (!campaignReport && !flowReport) {
    throw new Error("Falha ao conectar com a API do Klaviyo. Verifique as credenciais.")
  }

  // ── Aggregate campaign results by campaign_id ──
  interface AggEntry {
    recipients: number; delivered: number; opensUnique: number
    clickRate: number; conversionValue: number
    bounceRate: number; unsubscribeRate: number
  }

  const campaignResults = campaignReport?.data?.attributes?.results || []
  const flowResults = flowReport?.data?.attributes?.results || []

  const campAgg = new Map<string, AggEntry>()
  for (const r of campaignResults) {
    const cid = r.groupings?.campaign_id
    if (!cid) continue
    const s = r.statistics || {}
    const ex = campAgg.get(cid) || { recipients: 0, delivered: 0, opensUnique: 0, clickRate: 0, conversionValue: 0, bounceRate: 0, unsubscribeRate: 0 }
    campAgg.set(cid, {
      recipients: ex.recipients + (Number(s.recipients) || 0),
      delivered: ex.delivered + (Number(s.delivered) || 0),
      opensUnique: ex.opensUnique + (Number(s.opens_unique) || 0),
      clickRate: Number(s.click_rate) || ex.clickRate,
      conversionValue: ex.conversionValue + (Number(s.conversion_value) || 0),
      bounceRate: Number(s.bounce_rate) || ex.bounceRate,
      unsubscribeRate: Number(s.unsubscribe_rate) || ex.unsubscribeRate,
    })
  }

  // ── Aggregate flow results by flow_id ──
  const flowAgg = new Map<string, AggEntry>()
  for (const r of flowResults) {
    const fid = r.groupings?.flow_id
    if (!fid) continue
    const s = r.statistics || {}
    const ex = flowAgg.get(fid) || { recipients: 0, delivered: 0, opensUnique: 0, clickRate: 0, conversionValue: 0, bounceRate: 0, unsubscribeRate: 0 }
    flowAgg.set(fid, {
      recipients: ex.recipients + (Number(s.recipients) || 0),
      delivered: ex.delivered + (Number(s.delivered) || 0),
      opensUnique: ex.opensUnique + (Number(s.opens_unique) || 0),
      clickRate: Number(s.click_rate) || ex.clickRate,
      conversionValue: ex.conversionValue + (Number(s.conversion_value) || 0),
      bounceRate: Number(s.bounce_rate) || ex.bounceRate,
      unsubscribeRate: Number(s.unsubscribe_rate) || ex.unsubscribeRate,
    })
  }

  // ── Fetch campaign & flow names ──
  // Step 1: Paginate both lists (1-2 pages each with size=100)
  const campNames = new Map<string, { name: string; sendTime: string }>()
  const flowNames = new Map<string, { name: string; status: string }>()

  if (campAgg.size > 0) {
    await sleep(MIN_REQUEST_INTERVAL)
    let page: string | null = "/campaigns/?page[size]=100"
    while (page) {
      const resp: NameListResp | null = await klaviyoRequest<NameListResp>(apiKey, page)
      if (!resp?.data) break
      for (const c of resp.data) {
        campNames.set(c.id, { name: c.attributes.name, sendTime: c.attributes.send_time || "" })
      }
      page = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (page) await sleep(500)
    }
    log.info(`[Klaviyo] Campaign names from list: ${campNames.size}/${campAgg.size}`)
  }

  const archivedFlowIds = new Set<string>()
  if (flowAgg.size > 0) {
    await sleep(MIN_REQUEST_INTERVAL)
    let page: string | null = "/flows/?page[size]=100"
    while (page) {
      const resp: NameListResp | null = await klaviyoRequest<NameListResp>(apiKey, page)
      if (!resp?.data) break
      for (const f of resp.data) {
        flowNames.set(f.id, { name: f.attributes.name, status: f.attributes.status || "unknown" })
        if (f.attributes.archived) archivedFlowIds.add(f.id)
      }
      page = resp.links?.next ? resp.links.next.replace(KLAVIYO_API_URL, "") : null
      if (page) await sleep(500)
    }
    log.info(`[Klaviyo] Flow names from list: ${flowNames.size}/${flowAgg.size}, archived excluded: ${archivedFlowIds.size}`)
  }

  // Step 2: Individual fallback for any missing names (campaigns + flows)
  type SingleCampResp = { data: { id: string; attributes: { name: string; send_time?: string | null } } }
  type SingleFlowResp = { data: { id: string; attributes: { name: string; status?: string } } }

  const missingCamps = Array.from(campAgg.keys()).filter(id => !campNames.has(id))
  const missingFlows = Array.from(flowAgg.keys()).filter(id => !flowNames.has(id))

  if (missingCamps.length > 0 || missingFlows.length > 0) {
    log.info(`[Klaviyo] Missing names - campaigns: ${missingCamps.length}, flows: ${missingFlows.length}. Fetching individually.`)
  }

  for (const id of missingCamps.slice(0, 15)) {
    await sleep(MIN_REQUEST_INTERVAL)
    const resp = await klaviyoRequest<SingleCampResp>(apiKey, `/campaigns/${id}/`)
    if (resp?.data) {
      campNames.set(resp.data.id, { name: resp.data.attributes.name, sendTime: resp.data.attributes.send_time || "" })
    }
  }

  for (const id of missingFlows.slice(0, 15)) {
    await sleep(MIN_REQUEST_INTERVAL)
    const resp = await klaviyoRequest<SingleFlowResp>(apiKey, `/flows/${id}/`)
    if (resp?.data) {
      flowNames.set(resp.data.id, { name: resp.data.attributes.name, status: resp.data.attributes.status || "unknown" })
    }
  }

  log.info(`[Klaviyo] Final names - campaigns: ${campNames.size}/${campAgg.size}, flows: ${flowNames.size}/${flowAgg.size}`)

  // ── Build campaign list ──
  let campaignRevenue = 0
  let campaignOpenRateSum = 0
  let campaignClickRateSum = 0
  let campaignBounceSum = 0
  let campaignUnsubSum = 0
  let rateCount = 0
  let totalDelivered = 0
  let totalOpens = 0
  let totalClicks = 0

  const recentCampaigns: KlaviyoCampaignItem[] = []

  for (const [cid, m] of campAgg) {
    campaignRevenue += m.conversionValue
    totalDelivered += m.delivered
    totalOpens += m.opensUnique
    totalClicks += Math.round(m.clickRate * m.delivered)

    const openRate = m.delivered > 0 ? (m.opensUnique / m.delivered) * 100 : 0
    if (openRate > 0 || m.clickRate > 0) {
      campaignOpenRateSum += openRate
      campaignClickRateSum += m.clickRate
      campaignBounceSum += m.bounceRate
      campaignUnsubSum += m.unsubscribeRate
      rateCount++
    }

    const info = campNames.get(cid)
    recentCampaigns.push({
      campaignId: cid,
      name: info?.name || `Campaign ${cid.slice(0, 6)}`,
      sendTime: info?.sendTime || "",
      recipients: m.recipients,
      delivered: m.delivered,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: m.clickRate,
      revenue: m.conversionValue,
    })
  }

  // ── Build flow list (excluding archived flows) ──
  let flowRevenue = 0
  const topFlows: KlaviyoFlowItem[] = []

  for (const [fid, m] of flowAgg) {
    if (archivedFlowIds.has(fid)) continue
    flowRevenue += m.conversionValue
    totalDelivered += m.delivered
    totalOpens += m.opensUnique
    totalClicks += Math.round(m.clickRate * m.delivered)

    const openRate = m.delivered > 0 ? (m.opensUnique / m.delivered) * 100 : 0
    const info = flowNames.get(fid)
    topFlows.push({
      flowId: fid,
      name: info?.name || `Flow ${fid.slice(0, 6)}`,
      status: info?.status || "live",
      delivered: m.delivered,
      revenue: m.conversionValue,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: m.clickRate,
    })
  }

  recentCampaigns.sort((a, b) => b.revenue - a.revenue)
  topFlows.sort((a, b) => b.revenue - a.revenue)

  const avgOpenRate = rateCount > 0 ? campaignOpenRateSum / rateCount : 0
  const avgClickRate = rateCount > 0 ? campaignClickRateSum / rateCount : 0
  const bounceRate = rateCount > 0 ? campaignBounceSum / rateCount : 0
  const unsubscribeRate = rateCount > 0 ? campaignUnsubSum / rateCount : 0

  const attributedRevenue = campaignRevenue + flowRevenue
  const recoveryRate = storeRevenue > 0 ? (attributedRevenue / storeRevenue) * 100 : 0

  log.info(`[Klaviyo] storeRevenue=${storeRevenue.toFixed(2)}, attributed=${attributedRevenue.toFixed(2)}, recovery=${recoveryRate.toFixed(1)}%`)

  return {
    storeRevenue,
    storeOrders,
    attributedRevenue,
    campaignRevenue,
    flowRevenue,
    recoveryRate,
    sentCampaigns: campAgg.size,
    totalFlows: flowAgg.size,
    liveFlows: flowAgg.size,
    totalDelivered,
    totalOpens,
    totalClicks,
    avgOpenRate,
    avgClickRate,
    bounceRate,
    unsubscribeRate,
    recentCampaigns: recentCampaigns.slice(0, 10),
    topFlows: topFlows.slice(0, 10),
  }
}

export function emptyPerformanceData(): KlaviyoPerformanceData {
  return {
    storeRevenue: 0, storeOrders: 0,
    attributedRevenue: 0, campaignRevenue: 0, flowRevenue: 0, recoveryRate: 0,
    sentCampaigns: 0, totalFlows: 0, liveFlows: 0,
    totalDelivered: 0, totalOpens: 0, totalClicks: 0,
    avgOpenRate: 0, avgClickRate: 0, bounceRate: 0, unsubscribeRate: 0,
    recentCampaigns: [], topFlows: [],
  }
}
