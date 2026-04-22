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
  omnisendPaginateV5,
  OMNISEND_V3,
  OMNISEND_V5,
  OMNISEND_CAMPAIGNS_INTERVAL_MS,
  OmnisendRateLimitError,
  OmnisendInvalidKeyError,
  OmnisendPermissionError,
  sleep,
} from "@/lib/integrations/omnisend/client"

const log = logger.child("OmnisendSync")

// ── Types ─────────────────────────────────────────────────

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
  campaignID?: string
  id?: string
  name: string
  status: string
  type?: string
  channel?: string
  subject?: string
  createdAt?: string
  updatedAt?: string
  sendAt?: string
  completedAt?: string
  stats?: OmnisendCampaignStats
  statistics?: OmnisendCampaignStats
  [key: string]: unknown
}

function getCampaignId(c: OmnisendCampaign): string {
  return c.campaignID || c.id || ""
}

function getCampaignStats(c: OmnisendCampaign): OmnisendCampaignStats {
  return c.stats || c.statistics || ({} as OmnisendCampaignStats)
}

export interface OmnisendAutomation {
  automationID?: string
  id?: string
  name: string
  status: string
  triggerType?: string
  trigger?: string
  createdAt?: string
  updatedAt?: string
  stats?: OmnisendCampaignStats
  statistics?: OmnisendCampaignStats
  [key: string]: unknown
}

function getAutomationId(a: OmnisendAutomation): string {
  return a.automationID || a.id || ""
}

