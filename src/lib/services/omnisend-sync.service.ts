/**
 * Omnisend Sync Service
 *
 * Fetches campaign metrics, automation metrics, audience data,
 * and revenue data from the Omnisend API.
 *
 * Follows the same architecture as klaviyo-sync.service.ts.
 *
 * Omnisend API:
 *   - Campaigns list: GET /v3/campaigns (includes stats inline)
 *   - Campaign stats: GET /v5/campaigns/{id}/statistics (detailed metrics + revenue)
 *   - Automations list: GET /v3/automations (includes stats inline)
 *   - Automation stats: GET /v5/automations/{id}/statistics (detailed metrics + revenue)
 *   - Contacts: GET /v5/contacts (for audience size)
 *   - Segments: GET /v5/segments (for segment data + contactsCount)
 *   - Brands: GET /v5/brands/current (account info)
 *   - Orders: GET /v3/orders (for revenue attribution)
 */

import { logger } from "@/lib/logger"
import {
  omnisendRequest,
  omnisendPaginateV3,
  OMNISEND_V3,
  OMNISEND_V5,
  OMNISEND_V2026,
  OMNISEND_CAMPAIGNS_INTERVAL_MS,
  OmnisendRateLimitError,
  OmnisendInvalidKeyError,
  OmnisendPermissionError,
  sleep,
} from "@/lib/integrations/omnisend/client"

const log = logger.child("OmnisendSync")

// ── Types ─────────────────────────────────────────────────

export interface OmnisendBrand {
  brandID: string
  website?: string
  platform?: string
  currency?: string
  createdAt?: string
}

export interface OmnisendCampaignStats {
  sent?: number
  delivered?: number
  opened?: number
  uniqueOpened?: number
  clicked?: number
  uniqueClicked?: number
  bounced?: number
  complained?: number
  unsubscribed?: number
  revenue?: number
  orders?: number
  totalRevenue?: number
  ordersCount?: number
  averageOrderValue?: number
  clickToOpenRate?: number
  complaintRate?: number
  // Computed rates
  openRate?: number
  clickRate?: number
  bounceRate?: number
  unsubscribeRate?: number
  conversionRate?: number
}

export interface OmnisendSegment {
  segmentID: string
  name: string
  type?: string
  contactsCount: number
  createdAt?: string
  updatedAt?: string
}

export interface OmnisendCampaign {
  campaignID: string
  name: string
  status: string // draft, scheduled, inProgress, sent, paused
  type?: string // regular, abTest
  channel?: string // email, sms, push
  subject?: string
  createdAt?: string
  updatedAt?: string
  sendAt?: string // scheduled send time
  completedAt?: string
  stats?: OmnisendCampaignStats
  // v3 API also nests these
  [key: string]: unknown
}

export interface OmnisendAutomation {
  automationID: string
  name: string
  status: string // enabled, disabled, draft
  triggerType?: string
  createdAt?: string
  updatedAt?: string
  stats?: OmnisendCampaignStats
  [key: string]: unknown
}

export interface OmnisendOrder {
  orderID: string
  orderNumber?: number
  email?: string
  createdAt: string
  currency: string
  orderSum: number
  subTotalSum?: number
  discountSum?: number
  taxSum?: number
  shippingSum?: number
  fulfillmentStatus?: string
  paymentStatus?: string
  source?: string
  attributionSource?: string
  campaignID?: string
  automationID?: string
  [key: string]: unknown
}

export interface OmnisendContact {
  contactID: string
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  status?: string
  tags?: string[]
  createdAt?: string
  [key: string]: unknown
}

// ── Sync result types ─────────────────────────────────────

export interface OmnisendCampaignRow {
  store_id: string
  org_id: string
  campaign_id: string
  campaign_name: string
  campaign_status: string
  channel: string
  subject: string | null
  send_time: string | null
  recipients: number
  delivered: number
  delivery_rate: number
  opened: number
  open_rate: number
  clicked: number
  click_rate: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  revenue_per_recipient: number
  bounced: number
  bounce_rate: number
  unsubscribed: number
  unsubscribe_rate: number
  spam_complaints: number
}

