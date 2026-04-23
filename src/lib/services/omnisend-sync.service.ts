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
  omnisendPaginateV5,
  OMNISEND_V3,
  OMNISEND_V5,
  OMNISEND_API,
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
  /** Legacy/derived. A partir da v2026 a API retorna `isEnabled` booleano. */
  status?: string
  /** Campo autoritativo a partir da Omnisend-Version 2026-03-15. */
  isEnabled?: boolean
  triggerType?: string
  trigger?: string | Record<string, unknown>
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

/** Normaliza o status da automation para o formato esperado pelo cache.
 *  A v2026 retorna `isEnabled: boolean`; quando true mapeamos para "live"
 *  para bater com o filtro `flow_status=live` em getUnifiedFlows. */
function getAutomationStatusStr(a: OmnisendAutomation): string {
  if (a.isEnabled === true) return "live"
  if (a.isEnabled === false) return "disabled"
  if (a.status) return a.status
  return "unknown"
}

/** True quando a automation esta ativamente rodando (aceita ambos os formatos). */
function isAutomationLive(a: OmnisendAutomation): boolean {
  if (a.isEnabled === true) return true
  if (a.isEnabled === false) return false
  return a.status === "enabled" || a.status === "active" || a.status === "live"
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
  totalAttributedRevenue: number
  totalAttributedOrders: number
  totalStoreRevenue: number
  totalOrders: number
  totalContacts: number
  subscribedContacts: number
  engagedContacts: number
  engagedSource: "segment" | "fallback"
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

  const all = await omnisendPaginateV5<OmnisendCampaign>(
    apiKey,
    `${OMNISEND_V5}/campaigns`,
    "campaigns",
    {
      logTag: "OmnisendCampaigns_v5",
    }
  )

  if (all.length > 0) {
    const statusBreakdown: Record<string, number> = {}
    for (const c of all) {
      const s = (c.status || "unknown").toLowerCase()
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1
    }
    const sample = all[0] as Record<string, unknown>
    log.info(`[DIAG] Campaign statuses: ${JSON.stringify(statusBreakdown)}, total=${all.length}, sampleKeys=${Object.keys(sample).slice(0, 15).join(",")}`)
  }

  return all.filter((c) => !EXCLUDE_STATUSES.has((c.status || "").toLowerCase()))
}

/**
 * Enriquece campanhas com stats via GET /v3/campaigns/{campaignID}.
 * A v3 detail retorna: sent, opened, clicked, bounced, complained, unsubscribed.
 * Revenue NAO esta disponivel na API publica.
 */
async function enrichCampaignsWithV3Stats(
  apiKey: string,
  campaigns: OmnisendCampaign[]
): Promise<void> {
  for (const camp of campaigns) {
    const campId = getCampaignId(camp)
    if (!campId) continue
    try {
      const detail = await omnisendRequest<Record<string, unknown>>(
        apiKey,
        `${OMNISEND_V3}/campaigns/${campId}`,
        { logTag: "OmnisendCampaignV3Detail" }
      )
      if (detail) {
        camp.stats = {
          sent: Number(detail.sent) || 0,
          delivered: Number(detail.sent) - (Number(detail.bounced) || 0),
          opened: Number(detail.opened) || 0,
          clicked: Number(detail.clicked) || 0,
          bounced: Number(detail.bounced) || 0,
          complained: Number(detail.complained) || 0,
          unsubscribed: Number(detail.unsubscribed) || 0,
        }
      }
      await sleep(200)
    } catch {
      log.warn(`Failed to fetch v3 detail for campaign ${campId}`)
    }
  }
}

// ── Automations ───────────────────────────────────────────

export async function fetchAutomations(apiKey: string): Promise<OmnisendAutomation[]> {
  const all = await omnisendPaginateV5<OmnisendAutomation>(apiKey, `${OMNISEND_V5}/automations`, "automations", {
    logTag: "OmnisendAutomations",
  })
  if (all.length > 0) {
    const sample = all[0] as Record<string, unknown>
    log.info(`[DIAG] Automation sample keys: ${Object.keys(sample).slice(0, 15).join(",")}, total=${all.length}`)
  }
  return all
}

