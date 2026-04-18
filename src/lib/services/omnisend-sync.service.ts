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
  OMNISEND_V2026,
  OMNISEND_CAMPAIGNS_INTERVAL_MS,
  OmnisendRateLimitError,
  OmnisendInvalidKeyError,
  OmnisendPermissionError,
  sleep,
} from "@/lib/integrations/omnisend/client"

/** Converte ISO 8601 ou Date para YYYY-MM-DD (formato exigido por /v3/orders). */
function toYMD(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toISOString().slice(0, 10)
}

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
//
// NOTE: Omnisend nao expoe um GET /v5/brands/current com API key — esse
// endpoint e OAuth POST usado para CONECTAR a loja. Derivamos currency dos
// proprios orders (cada order tem `currency`) como fallback seguro. Se nao
// houver orders no periodo, caimos em "USD".

export function deriveCurrencyFromOrders(orders: OmnisendOrder[], fallback = "USD"): string {
  for (const o of orders) {
    if (o.currency && typeof o.currency === "string") return o.currency
  }
  return fallback
}

// ── Campaigns ─────────────────────────────────────────────

export async function fetchCampaigns(apiKey: string): Promise<OmnisendCampaign[]> {
  // OMNISEND_CAMPAIGNS_INTERVAL_MS (1100ms) e defesa EMPIRICA contra 429
  // observados em /v3/campaigns — nao ha doc oficial de tier "1 RPS per client".
  // NOTE: comentario anterior afirmava que v3 /campaigns so aceita sort em
  // sent/clicked/bounced/... (rejeitando createdAt) — ISSO NAO FOI CONFIRMADO
  // NA DOC OFICIAL. Pode ter vindo de um 422 observado empiricamente. A doc
  // v2026-03-15 nova aceita createdAt/updatedAt/name. Validar em staging
  // antes de mudar a estrategia.
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
//
// Omnisend expoe automations em /v5 (a v3 nao esta documentada).
// /v5 usa paginacao cursor (paging.next como URL completa).
export async function fetchAutomations(apiKey: string): Promise<OmnisendAutomation[]> {
  return omnisendPaginateV5<OmnisendAutomation>(apiKey, `${OMNISEND_V5}/automations`, "automations", {
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
//
// /v5/segments usa paginacao cursor — a versao antiga lia apenas a primeira
// pagina (truncando em 250 segmentos) porque so usava o GET direto.
export async function fetchSegments(apiKey: string): Promise<OmnisendSegment[]> {
  return omnisendPaginateV5<OmnisendSegment>(apiKey, `${OMNISEND_V5}/segments`, "segments", {
    logTag: "OmnisendSegments",
    maxPages: 40, // cap em 10k segmentos
  })
}

// ── Orders (for revenue attribution) ──────────────────────

export async function fetchOrders(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<OmnisendOrder[]> {
  // Omnisend /v3/orders exige dateFrom/dateTo no formato YYYY-MM-DD.
  // Passar ISO 8601 completo resulta em 422 ou truncamento silencioso.
  return omnisendPaginateV3<OmnisendOrder>(apiKey, `${OMNISEND_V3}/orders`, "orders", {
    logTag: "OmnisendOrders",
    queryParams: {
      dateFrom: toYMD(startDate),
      dateTo: toYMD(endDate),
    },
    maxPages: 50, // Orders can be many — cap at 50 pages (12,500 orders)
  })
}

// ── Contacts / Audience ───────────────────────────────────
//
// /v5/contacts e cursor-based — NAO retorna `paging.total` nem `totalCount`.
// A versao antiga usava `limit=1` + `paging.total` e sempre retornava 1
// (bug critico). Para obter a contagem real precisamos paginar via cursor.
//
// Cap: 200 paginas * 250 contatos = 50k. Contas maiores sao raras no
// nicho; se atingir o cap, logamos warning e reportamos o valor parcial.

const CONTACTS_MAX_PAGES = 200
const CONTACTS_PAGE_LIMIT = 250

async function countContacts(
  apiKey: string,
  logTag: string,
  queryParams: Record<string, string>
): Promise<number> {
  const initialParams = new URLSearchParams({ ...queryParams, limit: String(CONTACTS_PAGE_LIMIT) })
  let url: string | null = `${OMNISEND_V5}/contacts?${initialParams}`
  let count = 0

  for (let page = 0; page < CONTACTS_MAX_PAGES && url; page++) {
    const resp: Record<string, unknown> | null = await omnisendRequest<Record<string, unknown>>(apiKey, url, { logTag })
    if (!resp) break
    const contacts = (resp.contacts as OmnisendContact[]) || []
    count += contacts.length
    const paging = resp.paging as { next?: string } | undefined
    url = paging?.next || null
  }

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

// Metricas do Statistics API (v2026-preview). Nomes confirmados na doc oficial
// "What's New - April 2026": totalOrders, totalRevenue, attributedRevenue,
// totalOrderedProductUnits, attributedOrderedProductUnits.
// NOTE: mantemos "ordersCount" como alias temporario — normalizeStats aceita
// ambos. Demais metricas (clickToOpenRate, complaintRate, averageOrderValue,
// uniqueOpened, etc.) nao foram confirmadas textualmente na doc; se a API
// rejeitar o POST, remover os nao-suportados aqui.
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
  "totalOrders",
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
  dateFrom: string,
  dateTo: string
): Promise<Map<string, OmnisendCampaignStats>> {
  const resultMap = new Map<string, OmnisendCampaignStats>()
  try {
    const resp = await omnisendRequest<BatchStatsResponse>(apiKey, `${OMNISEND_V2026}/statistics`, {
      method: "POST",
      logTag: "OmnisendBatchStatsCamp",
      body: {
        metrics: STATS_METRICS,
        dimensions: ["campaignId"],
        filter: { dateFrom: toYMD(dateFrom), dateTo: toYMD(dateTo) },
      },
    })
    if (!resp) {
      log.warn("Batch campaign stats returned null — endpoint indisponivel ou payload invalido (ver log [OmnisendBatchStatsCamp])")
      return resultMap
    }
    const rows = resp.rows || resp.data || []
    for (const row of rows) {
      const id = String(row.dimensions?.campaignId || "")
      if (!id) continue
      resultMap.set(id, normalizeStats(row.metrics))
    }
    log.info(`Batch campaign stats: ${resultMap.size} entries`)
  } catch (err) {
    // Propagar erros de auth/rate-limit; demais sao engolidos com log EXPLICITO
    // para permitir fallback via v5/{id}/statistics sem mascarar o problema.
    if (
      err instanceof OmnisendRateLimitError ||
      err instanceof OmnisendInvalidKeyError ||
      err instanceof OmnisendPermissionError
    ) {
      throw err
    }
    log.error("Batch campaign stats request error — usando fallback v5", {
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
  dateFrom: string,
  dateTo: string
): Promise<Map<string, OmnisendCampaignStats>> {
  const resultMap = new Map<string, OmnisendCampaignStats>()
  try {
    const resp = await omnisendRequest<BatchStatsResponse>(apiKey, `${OMNISEND_V2026}/statistics`, {
      method: "POST",
      logTag: "OmnisendBatchStatsAuto",
      body: {
        metrics: STATS_METRICS,
        dimensions: ["automationId"],
        filter: { dateFrom: toYMD(dateFrom), dateTo: toYMD(dateTo) },
      },
    })
    if (!resp) {
      log.warn("Batch automation stats returned null — endpoint indisponivel ou payload invalido (ver log [OmnisendBatchStatsAuto])")
      return resultMap
    }
    const rows = resp.rows || resp.data || []
    for (const row of rows) {
      const id = String(row.dimensions?.automationId || "")
      if (!id) continue
      resultMap.set(id, normalizeStats(row.metrics))
    }
    log.info(`Batch automation stats: ${resultMap.size} entries`)
  } catch (err) {
    if (
      err instanceof OmnisendRateLimitError ||
      err instanceof OmnisendInvalidKeyError ||
      err instanceof OmnisendPermissionError
    ) {
      throw err
    }
    log.error("Batch automation stats request error — usando fallback v5", {
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
  // Nome oficial do campo na doc do Statistics API (v2026-preview) e
  // "totalOrders". Mantemos fallback para "ordersCount" para compatibilidade
  // com respostas antigas ou casos em que a API aceite o alias.
  const totalOrders = m.totalOrders ?? m.ordersCount
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
    ordersCount: totalOrders,
    orders: totalOrders,
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
    // 1. Fetch campanhas em todos os status relevantes para relatorio
    //    (sent + scheduled + inProgress + paused). Descartamos drafts.
    const campaigns = await fetchAllReportCampaigns(apiKey)
    log.info(`Fetched ${campaigns.length} report-eligible campaigns`, { storeId })

    await sleep(200)

    // 2. Fetch automations (v5 cursor-based)
    const automations = await fetchAutomations(apiKey)
    log.info(`Fetched ${automations.length} automations`, { storeId })

    await sleep(200)

    // 3. Fetch orders for revenue attribution (dateFrom/To normalizados YYYY-MM-DD dentro de fetchOrders)
    const endDate = new Date().toISOString()
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
    const orders = await fetchOrders(apiKey, startDate, endDate)
    log.info(`Fetched ${orders.length} orders for ${periodDays}d period`, { storeId })

    // Currency derivada dos proprios orders (Omnisend nao expoe GET brand com API key)
    const currency = deriveCurrencyFromOrders(orders, "USD")

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