export interface OmnisendAutomationRow {
  store_id: string
  org_id: string
  automation_id: string
  automation_name: string
  automation_status: string
  trigger_type: string | null
  recipients: number
  delivered: number
  delivery_rate: number
  opened: number
  open_rate: number
  clicked: number
  click_rate: number
  conversions: number
  conversion_rate: number
  conversion_value: number
  revenue_per_recipient: number
  bounced: number
  bounce_rate: number
  unsubscribed: number
  unsubscribe_rate: number
}

export interface OmnisendSyncData {
  campaignRows: OmnisendCampaignRow[]
  automationRows: OmnisendAutomationRow[]
  segments: OmnisendSegment[]
  totalCampaignRevenue: number
  totalAutomationRevenue: number
  totalStoreRevenue: number
  totalOrders: number
  totalContacts: number
  subscribedContacts: number
  currency: string
}

export type SyncErrorType = "rate_limit" | "invalid_key" | "permission" | "unknown"

export interface SyncResult<T> {
  ok: boolean
  data?: T
  error?: string
  errorType?: SyncErrorType
  retryAfterMs?: number
}

// ── Brand info ────────────────────────────────────────────

export async function fetchBrandInfo(apiKey: string): Promise<OmnisendBrand | null> {
  return omnisendRequest<OmnisendBrand>(apiKey, `${OMNISEND_V5}/brands/current`, {
    logTag: "OmnisendBrand",
  })
}

// ── Campaigns ─────────────────────────────────────────────

export async function fetchCampaigns(apiKey: string): Promise<OmnisendCampaign[]> {
  // /v3/campaigns esta em tier restrito (1 RPS per client) — usar intervalo de
  // 1100ms entre paginas para evitar 429.
  // NOTE: Omnisend v3 /campaigns so aceita sort em: sent,clicked,bounced,
  // complained,opened,unsubscribed (NAO aceita createdAt).
  return omnisendPaginateV3<OmnisendCampaign>(apiKey, `${OMNISEND_V3}/campaigns`, "campaigns", {
    logTag: "OmnisendCampaigns",
    intervalMs: OMNISEND_CAMPAIGNS_INTERVAL_MS,
  })
}

export async function fetchSentCampaigns(apiKey: string): Promise<OmnisendCampaign[]> {
  // Filter to only sent campaigns (status=sent) — tier 1 RPS
  // sort=sent ordena pela data de envio (desc = mais recentes primeiro).
  return omnisendPaginateV3<OmnisendCampaign>(apiKey, `${OMNISEND_V3}/campaigns`, "campaigns", {
    logTag: "OmnisendSentCampaigns",
    queryParams: { status: "sent", sort: "sent", sortDirection: "desc" },
    intervalMs: OMNISEND_CAMPAIGNS_INTERVAL_MS,
  })
}

/**
 * Busca campanhas em TODOS os status relevantes para relatorio
 * (sent + scheduled + inProgress + paused). Nao inclui drafts por default
 * pois sao rascunhos que nao afetam analytics.
 */
export async function fetchAllReportCampaigns(apiKey: string): Promise<OmnisendCampaign[]> {
  const statusList = ["sent", "scheduled", "inProgress", "paused"]
  const all: OmnisendCampaign[] = []
  const seen = new Set<string>()

  for (const status of statusList) {
    // Omnisend v3 /campaigns rejeita sort=createdAt. Para status=sent
    // usamos sort=sent; para os demais status nao enviamos sort pois os
    // campos validos (sent/clicked/bounced/opened/...) so existem para sent.
    const queryParams: Record<string, string> =
      status === "sent"
        ? { status, sort: "sent", sortDirection: "desc" }
        : { status }

    const batch = await omnisendPaginateV3<OmnisendCampaign>(
      apiKey,
      `${OMNISEND_V3}/campaigns`,
      "campaigns",
      {
        logTag: `OmnisendCampaigns_${status}`,
        queryParams,
        intervalMs: OMNISEND_CAMPAIGNS_INTERVAL_MS,
      }
    )
    for (const c of batch) {
      if (!seen.has(c.campaignID)) {
        seen.add(c.campaignID)
        all.push(c)
      }
    }
  }
  return all
}

// ── Campaign Stats v5 (detailed) ──────────────────────────