function getAutomationStats(a: OmnisendAutomation): OmnisendCampaignStats {
  return a.stats || a.statistics || ({} as OmnisendCampaignStats)
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

// ── Campaigns ─────────────────────────────────────────────

/**
 * Busca campanhas em TODOS os status relevantes para relatorio.
 * Faz UMA chamada paginada sem filtro de status (retorna tudo) e
 * descarta drafts em memoria — reduz ~4x o numero de API calls
 * comparado com a versao anterior que fazia 1 request por status.
 */
export async function fetchAllReportCampaigns(apiKey: string): Promise<OmnisendCampaign[]> {
  const EXCLUDE_STATUSES = new Set(["draft"])

  const all = await omnisendPaginateV3<OmnisendCampaign>(
    apiKey,
    `${OMNISEND_V3}/campaigns`,
    "campaigns",
    {
      logTag: "OmnisendCampaigns_all",
      intervalMs: OMNISEND_CAMPAIGNS_INTERVAL_MS,
    }
  )

  if (all.length > 0) {
    const statusBreakdown: Record<string, number> = {}
    for (const c of all) {
      const s = (c.status || "unknown").toLowerCase()
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1
    }
    log.info(`[DIAG] Campaign statuses: ${JSON.stringify(statusBreakdown)}, total=${all.length}`)
  }

  return all.filter((c) => !EXCLUDE_STATUSES.has((c.status || "").toLowerCase()))
}

// ── Automations ───────────────────────────────────────────

export async function fetchAutomations(apiKey: string): Promise<OmnisendAutomation[]> {
  return omnisendPaginateV5<OmnisendAutomation>(apiKey, `${OMNISEND_V5}/automations`, "automations", {
    logTag: "OmnisendAutomations",
  })
}

// ── Segments ──────────────────────────────────────────────

export async function fetchSegments(apiKey: string): Promise<OmnisendSegment[]> {
  return omnisendPaginateV5<OmnisendSegment>(apiKey, `${OMNISEND_V5}/segments`, "segments", {
    logTag: "OmnisendSegments",
    maxPages: 40,
  })
}

// ── Events (revenue attribution via placed order events) ─

export interface OmnisendEvent {
  eventID?: string
  eventName?: string
  email?: string
  contactID?: string
  createdAt?: string
  systemName?: string
  action?: string
  [key: string]: unknown
}

export async function fetchPlacedOrderEvents(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<OmnisendEvent[]> {
  return omnisendPaginateV5<OmnisendEvent>(apiKey, `${OMNISEND_V5}/events`, "events", {
    logTag: "OmnisendPlacedOrders",
    queryParams: {
      from: startDate,
      to: endDate,
    },
    maxPages: 200,
  })
}

// ── Contacts / Audience ───────────────────────────────────

const CONTACTS_PAGE_LIMIT = 250
const CONTACTS_MAX_PAGES = 100

async function countContacts(
  apiKey: string,
  logTag: string,
  queryParams: Record<string, string>
): Promise<number> {
  const initialParams = new URLSearchParams({ ...queryParams, limit: String(CONTACTS_PAGE_LIMIT) })
  let url: string | null = `${OMNISEND_V5}/contacts?${initialParams}`
  let count = 0
  let pages = 0

  for (let page = 0; page < CONTACTS_MAX_PAGES && url; page++) {
    const resp: Record<string, unknown> | null = await omnisendRequest<Record<string, unknown>>(apiKey, url, { logTag })
    if (!resp) break

    // Primeira pagina: tentar extrair total direto do paging (se a API fornecer)
    if (page === 0) {
      const paging = resp.paging as Record<string, unknown> | undefined
      if (paging && typeof paging.total === "number") {
        log.info(`[${logTag}] Got total from paging.total: ${paging.total}`)
        return paging.total as number
      }
      if (typeof (resp as Record<string, unknown>).totalCount === "number") {
        log.info(`[${logTag}] Got total from totalCount: ${(resp as Record<string, unknown>).totalCount}`)
        return (resp as Record<string, unknown>).totalCount as number
      }
    }

    const contacts = (resp.contacts as OmnisendContact[]) || []
    count += contacts.length
    pages++
    const paging = resp.paging as { next?: string } | undefined
    url = paging?.next || null
  }

  log.info(`[${logTag}] Counted ${count} contacts in ${pages} pages`)
  return count
}

export async function fetchContactCounts(apiKey: string): Promise<{
  totalContacts: number
  subscribedContacts: number
}> {
  const totalContacts = await countContacts(apiKey, "OmnisendContactsTotal", {})
  const subscribedContacts = await countContacts(apiKey, "OmnisendContactsSubscribed", {
    status: "subscribed",
  })
  return { totalContacts, subscribedContacts }
}

// ── Compute rates helper ──────────────────────────────────

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0
  return Math.round((numerator / denominator) * 10000) / 100
}

// ── Statistics API (REMOVIDA) ─────────────────────────────
// Os endpoints /v2026-preview/statistics, /v5/campaigns/{id}/statistics e
// /v5/automations/{id}/statistics NAO existem publicamente (404 confirmado).
// Stats vem inline na resposta de /v3/campaigns e /v5/automations.

// ── In-memory sync lock ──────────────────────────────────
// Evita que 3 requests simultaneos (report + campaigns + flows) disparem
// 3 syncs completos contra a API Omnisend, estourando o rate limit.
// Se um sync já está rodando para o storeId, os demais aguardam o resultado.

const activeSyncs = new Map<string, Promise<SyncResult<OmnisendSyncData>>>()

export async function syncOmnisendForStore(params: {
  storeId: string
  orgId: string
  apiKey: string
  periodDays: number
}): Promise<SyncResult<OmnisendSyncData>> {
  const lockKey = `${params.storeId}:${params.periodDays}`
  const existing = activeSyncs.get(lockKey)
  if (existing) {
    log.info("Sync already running for store, waiting for result", { storeId: params.storeId })
    return existing
  }

  const promise = doSyncOmnisendForStore(params)
  activeSyncs.set(lockKey, promise)
  try {
    return await promise
  } finally {
    activeSyncs.delete(lockKey)
  }
}

async function doSyncOmnisendForStore(params: {
  storeId: string
  orgId: string
  apiKey: string
  periodDays: number
}): Promise<SyncResult<OmnisendSyncData>> {
  const { storeId, orgId, apiKey, periodDays } = params

  try {
    // 1. Fetch campanhas em todos os status relevantes para relatorio
    //    (sent + scheduled + inProgress + paused). Descartamos drafts.
    const campaigns = await fetchAllReportCampaigns(apiKey)
    log.info(`Fetched ${campaigns.length} report-eligible campaigns`, { storeId })
    if (campaigns.length > 0) {
      const sample = campaigns[0]
      const keys = Object.keys(sample).filter(k => k !== "campaignID" && k !== "name")
      log.info(`[DIAG] Campaign sample fields: ${keys.join(", ")}`, {
        storeId,
        hasStats: !!sample.stats,
        sampleKeys: keys.slice(0, 20),
        statsKeys: sample.stats ? Object.keys(sample.stats) : [],
        rawStatsSnippet: sample.stats ? JSON.stringify(sample.stats).slice(0, 300) : "null",
        statisticsField: typeof (sample as Record<string, unknown>).statistics,
        trackingField: typeof (sample as Record<string, unknown>).tracking,
      })
    }

    await sleep(200)

    // 2. Fetch automations (v5 cursor-based)
    const automations = await fetchAutomations(apiKey)
    log.info(`Fetched ${automations.length} automations`, { storeId })
    if (automations.length > 0) {
      const sample = automations[0]
      const keys = Object.keys(sample).filter(k => k !== "automationID" && k !== "name")
      log.info(`[DIAG] Automation sample fields: ${keys.join(", ")}`, {
        storeId,
        hasStats: !!sample.stats,
        sampleKeys: keys.slice(0, 20),
        statsKeys: sample.stats ? Object.keys(sample.stats) : [],
        rawStatsSnippet: sample.stats ? JSON.stringify(sample.stats).slice(0, 300) : "null",
      })
    }

    await sleep(200)

    // 3. Fetch placed order events for revenue attribution
    const endDate = new Date().toISOString()
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
    const events = await fetchPlacedOrderEvents(apiKey, startDate, endDate)
    log.info(`Fetched ${events.length} events for ${periodDays}d period`, {
      storeId,
      sampleEvent: events.length > 0 ? JSON.stringify(events[0]).slice(0, 600) : "none",
      sampleKeys: events.length > 0 ? Object.keys(events[0]) : [],
    })

    // Currency: tenta extrair dos eventos; default EUR para lojas europeias
    const currency = "EUR"

    await sleep(200)

    // 5. Fetch contact counts
    const { totalContacts, subscribedContacts } = await fetchContactCounts(apiKey)
    log.info(`Contacts: ${totalContacts} total, ${subscribedContacts} subscribed`, { storeId })

    await sleep(200)

    // 5b. Fetch segments
    const segments = await fetchSegments(apiKey)
    log.info(`Fetched ${segments.length} segments`, { storeId })

    // 6. Revenue: computar dos eventos placed order
    //    TODO: refinar quando soubermos o shape exato dos events
    let totalEventRevenue = 0
    let totalEventOrders = 0
    for (const evt of events) {
      const val = Number((evt as Record<string, unknown>).value
        || (evt as Record<string, unknown>).$value
        || (evt as Record<string, unknown>).orderSum
        || 0)
      if (val > 0) {
        totalEventRevenue += val
        totalEventOrders++
      }
    }
    log.info(`[DIAG] Events revenue: ${totalEventRevenue}, orders: ${totalEventOrders}`, { storeId })

    // Stats inline: a API retorna stats/statistics no proprio objeto da campanha/automation.
    // Batch Statistics API e v5/{id}/statistics NAO existem publicamente (404).
    // Usamos APENAS os stats inline do v3/v5.
    if (campaigns.length > 0) {
      const withStats = campaigns.filter(c => getCampaignStats(c) && Object.keys(getCampaignStats(c)).length > 0).length
      log.info(`[DIAG] Campaigns with inline stats: ${withStats}/${campaigns.length}`, { storeId })
      if (withStats === 0) {
        const raw = campaigns[0] as Record<string, unknown>
        log.warn(`[DIAG] First campaign raw keys: ${Object.keys(raw).join(", ")}`, {
          storeId,
          rawSnippet: JSON.stringify(raw).slice(0, 600),
        })
      }
    }
    if (automations.length > 0) {
      const withStats = automations.filter(a => getAutomationStats(a) && Object.keys(getAutomationStats(a)).length > 0).length
      log.info(`[DIAG] Automations with inline stats: ${withStats}/${automations.length}`, { storeId })
      if (withStats === 0) {
        const raw = automations[0] as Record<string, unknown>
        log.warn(`[DIAG] First automation raw keys: ${Object.keys(raw).join(", ")}`, {
          storeId,
          rawSnippet: JSON.stringify(raw).slice(0, 600),
        })
      }
    }

    // 7. Map campaigns to rows
    const campaignRows: OmnisendCampaignRow[] = campaigns
      .filter(c => getCampaignId(c))
      .map((c) => {
      const s = getCampaignStats(c)
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
        campaign_id: getCampaignId(c),
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
        if (!getAutomationId(a)) return false
        const isLive = a.status === "enabled" || a.status === "active"
        const s = getAutomationStats(a)
        const hasActivity = (s.delivered || 0) > 0
          || (s.totalRevenue || s.revenue || 0) > 0
          || (s.ordersCount || s.orders || 0) > 0
        return isLive || hasActivity
      })
      .map((a) => {
        const s = getAutomationStats(a)
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
          automation_id: getAutomationId(a),
          automation_name: a.name || "Untitled",
          automation_status: a.status,
          trigger_type: a.triggerType || a.trigger || null,
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
        totalStoreRevenue: totalEventRevenue,
        totalOrders: totalEventOrders,
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