// ── Segments ──────────────────────────────────────────────

export async function fetchSegments(apiKey: string): Promise<OmnisendSegment[]> {
  return omnisendPaginateV5<OmnisendSegment>(apiKey, `${OMNISEND_V5}/segments`, "segments", {
    logTag: "OmnisendSegments",
    maxPages: 40,
  })
}

// ── Statistics API (revenue) ─────────────────────────────

export interface OmnisendStatisticsResult {
  totalRevenue: number
  totalOrders: number
  attributedRevenue: number
  attributedOrders: number
}

export async function fetchOmnisendStatistics(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<OmnisendStatisticsResult> {
  const result: OmnisendStatisticsResult = {
    totalRevenue: 0, totalOrders: 0, attributedRevenue: 0, attributedOrders: 0,
  }

  try {
    const resp = await omnisendRequest<{ statistics: Array<{ rows: Array<Record<string, number>> }> }>(
      apiKey,
      `${OMNISEND_API}/analytics/statistics`,
      {
        method: "POST",
        logTag: "OmnisendStatistics",
        body: {
          queries: [{
            alias: "revenue",
            metrics: [
              { name: "totalRevenue" },
              { name: "totalOrders" },
              { name: "attributedRevenue" },
              { name: "attributedOrders" },
            ],
            dateRange: {
              from: new Date(startDate).toISOString(),
              to: new Date(endDate).toISOString(),
            },
            dimensions: [{ name: "timestamp", granularity: "month" }],
          }],
        },
      }
    )

    if (resp?.statistics?.[0]?.rows) {
      for (const row of resp.statistics[0].rows) {
        result.totalRevenue += row.totalRevenue || 0
        result.totalOrders += row.totalOrders || 0
        result.attributedRevenue += row.attributedRevenue || 0
        result.attributedOrders += row.attributedOrders || 0
      }
      log.info(`[OmnisendStatistics] Revenue: total=${result.totalRevenue}, attributed=${result.attributedRevenue}, orders=${result.totalOrders}`)
    }
  } catch (err) {
    if (err instanceof OmnisendRateLimitError || err instanceof OmnisendInvalidKeyError) throw err
    log.warn("[OmnisendStatistics] Failed, revenue will be 0", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return result
}

// ── Engaged 90D via Segments ─────────────────────────────

const ENGAGED_SEGMENT_PATTERNS = [
  /90\s*d[ií]as/i,
  /last\s*90/i,
  /90\s*day/i,
  /engajad[oa]s?.*90/i,
  /abri.*email.*90/i,
  /opened.*email.*90/i,
  /engaged.*90/i,
]

async function findEngaged90dFromSegments(
  apiKey: string,
  segments: OmnisendSegment[],
  subscribedCount: number
): Promise<{ count: number; source: "segment" | "fallback"; segmentName?: string }> {
  const matched = segments.find((seg) =>
    ENGAGED_SEGMENT_PATTERNS.some((p) => p.test(seg.name || ""))
  )

  if (!matched) {
    log.warn("[OmnisendEngaged] No 90d engaged segment found, using subscribed as fallback", {
      availableSegments: segments.map((s) => s.name).slice(0, 20),
    })
    return { count: subscribedCount, source: "fallback" }
  }

  const segmentId = matched.segmentID || (matched as unknown as Record<string, unknown>).id as string | undefined
  if (!segmentId) {
    return { count: subscribedCount, source: "fallback", segmentName: matched.name }
  }

  // Caminho 1: se o payload do /v5/segments trouxe contactsCount, usar direto.
  if (typeof matched.contactsCount === "number" && matched.contactsCount > 0) {
    log.info("[OmnisendEngaged] Using segment.contactsCount", {
      segmentId,
      segmentName: matched.name,
      count: matched.contactsCount,
    })
    return { count: matched.contactsCount, source: "segment", segmentName: matched.name }
  }

  // Caminho 2: paginar /v5/contacts?segments={id} — se a API honrar o filtro,
  // o count refletira apenas os contatos do segmento.
  log.info("[OmnisendEngaged] Paginating contacts filtered by segment", { segmentId, segmentName: matched.name })
  const count = await countContactsInSegment(apiKey, segmentId)
  if (count > 0) {
    return { count, source: "segment", segmentName: matched.name }
  }

  // Caminho 3: fallback para subscribedContacts se a paginacao filtrada retornou 0
  // (API pode nao suportar o filtro ou o segmento esta vazio).
  log.warn("[OmnisendEngaged] Segment count is 0, falling back to subscribedCount", {
    segmentId,
    segmentName: matched.name,
  })
  return { count: subscribedCount, source: "fallback", segmentName: matched.name }
}

/** Pagina /v5/contacts?segments={id} e tambem valida client-side via
 *  contact.segments[] para blindar contra APIs que ignoram o filtro. */
async function countContactsInSegment(apiKey: string, segmentId: string): Promise<number> {
  const initialParams = new URLSearchParams({
    segments: segmentId,
    limit: String(CONTACTS_PAGE_LIMIT),
  })
  let url: string | null = `${OMNISEND_V5}/contacts?${initialParams}`
  let count = 0
  let pages = 0
  let filterTrusted = true

  for (let page = 0; page < CONTACTS_MAX_PAGES && url; page++) {
    const resp: Record<string, unknown> | null = await omnisendRequest<Record<string, unknown>>(
      apiKey,
      url,
      { logTag: "OmnisendSegmentContacts" }
    )
    if (!resp) break

    if (page === 0) {
      const paging = resp.paging as Record<string, unknown> | undefined
      if (paging && typeof paging.total === "number") {
        log.info(`[OmnisendSegmentContacts] Got total from paging.total: ${paging.total}`)
        return paging.total as number
      }
    }

    const contacts = (resp.contacts as Array<OmnisendContact & { segments?: string[] }>) || []
    if (filterTrusted && page === 0 && contacts.length > 0) {
      const anyOutside = contacts.some(
        (c) => Array.isArray(c.segments) && c.segments.length > 0 && !c.segments.includes(segmentId)
      )
      if (anyOutside) {
        filterTrusted = false
        log.warn("[OmnisendSegmentContacts] API ignored segments filter, falling back to client-side check")
      }
    }

    for (const c of contacts) {
      if (filterTrusted) {
        count++
      } else if (Array.isArray(c.segments) && c.segments.includes(segmentId)) {
        count++
      }
    }
    pages++
    const paging = resp.paging as { next?: string } | undefined
    url = paging?.next || null
  }

  log.info(`[OmnisendSegmentContacts] Counted ${count} contacts in ${pages} pages (filterTrusted=${filterTrusted})`)
  return count
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

    // 2. Enrich campaigns with stats via v3 detail (GET /v3/campaigns/{id})
    //    v5 list NAO retorna stats inline; v3 detail retorna sent/opened/clicked/bounced
    await enrichCampaignsWithV3Stats(apiKey, campaigns)
    const withStats = campaigns.filter(c => getCampaignStats(c) && Object.keys(getCampaignStats(c)).length > 0).length
    log.info(`Enriched ${withStats}/${campaigns.length} campaigns with v3 stats`, { storeId })

    await sleep(200)

    // 3. Fetch automations (v5 cursor-based)
    //    NAO ha endpoint publico para stats de automations — so temos nome/status/trigger
    const automations = await fetchAutomations(apiKey)
    log.info(`Fetched ${automations.length} automations`, { storeId })

    await sleep(200)

    // 4. Contacts
    const { totalContacts, subscribedContacts } = await fetchContactCounts(apiKey)
    log.info(`Contacts: ${totalContacts} total, ${subscribedContacts} subscribed`, { storeId })

    await sleep(200)

    // 5. Segments + engaged 90D
    const segments = await fetchSegments(apiKey)
    log.info(`Fetched ${segments.length} segments`, { storeId })
    const engaged = await findEngaged90dFromSegments(apiKey, segments, subscribedContacts)

    // 6. Revenue via Statistics API (POST /api/analytics/statistics)
    const endDate = new Date().toISOString()
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
    const revenueStats = await fetchOmnisendStatistics(apiKey, startDate, endDate)
    const currency = "EUR"

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

      // subject: /v5/ retorna `subjectLine`; /api/ (2026-03-15) retorna
      // `content.email.subject`. Lemos ambos, com fallback para c.subject.
      const rawContent = (c as Record<string, unknown>).content as { email?: { subject?: string } } | undefined
      const subjectLine = (c as Record<string, unknown>).subjectLine as string | undefined
      const subjectValue = c.subject || subjectLine || rawContent?.email?.subject || null

      return {
        store_id: storeId,
        org_id: orgId,
        campaign_id: getCampaignId(c),
        campaign_name: c.name || "Untitled",
        campaign_status: c.status,
        channel: c.channel || "email",
        subject: subjectValue,
        // send_time: Omnisend mudou de shape entre /v5/ (startDate/endDate) e
        // /api/ (startedAt/endedAt) na Omnisend-Version 2026-03-15. Suportamos
        // ambos, mais completedAt/sendAt/createdAt como fallbacks antigos.
        send_time: (
          (c as Record<string, unknown>).startDate as string
          || (c as Record<string, unknown>).startedAt as string
          || c.completedAt
          || c.sendAt
          || (c as Record<string, unknown>).sentAt as string
          || c.createdAt
          || null
        ),
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
    const liveAutomationCount = automations.filter((a) => isAutomationLive(a)).length
    log.info(`[DIAG] ${liveAutomationCount} automations active (isEnabled=true)`, { storeId })

    const automationRows: OmnisendAutomationRow[] = automations
      .filter((a) => {
        if (!getAutomationId(a)) return false
        const s = getAutomationStats(a)
        const hasActivity = (s.delivered || 0) > 0
          || (s.totalRevenue || s.revenue || 0) > 0
          || (s.ordersCount || s.orders || 0) > 0
        return isAutomationLive(a) || hasActivity
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
        const triggerType = typeof a.trigger === "string"
          ? a.trigger
          : (a.triggerType || (a.trigger && typeof a.trigger === "object" && typeof (a.trigger as Record<string, unknown>).event === "string"
              ? (a.trigger as Record<string, unknown>).event as string
              : null))

        return {
          store_id: storeId,
          org_id: orgId,
          automation_id: getAutomationId(a),
          automation_name: a.name || "Untitled",
          automation_status: getAutomationStatusStr(a),
          trigger_type: triggerType,
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

    // 9. Revenue: Statistics API (Omnisend-Version 2026-03-15) retorna
    //    attributedRevenue/Orders como totais agregados. NAO suporta breakdown
    //    por campaign/workflow (unsupported dimension). Como fallback aceito,
    //    atribuimos tudo a "flow_revenue" (maioria da atribuicao vem de
    //    automations) e deixamos campaign_revenue em 0.
    //
    //    TODO: Omnisend Statistics API (2026-preview/2026-03-15) nao suporta
    //    dimension='campaign'|'workflow' para attributedRevenue. Revisar
    //    quando a API for GA e fornecer o breakdown.
    const totalAttributedRevenue = Math.max(0, revenueStats.attributedRevenue)
    const totalAttributedOrders = Math.max(0, revenueStats.attributedOrders)
    const totalCampaignRevenue = 0
    const totalAutomationRevenue = totalAttributedRevenue

    log.info("[OmnisendSync] Sync summary", {
      storeId,
      totalRevenue: revenueStats.totalRevenue,
      totalOrders: revenueStats.totalOrders,
      attributedRevenue: totalAttributedRevenue,
      attributedOrders: totalAttributedOrders,
      totalContacts,
      subscribedContacts,
      engagedContacts: engaged.count,
      engagedSource: engaged.source,
      campaignsSent: campaignRows.length,
      automationsActive: liveAutomationCount,
    })

    return {
      ok: true,
      data: {
        campaignRows,
        automationRows,
        segments,
        totalCampaignRevenue,
        totalAutomationRevenue,
        totalAttributedRevenue,
        totalAttributedOrders,
        totalStoreRevenue: revenueStats.totalRevenue,
        totalOrders: revenueStats.totalOrders,
        totalContacts,
        subscribedContacts,
        engagedContacts: engaged.count,
        engagedSource: engaged.source,
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