export async function fetchCampaignStatsV5(
  apiKey: string,
  campaignID: string
): Promise<OmnisendCampaignStats | null> {
  return omnisendRequest<OmnisendCampaignStats>(
    apiKey,
    `${OMNISEND_V5}/campaigns/${campaignID}/statistics`,
    { logTag: "OmnisendCampaignStats" }
  )
}

// ── Automations ───────────────────────────────────────────

export async function fetchAutomations(apiKey: string): Promise<OmnisendAutomation[]> {
  return omnisendPaginateV3<OmnisendAutomation>(apiKey, `${OMNISEND_V3}/automations`, "automations", {
    logTag: "OmnisendAutomations",
  })
}

// ── Automation Stats v5 (detailed) ────────────────────────

export async function fetchAutomationStatsV5(
  apiKey: string,
  automationID: string
): Promise<OmnisendCampaignStats | null> {
  return omnisendRequest<OmnisendCampaignStats>(
    apiKey,
    `${OMNISEND_V5}/automations/${automationID}/statistics`,
    { logTag: "OmnisendAutomationStats" }
  )
}

// ── Segments ──────────────────────────────────────────────

interface SegmentsResponse {
  segments: OmnisendSegment[]
  paging?: { next?: string }
}

export async function fetchSegments(apiKey: string): Promise<OmnisendSegment[]> {
  const resp = await omnisendRequest<SegmentsResponse>(
    apiKey,
    `${OMNISEND_V5}/segments?limit=250`,
    { logTag: "OmnisendSegments" }
  )
  return resp?.segments || []
}

// ── Orders (for revenue attribution) ──────────────────────

export async function fetchOrders(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<OmnisendOrder[]> {
  return omnisendPaginateV3<OmnisendOrder>(apiKey, `${OMNISEND_V3}/orders`, "orders", {
    logTag: "OmnisendOrders",
    queryParams: {
      dateFrom: startDate,
      dateTo: endDate,
    },
    maxPages: 50, // Orders can be many — cap at 50 pages (12,500 orders)
  })
}

// ── Contacts / Audience ───────────────────────────────────

interface ContactsCountResponse {
  totalCount?: number
  contacts?: OmnisendContact[]
  paging?: { pages?: number; total?: number }
}

export async function fetchContactCounts(apiKey: string): Promise<{
  totalContacts: number
  subscribedContacts: number
}> {
  // Fetch total count (use limit=1 to minimize payload)
  const totalResp = await omnisendRequest<ContactsCountResponse>(
    apiKey,
    `${OMNISEND_V5}/contacts?limit=1`,
    { logTag: "OmnisendContactsTotal" }
  )

  // Fetch subscribed count
  const subscribedResp = await omnisendRequest<ContactsCountResponse>(
    apiKey,
    `${OMNISEND_V5}/contacts?limit=1&status=subscribed`,
    { logTag: "OmnisendContactsSubscribed" }
  )

  const totalContacts =
    totalResp?.paging?.total ??
    totalResp?.totalCount ??
    (totalResp?.contacts?.length || 0)

  const subscribedContacts =
    subscribedResp?.paging?.total ??
    subscribedResp?.totalCount ??
    (subscribedResp?.contacts?.length || 0)

  return { totalContacts, subscribedContacts }
}

// ── Revenue from orders ───────────────────────────────────

function computeRevenueFromOrders(orders: OmnisendOrder[]): {
  totalRevenue: number
  totalOrders: number
  campaignRevenue: number
  automationRevenue: number
} {
  let totalRevenue = 0
  let campaignRevenue = 0
  let automationRevenue = 0
  let totalOrders = 0

  for (const order of orders) {
    const sum = order.orderSum || 0
    totalRevenue += sum
    totalOrders++

    if (order.campaignID) {
      campaignRevenue += sum
    } else if (order.automationID) {
      automationRevenue += sum
    }
  }

  return { totalRevenue, totalOrders, campaignRevenue, automationRevenue }
}

// ── Compute rates helper ──────────────────────────────────

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 100
}

// ── Statistics API batch (v2026-03-15) ────────────────────
//
// Endpoint: POST /v2026-03-15/statistics
// Retorna metricas de TODAS as campaigns/automations em UMA chamada, com
// dateFrom/dateTo nativo. Substitui os loops de /v5/{id}/statistics que
// eram limitados a 20 itens por conta do rate limit de 1 RPS.

interface BatchStatRow {
  dimensions: Record<string, string | number>
  metrics: Record<string, number>
}

interface BatchStatsResponse {
  rows?: BatchStatRow[]
  data?: BatchStatRow[] // Omnisend as vezes usa `data` em vez de `rows`
}

const STATS_METRICS = [
  "sent",
  "delivered",
  "uniqueOpened",
  "opened",
  "uniqueClicked",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "totalRevenue",
  "attributedRevenue",
  "ordersCount",
  "averageOrderValue",
  "clickToOpenRate",
  "complaintRate",
]

/**
 * Busca em lote stats de todas as campanhas no periodo via Statistics API.
 * Retorna um Map<campaignId, stats> — vazio se o endpoint nao estiver
 * disponivel (conta sem acesso beta, etc.).
 */
async function fetchBatchCampaignStats(
  apiKey: string,
  dateFromISO: string,
  dateToISO: string
): Promise<Map<string, OmnisendCampaignStats>> {
  const resultMap = new Map<string, OmnisendCampaignStats>()
  try {
    const resp = await omnisendRequest<BatchStatsResponse>(apiKey, `${OMNISEND_V2026}/statistics`, {
      method: "POST",
      logTag: "OmnisendBatchStatsCamp",
      body: {
        metrics: STATS_METRICS,
        dimensions: ["campaignId"],
        filter: { dateFrom: dateFromISO, dateTo: dateToISO },
      },
    })
    const rows = resp?.rows || resp?.data || []
    for (const row of rows) {
      const id = String(row.dimensions?.campaignId || "")
      if (!id) continue
      resultMap.set(id, normalizeStats(row.metrics))
    }
    log.info(`Batch campaign stats: ${resultMap.size} entries`)
  } catch (err) {
    log.warn("Batch campaign stats unavailable, will fallback", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return resultMap
}

/**
 * Mesmo padrao para automations.
 */
async function fetchBatchAutomationStats(
  apiKey: string,
  dateFromISO: string,
  dateToISO: string
): Promise<Map<string, OmnisendCampaignStats>> {
  const resultMap = new Map<string, OmnisendCampaignStats>()
  try {
    const resp = await omnisendRequest<BatchStatsResponse>(apiKey, `${OMNISEND_V2026}/statistics`, {
      method: "POST",
      logTag: "OmnisendBatchStatsAuto",
      body: {
        metrics: STATS_METRICS,
        dimensions: ["automationId"],
        filter: { dateFrom: dateFromISO, dateTo: dateToISO },
      },
    })
    const rows = resp?.rows || resp?.data || []
    for (const row of rows) {
      const id = String(row.dimensions?.automationId || "")
      if (!id) continue
      resultMap.set(id, normalizeStats(row.metrics))
    }
    log.info(`Batch automation stats: ${resultMap.size} entries`)
  } catch (err) {
    log.warn("Batch automation stats unavailable, will fallback", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return resultMap
}

/**
 * Normaliza o formato de metrics do Statistics API para OmnisendCampaignStats.
 * O batch retorna metricas em `metrics.{nome}`; mapeamos para os nomes que o
 * resto do pipeline espera.
 */
function normalizeStats(m: Record<string, number>): OmnisendCampaignStats {
  return {
    sent: m.sent,
    delivered: m.delivered,
    opened: m.opened,
    uniqueOpened: m.uniqueOpened,
    clicked: m.clicked,
    uniqueClicked: m.uniqueClicked,
    bounced: m.bounced,
    complained: m.complained,
    unsubscribed: m.unsubscribed,
    totalRevenue: m.totalRevenue ?? m.attributedRevenue,
    revenue: m.attributedRevenue ?? m.totalRevenue,
    ordersCount: m.ordersCount,
    orders: m.ordersCount,
    averageOrderValue: m.averageOrderValue,
    clickToOpenRate: m.clickToOpenRate,
    complaintRate: m.complaintRate,
  }
}

// ── Main sync function ────────────────────────────────────

export async function syncOmnisendForStore(params: {
  storeId: string
  orgId: string
  apiKey: string
  periodDays: number
}): Promise<SyncResult<OmnisendSyncData>> {
  const { storeId, orgId, apiKey, periodDays } = params

  try {
    // 1. Fetch brand info (currency, etc.)
    const brand = await fetchBrandInfo(apiKey)
    const currency = brand?.currency || "USD"

    await sleep(200)

    // 2. Fetch campanhas em todos os status relevantes para relatorio
    //    (sent + scheduled + inProgress + paused). Descartamos drafts.
    const campaigns = await fetchAllReportCampaigns(apiKey)
    log.info(`Fetched ${campaigns.length} report-eligible campaigns`, { storeId })

    await sleep(200)

    // 3. Fetch automations
    const automations = await fetchAutomations(apiKey)
    log.info(`Fetched ${automations.length} automations`, { storeId })

    await sleep(200)

    // 4. Fetch orders for revenue attribution
    const endDate = new Date().toISOString()
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
    const orders = await fetchOrders(apiKey, startDate, endDate)
    log.info(`Fetched ${orders.length} orders for ${periodDays}d period`, { storeId })

    await sleep(200)

    // 5. Fetch contact counts
    const { totalContacts, subscribedContacts } = await fetchContactCounts(apiKey)
    log.info(`Contacts: ${totalContacts} total, ${subscribedContacts} subscribed`, { storeId })

    await sleep(200)

    // 5b. Fetch segments
    const segments = await fetchSegments(apiKey)
    log.info(`Fetched ${segments.length} segments`, { storeId })

    // 6. Compute revenue from orders
    const orderRevenue = computeRevenueFromOrders(orders)

    // 6b. Enrich TODAS as campanhas/automations via Statistics API batch
    //     (POST /v2026-03-15/statistics) — UMA chamada retorna stats para
    //     todas as campanhas do periodo, sem limite de 20.
    const batchCampaignStats = await fetchBatchCampaignStats(apiKey, startDate, endDate)
    const batchAutomationStats = await fetchBatchAutomationStats(apiKey, startDate, endDate)

    // Merge: stats do batch tem prioridade sobre o stats inline do v3
    for (const camp of campaigns) {
      const fromBatch = batchCampaignStats.get(camp.campaignID)
      if (fromBatch) {
        camp.stats = { ...camp.stats, ...fromBatch }
      }
    }
    for (const auto of automations) {
      const fromBatch = batchAutomationStats.get(auto.automationID)
      if (fromBatch) {
        auto.stats = { ...auto.stats, ...fromBatch }
      }
    }

    // 6c. Fallback: se o batch endpoint falhou (conta sem acesso, erro 403, etc.),
    //     enriquece as primeiras 20 campanhas/automations via v5/statistics
    //     como antes — garantindo ao menos parte dos dados.
    if (batchCampaignStats.size === 0 && campaigns.length > 0) {
      log.warn("Batch stats unavailable, falling back to v5/campaigns/{id}/statistics (first 20)")
      for (const camp of campaigns.slice(0, 20)) {
        try {
          const detailed = await fetchCampaignStatsV5(apiKey, camp.campaignID)
          if (detailed) camp.stats = { ...camp.stats, ...detailed }
          await sleep(200)
        } catch { /* non-critical */ }
      }
    }
    if (batchAutomationStats.size === 0 && automations.length > 0) {
      log.warn("Batch stats unavailable, falling back to v5/automations/{id}/statistics (first 20)")
      const activeAutomations = automations.filter(a => a.status === "enabled" || a.status === "active")
      for (const auto of activeAutomations.slice(0, 20)) {
        try {
          const detailed = await fetchAutomationStatsV5(apiKey, auto.automationID)
          if (detailed) auto.stats = { ...auto.stats, ...detailed }
          await sleep(200)
        } catch { /* non-critical */ }
      }
    }

    // 7. Map campaigns to rows
    const campaignRows: OmnisendCampaignRow[] = campaigns.map((c) => {
      const s = c.stats || ({} as OmnisendCampaignStats)
      const sent = s.sent || 0
      const delivered = s.delivered || 0
      const opened = s.uniqueOpened || s.opened || 0
      const clicked = s.uniqueClicked || s.clicked || 0
      const bounced = s.bounced || 0
      const unsubscribed = s.unsubscribed || 0
      const revenue = s.totalRevenue || s.revenue || 0
      const campaignOrders = s.ordersCount || s.orders || 0
      const spam = s.complained || 0

      return {
        store_id: storeId,
        org_id: orgId,
        campaign_id: c.campaignID,
        campaign_name: c.name || "Untitled",
        campaign_status: c.status,
        channel: c.channel || "email",
        subject: c.subject || null,
        send_time: c.completedAt || c.sendAt || c.createdAt || null,
        recipients: sent,
        delivered,
        delivery_rate: safeRate(delivered, sent),
        opened,
        open_rate: safeRate(opened, delivered),
        clicked,
        click_rate: safeRate(clicked, delivered),
        conversions: campaignOrders,
        conversion_rate: safeRate(campaignOrders, delivered),
        conversion_value: revenue,
        revenue_per_recipient: sent > 0 ? Math.round((revenue / sent) * 100) / 100 : 0,
        bounced,
        bounce_rate: safeRate(bounced, sent),
        unsubscribed,
        unsubscribe_rate: safeRate(unsubscribed, delivered),
        spam_complaints: spam,
      }
    })

    // 8. Map automations to rows.
    //    Inclui qualquer automation que esteja live OU que tenha tido
    //    atividade no periodo (delivered > 0 ou revenue > 0). Isso garante
    //    historico completo mesmo para flows pausados/desativados.
    const automationRows: OmnisendAutomationRow[] = automations
      .filter((a) => {
        const isLive = a.status === "enabled" || a.status === "active"
        const s = a.stats || ({} as OmnisendCampaignStats)
        const hasActivity = (s.delivered || 0) > 0
          || (s.totalRevenue || s.revenue || 0) > 0
          || (s.ordersCount || s.orders || 0) > 0
        return isLive || hasActivity
      })
      .map((a) => {
        const s = a.stats || ({} as OmnisendCampaignStats)
        const sent = s.sent || 0
        const delivered = s.delivered || 0
        const opened = s.uniqueOpened || s.opened || 0
        const clicked = s.uniqueClicked || s.clicked || 0
        const bounced = s.bounced || 0
        const unsubscribed = s.unsubscribed || 0
        const revenue = s.totalRevenue || s.revenue || 0
        const automationOrders = s.ordersCount || s.orders || 0

        return {
          store_id: storeId,
          org_id: orgId,
          automation_id: a.automationID,
          automation_name: a.name || "Untitled",
          automation_status: a.status,
          trigger_type: a.triggerType || null,
          recipients: sent,
          delivered,
          delivery_rate: safeRate(delivered, sent),
          opened,
          open_rate: safeRate(opened, delivered),
          clicked,
          click_rate: safeRate(clicked, delivered),
          conversions: automationOrders,
          conversion_rate: safeRate(automationOrders, delivered),
          conversion_value: revenue,
          revenue_per_recipient: sent > 0 ? Math.round((revenue / sent) * 100) / 100 : 0,
          bounced,
          bounce_rate: safeRate(bounced, sent),
          unsubscribed,
          unsubscribe_rate: safeRate(unsubscribed, delivered),
        }
      })

    // 9. Aggregate campaign revenue from stats
    const totalCampaignRevenue = campaignRows.reduce((sum, r) => sum + r.conversion_value, 0)
    const totalAutomationRevenue = automationRows.reduce((sum, r) => sum + r.conversion_value, 0)

    return {
      ok: true,
      data: {
        campaignRows,
        automationRows,
        segments,
        totalCampaignRevenue,
        totalAutomationRevenue,
        totalStoreRevenue: orderRevenue.totalRevenue,
        totalOrders: orderRevenue.totalOrders,
        totalContacts,
        subscribedContacts,
        currency,
      },
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error("Omnisend sync failed", { storeId, error: errMsg })
    if (error instanceof OmnisendRateLimitError) {
      return { ok: false, error: errMsg, errorType: "rate_limit", retryAfterMs: error.retryAfterMs }
    }
    if (error instanceof OmnisendInvalidKeyError) {
      return { ok: false, error: errMsg, errorType: "invalid_key" }
    }
    if (error instanceof OmnisendPermissionError) {
      return { ok: false, error: errMsg, errorType: "permission" }
    }
    return { ok: false, error: errMsg, errorType: "unknown" }
  }
}
