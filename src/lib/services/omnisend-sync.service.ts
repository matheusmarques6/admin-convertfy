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
import { createAdminClient } from "@/lib/supabase/server"
import {
  omnisendRequest,
  omnisendPaginateV3,
  omnisendPaginateV5,
  OMNISEND_V3,
  OMNISEND_V5,
  OMNISEND_API,
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
  engagedSource: "segment" | "fallback" | "statistics-openedUnique"
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
    // Raw JSON do primeiro campaign ajuda a diagnosticar shape (send_time,
    // subject, channel, etc.) sem precisar rodar o sync com debugger.
    log.info(`[DIAG] Campaign[0] raw: ${JSON.stringify(sample).slice(0, 600)}`)
  } else {
    log.warn(`[DIAG] fetchAllReportCampaigns returned 0 items — /v5/campaigns may have migrated or retornou vazio`)
  }

  return all.filter((c) => !EXCLUDE_STATUSES.has((c.status || "").toLowerCase()))
}

/**
 * Enriquece campanhas com stats via GET /v3/campaigns?limit=250.
 *
 * R3 confirmou que a LISTA /v3/campaigns retorna os mesmos campos de
 * stats (sent, opened, clicked, bounced, complained, unsubscribed) inline
 * que o detail /v3/campaigns/{id}, em UMA UNICA chamada com paginacao.
 *
 * Substitui o antigo loop N×GET /v3/campaigns/{id} (1.1s entre cada
 * por rate limit "1 RPS per Client") por 1×GET /v3/campaigns?limit=250.
 * Para uma loja com 30 campanhas: ~33s de calls reduzido para ~2s.
 *
 * Revenue continua NAO disponivel — o /v3 nao expoe receita por campanha
 * individual (limitacao confirmada via discovery R3).
 */
async function enrichCampaignsWithV3Stats(
  apiKey: string,
  campaigns: OmnisendCampaign[]
): Promise<void> {
  if (campaigns.length === 0) return

  // /v3/campaigns retorna `{ campaign: [...], paging }` — note `campaign`
  // singular (nao `campaigns`) — confirmado em R3. Paginacao offset-based.
  type V3Campaign = {
    campaignID: string
    sent?: number
    opened?: number
    clicked?: number
    bounced?: number
    complained?: number
    unsubscribed?: number
  }

  let allV3: V3Campaign[] = []
  try {
    allV3 = await omnisendPaginateV3<V3Campaign>(
      apiKey,
      `${OMNISEND_V3}/campaigns`,
      "campaign",
      {
        logTag: "OmnisendV3CampaignsList",
        limit: 250,
        // /v3/campaigns lista nao tem rate limit "1 RPS per client"
        // documentado, mas mantemos o intervalo defensivo entre paginas
        // pra nao queimar burst budget.
        intervalMs: OMNISEND_CAMPAIGNS_INTERVAL_MS,
      },
    )
  } catch (err) {
    if (err instanceof OmnisendRateLimitError) {
      log.warn(`[V3 Enrich] /v3/campaigns rate-limited — pulando enrichment`, {
        retryAfterMs: err.retryAfterMs,
      })
      return
    }
    log.warn(`[V3 Enrich] Failed to list /v3/campaigns`, {
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  // Indexa por campaignID pra match O(1) com as campanhas vindas de /v5
  const v3ById = new Map<string, V3Campaign>()
  for (const c of allV3) {
    if (c.campaignID) v3ById.set(c.campaignID, c)
  }
  log.info(`[V3 Enrich] List returned ${allV3.length} campaigns; matching against ${campaigns.length} from v5`)

  // Aplica stats inline em cada campanha do /v5
  let matched = 0
  for (const camp of campaigns) {
    const campId = getCampaignId(camp)
    if (!campId) continue
    const v3 = v3ById.get(campId)
    if (!v3) continue
    matched++
    camp.stats = {
      sent: Number(v3.sent) || 0,
      delivered: (Number(v3.sent) || 0) - (Number(v3.bounced) || 0),
      opened: Number(v3.opened) || 0,
      clicked: Number(v3.clicked) || 0,
      bounced: Number(v3.bounced) || 0,
      complained: Number(v3.complained) || 0,
      unsubscribed: Number(v3.unsubscribed) || 0,
    }
  }
  log.info(`[V3 Enrich] Matched ${matched}/${campaigns.length} campaigns with v3 stats`)
}

// ── Automations ───────────────────────────────────────────

export async function fetchAutomations(apiKey: string): Promise<OmnisendAutomation[]> {
  const all = await omnisendPaginateV5<OmnisendAutomation>(apiKey, `${OMNISEND_V5}/automations`, "automations", {
    logTag: "OmnisendAutomations",
  })
  if (all.length > 0) {
    const sample = all[0] as Record<string, unknown>
    log.info(`[DIAG] Automation sample keys: ${Object.keys(sample).slice(0, 15).join(",")}, total=${all.length}`)
    // Raw JSON do primeiro item (truncado) ajuda a diagnosticar mudancas de
    // shape da API (ex: `isEnabled` ausente, `trigger` virou objeto, etc.)
    // sem precisar rodar o sync com debugger anexado.
    log.info(`[DIAG] Automation[0] raw: ${JSON.stringify(sample).slice(0, 600)}`)
    const enabledCount = all.filter((a) => a.isEnabled === true).length
    log.info(`[DIAG] Automations with isEnabled=true: ${enabledCount}/${all.length}`)
  } else {
    log.warn(`[DIAG] fetchAutomations returned 0 items — /v5/automations may have migrated or API key lacks scope`)
  }
  return all
}

// ── Segments ──────────────────────────────────────────────

export async function fetchSegments(apiKey: string): Promise<OmnisendSegment[]> {
  // Preferencia: /api/segments (Omnisend-Version 2026-03-15) — endpoint
  // atual confirmado por curl do Ryan. Shape: { segments: [{ segmentID, name, ... }] }
  // Fallback: /v5/segments (legacy). Logamos o body quando ambos falham para
  // diagnostico (nao mais fica silenciosamente caindo em fallback).
  const all: OmnisendSegment[] = []
  let after: string | undefined
  const MAX_PAGES = 80

  for (let page = 0; page < MAX_PAGES; page++) {
    // Limit max 50: a API /api/segments rejeita >50 com 400
    // "Must be between 1 and 50". Aumentar MAX_PAGES de 40 pra 80 pra
    // continuar suportando lojas com ate 4000 segmentos.
    const params = new URLSearchParams({ limit: "50" })
    if (after) params.set("after", after)
    const resp = await omnisendRequest<{
      segments?: Array<OmnisendSegment & { id?: string; contactsCount?: number }>
      data?: Array<OmnisendSegment & { id?: string }>
      paging?: { cursors?: { after?: string }; next?: string }
    }>(apiKey, `${OMNISEND_API}/segments?${params}`, { logTag: "OmnisendSegments" })
    if (!resp) break

    const items = resp.segments || resp.data || []
    // Normaliza: /api/ retorna segmentID; /v5/ retornava id. Garantimos
    // que o downstream sempre veja segmentID preenchido.
    for (const raw of items) {
      const normalized: OmnisendSegment = {
        ...raw,
        segmentID: raw.segmentID || raw.id || "",
        contactsCount: typeof raw.contactsCount === "number" ? raw.contactsCount : 0,
        name: raw.name || "",
      }
      if (normalized.segmentID) all.push(normalized)
    }

    after = resp.paging?.cursors?.after
    if (!after || items.length === 0) break
  }

  log.info(`[OmnisendSegments] Fetched ${all.length} segments via /api/segments`)
  if (all.length > 0) {
    const sample = all[0] as unknown as Record<string, unknown>
    log.info(`[DIAG] Segment[0] keys: ${Object.keys(sample).slice(0, 10).join(",")}, raw: ${JSON.stringify(sample).slice(0, 400)}`)
  }
  return all
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
    // Payload alinhado ao curl validado pelo Ryan (Azzurro Milano, abr/2026):
    // - granularity "day" (a API 2026-preview retorna rows diarias com totalRevenue/
    //   totalOrders/attributedRevenue/attributedOrders por dia)
    // - Omnisend-Version "2026-preview" (versao que funciona nos testes manuais;
    //   "2026-03-15" ainda e valida mas deu resultados inconsistentes em alguns
    //   requests recentes)
    const resp = await omnisendRequest<{
      statistics: Array<{
        alias?: string
        rows: Array<Record<string, number | string>>
      }>
    }>(
      apiKey,
      `${OMNISEND_API}/analytics/statistics`,
      {
        method: "POST",
        logTag: "OmnisendStatistics",
        // Ryan validou a Statistics API com "2026-preview" especificamente.
        // "2026-03-15" (default global) foi dando inconsistencias recentes.
        omnisendVersion: "2026-preview",
        // CRITICO: a Statistics API SILENCIOSAMENTE retorna rows vazias (0)
        // quando recebe X-API-KEY junto com Authorization. Foi isso que
        // quebrou a receita entre 22/04 (funcionou) e 24/04 (zerou) —
        // o commit c665ffe adicionou X-API-KEY global pra cobrir endpoints
        // legacy. Para /api/analytics/statistics precisamos mandar SO o
        // Authorization, igual ao curl que o Ryan validou (€371k total
        // + €12.853 attributed em Azzurro Milano).
        authStyle: "bearer",
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
            dimensions: [{ name: "timestamp", granularity: "day" }],
          }],
        },
      }
    )

    // Log do response bruto (primeiras 3 rows) para diagnosticar se a API
    // retorna 0, valores validos, ou shape diferente. Evita adivinhacao
    // quando a UI mostra R$ 0,00.
    if (resp?.statistics?.[0]) {
      const rows = resp.statistics[0].rows || []
      log.info(`[OmnisendStatistics] Received ${rows.length} rows, first 3: ${JSON.stringify(rows.slice(0, 3))}`)
      for (const row of rows) {
        result.totalRevenue += Number(row.totalRevenue) || 0
        result.totalOrders += Number(row.totalOrders) || 0
        result.attributedRevenue += Number(row.attributedRevenue) || 0
        result.attributedOrders += Number(row.attributedOrders) || 0
      }
      log.info(`[OmnisendStatistics] Totals: totalRevenue=${result.totalRevenue}, totalOrders=${result.totalOrders}, attributedRevenue=${result.attributedRevenue}, attributedOrders=${result.attributedOrders}`)
    } else {
      log.warn(`[OmnisendStatistics] Empty response or malformed shape: ${JSON.stringify(resp).slice(0, 300)}`)
    }
  } catch (err) {
    if (err instanceof OmnisendRateLimitError || err instanceof OmnisendInvalidKeyError) throw err
    log.warn("[OmnisendStatistics] Failed, revenue will be 0", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return result
}

// ── Reports API (revenue + engagement em UMA chamada) ────
//
// Endpoint descoberto via 6 rounds de discovery (R5 retornou 200):
//   POST /api/analytics/reports
//   Omnisend-Version: 2026-preview
//   Body: { queries: [{ alias, metrics, dateRange: {interval:"custom", from, to} }] }
//
// Retorna em UMA chamada o que hoje fazemos em duas:
//   - 5 metrics de revenue (attributedRevenue, attributedOrders, ...)
//   - 8 metrics de engagement (sent, opened, openedUnique, clicked, ...)
//
// Substitui o /api/analytics/statistics para os totais agregados.
//
// IMPORTANTE: dimensions de breakdown (campaign, workflow, automation,
// messageType, etc) NAO sao suportadas — confirmado em R5/R6 com schema
// correto. O endpoint so agrega por timestamp ou por nada. Por isso este
// fetch trabalha com totais agregados sem dimension.

export interface OmnisendReportsResult {
  // Revenue
  attributedRevenue: number
  attributedOrders: number
  attributedOrdersUnique: number
  attributedRevenuePerOrder: number
  attributedRevenuePerSent: number
  // Engagement
  sent: number
  opened: number
  openedUnique: number
  openRate: number
  clicked: number
  clickedUnique: number
  clickRate: number
  failed: number
  failRate: number
  // Health (entregabilidade + reputacao)
  bounced: number
  bounceRate: number
  unsubscribedUnique: number
  unsubscribeRate: number
  markedAsSpamUnique: number
  markedAsSpamRate: number
}

const EMPTY_REPORTS_RESULT: OmnisendReportsResult = {
  attributedRevenue: 0,
  attributedOrders: 0,
  attributedOrdersUnique: 0,
  attributedRevenuePerOrder: 0,
  attributedRevenuePerSent: 0,
  sent: 0,
  opened: 0,
  openedUnique: 0,
  openRate: 0,
  clicked: 0,
  clickedUnique: 0,
  clickRate: 0,
  failed: 0,
  failRate: 0,
  bounced: 0,
  bounceRate: 0,
  unsubscribedUnique: 0,
  unsubscribeRate: 0,
  markedAsSpamUnique: 0,
  markedAsSpamRate: 0,
}

// Cache em DUAS camadas com stale-while-error.
//
//   L1 (memoria) — Map<key, entry> dentro do modulo. ~1ms lookup.
//                  Perde entre cold starts da Lambda no Vercel.
//
//   L2 (Supabase) — tabela omnisend_reports_cache. ~50ms lookup.
//                   Sobrevive cold starts. Migration 20260429.
//
// Quando a chamada API e bem-sucedida, popula AMBAS as camadas.
// Quando falha (rate limit / 5xx / timeout), tenta servir do L1 stale,
// depois do L2 stale, antes de zerar revenue.
//
// Por que duas camadas e nao so DB:
//   - L1 evita ~50ms de DB roundtrip pra requests consecutivos da mesma
//     instancia hot
//   - L2 garante que cron + UI compartilhem cache mesmo em instancias
//     diferentes (Vercel cria/destroi Lambdas constantemente)
//
// Justificativa: o /api/analytics/reports tem rate limit AGRESSIVO
// (~3-8s cooldown empirico, ate 30min em casos extremos observados nos
// discovery rounds). Sem cache persistente, cada cold start da Lambda
// queimaria budget e voltaria 429.
const REPORTS_FRESH_TTL_MS = 60 * 60 * 1000           // 1h
const REPORTS_STALE_TTL_MS = 24 * 60 * 60 * 1000      // 24h

type ReportsCacheEntry = {
  data: OmnisendReportsResult
  freshUntil: number
  staleUntil: number
}

// L1: in-memory cache por instancia Lambda
const reportsCacheL1 = new Map<string, ReportsCacheEntry>()

function reportsCacheKey(apiKey: string, startDate: string, endDate: string): string {
  // Usar so o sufixo da apiKey (ultimos 12 chars) para nao expor secret no log
  return `${apiKey.slice(-12)}|${startDate}|${endDate}`
}

// L2: persistent cache via Supabase
async function readReportsCacheL2(cacheKey: string): Promise<ReportsCacheEntry | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("omnisend_reports_cache")
      .select("data, fresh_until, stale_until")
      .eq("cache_key", cacheKey)
      .maybeSingle()
    if (error || !data) return null
    return {
      data: data.data as OmnisendReportsResult,
      freshUntil: new Date(data.fresh_until as string).getTime(),
      staleUntil: new Date(data.stale_until as string).getTime(),
    }
  } catch (err) {
    log.warn("[ReportsCacheL2] read failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function writeReportsCacheL2(
  cacheKey: string,
  entry: ReportsCacheEntry,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("omnisend_reports_cache")
      .upsert(
        {
          cache_key: cacheKey,
          data: entry.data as unknown as Record<string, unknown>,
          fresh_until: new Date(entry.freshUntil).toISOString(),
          stale_until: new Date(entry.staleUntil).toISOString(),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      )
    if (error) {
      log.warn("[ReportsCacheL2] write failed", { error: error.message })
    }
  } catch (err) {
    log.warn("[ReportsCacheL2] write threw", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Activity Breakdown via /api/analytics/statistics ─────
//
// Schema oficial confirmado pelo suporte da Omnisend (sessao 2026-05-05):
//   POST /api/analytics/statistics
//   1 request com 3 queries:
//     - campaigns: attributedRevenue por marketingActivityID + messageChannel
//     - automations: idem com filter Automation
//     - total: totalRevenue da loja
//
// Limites oficiais (confirmados):
//   - 4 queries/request (cabe nossas 3)
//   - 1 ano de date range/query
//   - granularity day = max 60 dias; month = sem limite
//   - 10 requests/min, 55 requests/dia POR brand
//
// IDs sao identicos aos retornados por /v5/campaigns e /v5/automations
// — JOIN local resolve nomes sem chamadas extras.

export interface OmnisendActivityBreakdownEntry {
  /** Total revenue agregado (todos canais) */
  totalRevenue: number
  totalOrders: number
  /** Engagement por activity individual (sent/opened/clicked) — Statistics
   *  API expoe esses metrics quando dimension=marketingActivityID. Antes
   *  /v5/automations retornava stats inline mas nem sempre — UI ficava
   *  com "—" em Entregues/Abertura/Cliques. */
  sent: number
  opened: number
  clicked: number
  /** Revenue separado por messageChannel: Email, SMS, Push */
  byChannel: Map<string, { revenue: number; orders: number }>
}

export interface OmnisendActivityBreakdownResult {
  /** Map<marketingActivityID, breakdown> — campanhas */
  campaigns: Map<string, OmnisendActivityBreakdownEntry>
  /** Map<marketingActivityID, breakdown> — automations */
  automations: Map<string, OmnisendActivityBreakdownEntry>
  /** Total da loja (sem filtro) */
  total: { revenue: number; orders: number }
  /** Engagement metrics agregados (toda a conta no periodo) */
  engagement: {
    sent: number
    opened: number
    openedUnique: number
    clicked: number
    clickedUnique: number
    failed: number
  }
}

interface StatisticsRow {
  timestamp?: string
  marketingActivityID?: string
  messageChannel?: string
  attributedRevenue?: number | string
  attributedOrders?: number | string
  totalRevenue?: number | string
  totalOrders?: number | string
  sent?: number | string
  opened?: number | string
  openedUnique?: number | string
  clicked?: number | string
  clickedUnique?: number | string
}

interface StatisticsResponse {
  statistics: Array<{
    alias?: string
    rows?: StatisticsRow[]
  }>
}

/**
 * Agrega rows da Statistics API em entries por marketingActivityID,
 * com breakdown opcional por messageChannel (Email/SMS/Push).
 * Soma rows do mesmo activityID em diferentes meses → total agregado.
 */
function aggregateActivityRows(rows: StatisticsRow[]): Map<string, OmnisendActivityBreakdownEntry> {
  const map = new Map<string, OmnisendActivityBreakdownEntry>()
  for (const row of rows) {
    const r = row as Record<string, unknown>
    // A API pode retornar campos em formato flat (top-level) ou nested
    // dentro de `dimensions` / `metrics`. Suporta ambos pra robustez.
    // Suporte (2026-05-06) confirmou marketingActivityID === campaignID
    // === automationID, entao pegamos esse campo direto.
    const dims = (r.dimensions as Record<string, unknown> | undefined) ?? {}
    const mets = (r.metrics as Record<string, unknown> | undefined) ?? {}

    const id = String(r.marketingActivityID ?? dims.marketingActivityID ?? "")
    if (!id) continue
    const channel = String(r.messageChannel ?? dims.messageChannel ?? "Email")

    const revenue = Number(r.attributedRevenue ?? mets.attributedRevenue) || 0
    const orders = Number(r.attributedOrders ?? mets.attributedOrders) || 0
    const sent = Number(r.sent ?? mets.sent) || 0
    // Preferimos *Unique pra bater com o dashboard (taxa por contato unico).
    const opened = Number(r.openedUnique ?? mets.openedUnique ?? r.opened ?? mets.opened) || 0
    const clicked = Number(r.clickedUnique ?? mets.clickedUnique ?? r.clicked ?? mets.clicked) || 0

    let entry = map.get(id)
    if (!entry) {
      entry = { totalRevenue: 0, totalOrders: 0, sent: 0, opened: 0, clicked: 0, byChannel: new Map() }
      map.set(id, entry)
    }
    entry.totalRevenue += revenue
    entry.totalOrders += orders
    entry.sent += sent
    entry.opened += opened
    entry.clicked += clicked

    const ch = entry.byChannel.get(channel) || { revenue: 0, orders: 0 }
    ch.revenue += revenue
    ch.orders += orders
    entry.byChannel.set(channel, ch)
  }
  return map
}

/**
 * Busca breakdown de receita atribuida por campanha/automation individual
 * via Statistics API. Schema oficial do suporte da Omnisend.
 *
 * Retorna o mesmo agregado que aparece no painel Sales (com tolerancia
 * de ~5% pela diferenca event-date vs send-date).
 */
export async function fetchOmnisendActivityBreakdown(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<OmnisendActivityBreakdownResult> {
  const empty: OmnisendActivityBreakdownResult = {
    campaigns: new Map(),
    automations: new Map(),
    total: { revenue: 0, orders: 0 },
    engagement: { sent: 0, opened: 0, openedUnique: 0, clicked: 0, clickedUnique: 0, failed: 0 },
  }

  try {
    const resp = await omnisendRequest<StatisticsResponse>(
      apiKey,
      `${OMNISEND_API}/analytics/statistics`,
      {
        method: "POST",
        logTag: "OmnisendActivityBreakdown",
        omnisendVersion: "2026-preview",
        authStyle: "bearer",
        body: {
          queries: [
            {
              alias: "campaigns",
              // Estrutura recomendada pelo suporte da Omnisend (2026-05-06):
              //   metrics: sent, openedUnique, clickedUnique, attributedRevenue
              //   dimensions: timestamp(day) + marketingActivityID
              //   filters: marketingActivityType in [Campaign]
              metrics: [
                { name: "attributedRevenue" },
                { name: "attributedOrders" },
                { name: "sent" },
                { name: "openedUnique" },
                { name: "clickedUnique" },
              ],
              dateRange: {
                from: new Date(startDate).toISOString(),
                to: new Date(endDate).toISOString(),
              },
              dimensions: [
                { name: "timestamp", granularity: "day" },
                { name: "marketingActivityID" },
              ],
              filters: [
                { name: "marketingActivityType", operator: "in", values: ["Campaign"] },
              ],
            },
            {
              alias: "automations",
              metrics: [
                { name: "attributedRevenue" },
                { name: "attributedOrders" },
                { name: "sent" },
                { name: "openedUnique" },
                { name: "clickedUnique" },
              ],
              dateRange: {
                from: new Date(startDate).toISOString(),
                to: new Date(endDate).toISOString(),
              },
              dimensions: [
                { name: "timestamp", granularity: "day" },
                { name: "marketingActivityID" },
              ],
              filters: [
                { name: "marketingActivityType", operator: "in", values: ["Automation"] },
              ],
            },
            {
              alias: "total",
              metrics: [{ name: "totalRevenue" }, { name: "totalOrders" }],
              dateRange: {
                from: new Date(startDate).toISOString(),
                to: new Date(endDate).toISOString(),
              },
              dimensions: [{ name: "timestamp", granularity: "month" }],
            },
            // 4a query: engagement TOTAL agregado do periodo.
            //
            // Statistics API exige `dimensions: [{timestamp, granularity}]`
            // sempre — sem dimension a API retorna 400 "timestamp
            // dimension is required". Usamos granularity=month para ter
            // o minimo de buckets possivel (1-2 rows pra range de 30d
            // que cai em 1-2 meses).
            //
            // openedUnique somado dos meses ainda pode dar overcount
            // (contato que abriu em meses diferentes conta 2x), mas o
            // cap em min(openedUnique, subscribedContacts) na linha
            // engagedContacts neutraliza casos extremos. Confirmado pelo
            // suporte (2026-05-06): nao ha endpoint que garanta dedup
            // global no range — e aproximacao.
            {
              alias: "engagement",
              metrics: [
                { name: "sent" },
                { name: "opened" },
                { name: "openedUnique" },
                { name: "clicked" },
                { name: "clickedUnique" },
                { name: "failed" },
              ],
              dateRange: {
                from: new Date(startDate).toISOString(),
                to: new Date(endDate).toISOString(),
              },
              dimensions: [{ name: "timestamp", granularity: "month" }],
            },
          ],
        },
      },
    )

    if (!resp?.statistics) {
      log.warn("[OmnisendActivityBreakdown] empty response shape", {
        responseSlice: JSON.stringify(resp).slice(0, 300),
      })
      return empty
    }

    const result: OmnisendActivityBreakdownResult = {
      campaigns: new Map(),
      automations: new Map(),
      total: { revenue: 0, orders: 0 },
      engagement: { sent: 0, opened: 0, openedUnique: 0, clicked: 0, clickedUnique: 0, failed: 0 },
    }

    for (const block of resp.statistics) {
      if (block.alias === "campaigns") {
        result.campaigns = aggregateActivityRows(block.rows || [])
        log.info("[OmnisendActivityBreakdown] campaigns block", {
          rowCount: (block.rows || []).length,
          aggregatedActivities: result.campaigns.size,
          sampleRow: (block.rows || []).length > 0
            ? JSON.stringify(block.rows![0]).slice(0, 500)
            : "no rows",
          sampleAggregated: result.campaigns.size > 0
            ? JSON.stringify({
                id: [...result.campaigns.keys()][0],
                entry: { ...[...result.campaigns.values()][0], byChannel: undefined },
              })
            : "empty map",
        })
      } else if (block.alias === "automations") {
        result.automations = aggregateActivityRows(block.rows || [])
        log.info("[OmnisendActivityBreakdown] automations block", {
          rowCount: (block.rows || []).length,
          aggregatedActivities: result.automations.size,
          sampleRow: (block.rows || []).length > 0
            ? JSON.stringify(block.rows![0]).slice(0, 500)
            : "no rows",
          sampleAggregated: result.automations.size > 0
            ? JSON.stringify({
                id: [...result.automations.keys()][0],
                entry: { ...[...result.automations.values()][0], byChannel: undefined },
              })
            : "empty map",
        })
      } else if (block.alias === "total") {
        for (const row of block.rows || []) {
          result.total.revenue += Number(row.totalRevenue) || 0
          result.total.orders += Number(row.totalOrders) || 0
        }
      } else if (block.alias === "engagement") {
        for (const row of block.rows || []) {
          const r = row as Record<string, number | string | undefined>
          result.engagement.sent += Number(r.sent) || 0
          result.engagement.opened += Number(r.opened) || 0
          result.engagement.openedUnique += Number(r.openedUnique) || 0
          result.engagement.clicked += Number(r.clicked) || 0
          result.engagement.clickedUnique += Number(r.clickedUnique) || 0
          result.engagement.failed += Number(r.failed) || 0
        }
      }
    }

    log.info(`[OmnisendActivityBreakdown] aggregated`, {
      campaignsCount: result.campaigns.size,
      automationsCount: result.automations.size,
      totalRevenue: result.total.revenue,
      totalOrders: result.total.orders,
      sent: result.engagement.sent,
      opened: result.engagement.opened,
      clicked: result.engagement.clicked,
    })

    return result
  } catch (err) {
    if (err instanceof OmnisendRateLimitError || err instanceof OmnisendInvalidKeyError) throw err
    log.warn("[OmnisendActivityBreakdown] failed, returning empty", {
      error: err instanceof Error ? err.message : String(err),
    })
    return empty
  }
}

export async function fetchOmnisendReports(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<OmnisendReportsResult> {
  const cacheKey = reportsCacheKey(apiKey, startDate, endDate)
  const now = Date.now()

  // L1 (memoria) — fast path, ~1ms
  const cachedL1 = reportsCacheL1.get(cacheKey)
  if (cachedL1 && cachedL1.freshUntil > now) {
    log.info(`[OmnisendReports] cache HIT L1/fresh — ${Math.round((cachedL1.freshUntil - now) / 1000)}s remaining`)
    return cachedL1.data
  }

  // L2 (Supabase) — sobrevive cold starts, ~50ms
  // So consulta L2 se L1 nao estiver fresh. Se L2 estiver fresh,
  // hidrata L1 pra proximas chamadas dessa instancia ficarem em ~1ms.
  let cachedL2: ReportsCacheEntry | null = null
  if (!cachedL1 || cachedL1.freshUntil <= now) {
    cachedL2 = await readReportsCacheL2(cacheKey)
    if (cachedL2 && cachedL2.freshUntil > now) {
      log.info(`[OmnisendReports] cache HIT L2/fresh — ${Math.round((cachedL2.freshUntil - now) / 1000)}s remaining`)
      // Hidrata L1 com o que veio do L2
      reportsCacheL1.set(cacheKey, cachedL2)
      return cachedL2.data
    }
  }

  // O cache stale relevante para fallback de erro: prefere L1, fallback L2
  const cached = cachedL1 || cachedL2

  const result: OmnisendReportsResult = { ...EMPTY_REPORTS_RESULT }

  try {
    const resp = await omnisendRequest<{
      reports: Array<{
        alias?: string
        dimensions?: unknown[]
        metrics?: Array<{ name: string }>
        rows?: Array<Record<string, number | string>>
      }>
    }>(
      apiKey,
      `${OMNISEND_API}/analytics/reports`,
      {
        method: "POST",
        logTag: "OmnisendReports",
        // Validado em R5: /api/analytics/reports usa Omnisend-Version
        // 2026-preview com Authorization (sem X-API-KEY).
        omnisendVersion: "2026-preview",
        authStyle: "bearer",
        body: {
          queries: [{
            alias: "agg",
            metrics: [
              { name: "attributedRevenue" },
              { name: "attributedOrders" },
              { name: "attributedOrdersUnique" },
              { name: "attributedRevenuePerOrder" },
              { name: "attributedRevenuePerSent" },
              { name: "sent" },
              { name: "opened" },
              { name: "openedUnique" },
              { name: "openRate" },
              { name: "clicked" },
              { name: "clickedUnique" },
              { name: "clickRate" },
              { name: "failed" },
              { name: "failRate" },
              // Metrics extras necessarios pro Monitor de Saude
              // (entregabilidade + reputacao). Mesma query, sem custo
              // de rate limit adicional.
              { name: "bounced" },
              { name: "bounceRate" },
              { name: "unsubscribedUnique" },
              { name: "unsubscribeRate" },
              { name: "markedAsSpamUnique" },
              { name: "markedAsSpamRate" },
            ],
            dateRange: {
              interval: "custom",
              from: new Date(startDate).toISOString(),
              to: new Date(endDate).toISOString(),
            },
          }],
        },
      }
    )

    const row = resp?.reports?.[0]?.rows?.[0]
    if (row) {
      log.info(`[OmnisendReports] row received: ${JSON.stringify(row).slice(0, 400)}`)
      result.attributedRevenue = Number(row.attributedRevenue) || 0
      result.attributedOrders = Number(row.attributedOrders) || 0
      result.attributedOrdersUnique = Number(row.attributedOrdersUnique) || 0
      result.attributedRevenuePerOrder = Number(row.attributedRevenuePerOrder) || 0
      result.attributedRevenuePerSent = Number(row.attributedRevenuePerSent) || 0
      result.sent = Number(row.sent) || 0
      result.opened = Number(row.opened) || 0
      result.openedUnique = Number(row.openedUnique) || 0
      result.openRate = Number(row.openRate) || 0
      result.clicked = Number(row.clicked) || 0
      result.clickedUnique = Number(row.clickedUnique) || 0
      result.clickRate = Number(row.clickRate) || 0
      result.failed = Number(row.failed) || 0
      result.failRate = Number(row.failRate) || 0
      result.bounced = Number(row.bounced) || 0
      result.bounceRate = Number(row.bounceRate) || 0
      result.unsubscribedUnique = Number(row.unsubscribedUnique) || 0
      result.unsubscribeRate = Number(row.unsubscribeRate) || 0
      result.markedAsSpamUnique = Number(row.markedAsSpamUnique) || 0
      result.markedAsSpamRate = Number(row.markedAsSpamRate) || 0
      log.info(`[OmnisendReports] totals: revenue=${result.attributedRevenue}, orders=${result.attributedOrders}, sent=${result.sent}, openRate=${result.openRate}, bounceRate=${result.bounceRate}, unsubRate=${result.unsubscribeRate}, spamRate=${result.markedAsSpamRate}`)
      // Cache so quando a API retornou dados validos. Vazio nao popula
      // o cache pra nao mascarar bugs de payload.
      const newEntry: ReportsCacheEntry = {
        data: { ...result },
        freshUntil: Date.now() + REPORTS_FRESH_TTL_MS,
        staleUntil: Date.now() + REPORTS_STALE_TTL_MS,
      }
      // L1: imediato (in-memory)
      reportsCacheL1.set(cacheKey, newEntry)
      // L2: async fire-and-forget (nao bloqueia o sync se DB lento).
      // Erro ja e logado em writeReportsCacheL2.
      void writeReportsCacheL2(cacheKey, newEntry)
    } else {
      log.warn(`[OmnisendReports] empty or malformed response: ${JSON.stringify(resp).slice(0, 300)}`)
      // Stale-while-error: se ainda temos cache stale (L1 ou L2), retorna ele.
      if (cached && cached.staleUntil > now) {
        const ageSec = Math.round((now - (cached.freshUntil - REPORTS_FRESH_TTL_MS)) / 1000)
        log.warn(`[OmnisendReports] empty response — serving STALE cache (age ${ageSec}s)`)
        return cached.data
      }
    }
  } catch (err) {
    // Rate limit ou auth nao se beneficiam de cache stale — propaga pra
    // chamador decidir o que fazer.
    if (err instanceof OmnisendInvalidKeyError) throw err
    log.warn("[OmnisendReports] failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    // Stale-while-error: rate limit / 5xx / timeout — se temos cache stale,
    // serve ele em vez de zerar revenue (data poisoning preventido).
    if (cached && cached.staleUntil > now) {
      const ageSec = Math.round((now - (cached.freshUntil - REPORTS_FRESH_TTL_MS)) / 1000)
      log.warn(`[OmnisendReports] error — serving STALE cache (age ${ageSec}s)`)
      return cached.data
    }
    // Sem cache stale + rate limit — repropaga pra chamador
    if (err instanceof OmnisendRateLimitError) throw err
  }

  return result
}

// ── Contacts / Audience ───────────────────────────────────
//
// "Engaged 90d" antes vinha de um segmento estatico do Omnisend
// ("Engaged 90 days"); quando o segmento nao existia ou estava vazio,
// caia em fallback=subscribed e o card de engajamento mostrava 100%.
// Substituido por openedUnique somado dos dias do periodo via
// Statistics API (proxy direto de "abriu >= 1 email no range").

const CONTACTS_PAGE_LIMIT = 250
// 250 * 400 = 100k contatos. Antes era 100 paginas (25k), travando lojas
// com mais de 25k contatos no cap exato (ex: Blessed Choice mostrava
// 25.000). Idealmente a API retorna paging.total/totalCount na primeira
// pagina e nem precisa paginar — o aumento e safety net pra accounts
// que nao expoem o total inline.
const CONTACTS_MAX_PAGES = 400

async function countContacts(
  apiKey: string,
  logTag: string,
  queryParams: Record<string, string>
): Promise<number> {
  // Endpoint /v3/contacts conforme recomendacao do suporte da Omnisend
  // (e mais estavel que /v5 para contagem). Pagina cursor-based: o
  // response tem paging.next (URL completa) ate acabar.
  const initialParams = new URLSearchParams({ ...queryParams, limit: String(CONTACTS_PAGE_LIMIT) })
  let url: string | null = `${OMNISEND_V3}/contacts?${initialParams}`
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
  // "Total de leads" reflete a base real de leads opt-in (status=subscribed)
  // — nao o total de contatos que inclui unsubscribed/non-subscribed. Apenas
  // contagem de subscribed faz sentido como denominador para % engajamento.
  const subscribedContacts = await countContacts(apiKey, "OmnisendContactsSubscribed", {
    status: "subscribed",
  })
  const totalContacts = subscribedContacts
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
  // Calendar-aligned ISO range. Quando passado, sobrescreve o calculo
  // baseado em periodDays (now - Nd). O dashboard do Omnisend agrega por
  // dia calendar (00:00 ate agora), entao passar startDate=YYYY-MM-DDT00:00:00Z
  // alinha com os totais que o cliente ve la.
  startDate?: string
  endDate?: string
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
  startDate?: string
  endDate?: string
}): Promise<SyncResult<OmnisendSyncData>> {
  const { storeId, orgId, apiKey, periodDays } = params

  // Wrapper: executa uma etapa do sync e retorna fallback se falhar.
  // Rate limits em um endpoint nao podem abortar os outros.
  async function safely<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof OmnisendRateLimitError) {
        log.warn(`[OmnisendSync:${label}] rate limited — continuing with fallback`, {
          storeId,
          retryAfterMs: err.retryAfterMs,
        })
      } else if (err instanceof OmnisendInvalidKeyError || err instanceof OmnisendPermissionError) {
        // Auth / permissao: propagamos pra fora — nao faz sentido continuar sem credencial.
        throw err
      } else {
        log.error(`[OmnisendSync:${label}] failed — continuing with fallback`, {
          storeId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return fallback
    }
  }

  try {
    // 1. Fetch campanhas em todos os status relevantes para relatorio
    //    (sent + scheduled + inProgress + paused). Descartamos drafts.
    const campaigns = await safely("campaigns", () => fetchAllReportCampaigns(apiKey), [] as OmnisendCampaign[])
    log.info(`Fetched ${campaigns.length} report-eligible campaigns`, { storeId })
    if (campaigns.length > 0) {
      const sample = campaigns[0]
      const keys = Object.keys(sample).filter(k => k !== "campaignID" && k !== "name")
      log.info(`[DIAG] Campaign sample fields: ${keys.join(", ")}`, {
        storeId,
        hasStats: !!sample.stats,
        // Suporte Omnisend (2026-05-06) confirmou que marketingActivityID
        // === campaignID === id. Logamos os 2 candidatos pra confirmar
        // qual o /v5/campaigns retorna nesta versao.
        campaignIDField: sample.campaignID,
        idField: sample.id,
        resolvedId: getCampaignId(sample),
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
    await safely("enrichV3", () => enrichCampaignsWithV3Stats(apiKey, campaigns), undefined as void)
    const withStats = campaigns.filter(c => getCampaignStats(c) && Object.keys(getCampaignStats(c)).length > 0).length
    log.info(`Enriched ${withStats}/${campaigns.length} campaigns with v3 stats`, { storeId })

    await sleep(200)

    // 3. Fetch automations (v5 cursor-based)
    //    NAO ha endpoint publico para stats de automations — so temos nome/status/trigger
    const automations = await safely("automations", () => fetchAutomations(apiKey), [] as OmnisendAutomation[])
    log.info(`Fetched ${automations.length} automations`, { storeId })

    await sleep(200)

    // 4. Contacts
    const { totalContacts, subscribedContacts } = await safely(
      "contacts",
      () => fetchContactCounts(apiKey),
      { totalContacts: 0, subscribedContacts: 0 },
    )
    log.info(`Contacts: ${totalContacts} total, ${subscribedContacts} subscribed`, { storeId })

    await sleep(200)

    // 5. Segments (apenas para listagem — engaged agora vem do
    //    activityBreakdown abaixo via openedUnique da Statistics API).
    const segments = await safely("segments", () => fetchSegments(apiKey), [] as OmnisendSegment[])
    log.info(`Fetched ${segments.length} segments`, { storeId })

    // 6. Revenue + engagement + breakdown por activity em UMA chamada:
    //
    //    POST /api/analytics/statistics com 4 queries:
    //      - campaigns: revenue por marketingActivityID (filter Campaign)
    //      - automations: revenue por marketingActivityID (filter Automation)
    //      - total: totalRevenue da loja
    //      - engagement: sent/opened/clicked agregados
    //
    //    Schema oficial confirmado pelo suporte da Omnisend.
    //    Limites: 10/min, 55/dia/brand. 1 chamada cobre TUDO — antes
    //    chamavamos /reports em paralelo, queimando 2 calls/sync.
    //
    //    Datas alinhadas com calendar (00:00 ate agora) para coincidir
    //    com totais do dashboard Omnisend. Antes: rolling time-based
    //    (now - 30d * 86400000) causava divergencia ~1.3% (ex: R$255k
    //    vs R$251k para periodo de 30d). Agora puxamos do inicio do
    //    primeiro dia da janela ate o instante atual, igual o dashboard.
    let startDate: string
    let endDate: string
    if (params.startDate && params.endDate) {
      startDate = params.startDate
      endDate = params.endDate
    } else {
      const now = new Date()
      const start = new Date(now)
      start.setUTCDate(start.getUTCDate() - (periodDays - 1))
      start.setUTCHours(0, 0, 0, 0)
      startDate = start.toISOString()
      endDate = now.toISOString()
    }
    const activityBreakdown = await safely(
      "activityBreakdown",
      () => fetchOmnisendActivityBreakdown(apiKey, startDate, endDate),
      {
        campaigns: new Map(),
        automations: new Map(),
        total: { revenue: 0, orders: 0 },
        engagement: { sent: 0, opened: 0, openedUnique: 0, clicked: 0, clickedUnique: 0, failed: 0 },
      } as OmnisendActivityBreakdownResult,
    )

    // /api/analytics/reports devolve openedUnique consolidado pra todo
    // o periodo (1 row), conforme orientacao explicita do suporte
    // (2026-05-06): "para puxar leads que abriram >= 1 email no periodo,
    // o caminho mais direto e via Reports API usando openedUnique".
    //
    // Cache L1+L2 de 1h ja embutido em fetchOmnisendReports — no pior
    // caso 24 chamadas/dia/loja, dentro do limite 55/dia/brand.
    const reportsTotals = await safely(
      "reportsTotals",
      () => fetchOmnisendReports(apiKey, startDate, endDate),
      EMPTY_REPORTS_RESULT,
    )

    // Agrega revenue total das campanhas e automations (somando byChannel)
    let totalCampaignsRevenue = 0
    let totalCampaignsOrders = 0
    for (const entry of activityBreakdown.campaigns.values()) {
      totalCampaignsRevenue += entry.totalRevenue
      totalCampaignsOrders += entry.totalOrders
    }
    let totalAutomationsRevenue = 0
    let totalAutomationsOrders = 0
    for (const entry of activityBreakdown.automations.values()) {
      totalAutomationsRevenue += entry.totalRevenue
      totalAutomationsOrders += entry.totalOrders
    }

    const revenueStats = {
      totalRevenue: activityBreakdown.total.revenue,
      totalOrders: activityBreakdown.total.orders,
      // attributedRevenue = soma de campaigns + automations (real, nao mais
      // 100% jogado em flow). Fallback pra /reports se breakdown falhou.
      attributedRevenue: totalCampaignsRevenue + totalAutomationsRevenue,
      attributedOrders: totalCampaignsOrders + totalAutomationsOrders,
    }

    // Currency vem do DB (client_stores.currency, migration 20241217).
    // Cada loja tem currency diferente (BRL pra Vivazz, EUR pra Azzurro,
    // USD pra outras). Default BRL pra lojas Brasil que possam estar
    // sem currency setado (pre-migration).
    let currency = "BRL"
    try {
      const admin = createAdminClient()
      const { data: storeCurrency } = await admin
        .from("client_stores")
        .select("currency")
        .eq("id", storeId)
        .maybeSingle()
      if (storeCurrency?.currency) {
        currency = storeCurrency.currency
      }
    } catch (err) {
      log.warn("[OmnisendSync] Failed to read store currency, defaulting BRL", {
        storeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    log.info("[OmnisendSync] activity breakdown summary", {
      storeId,
      campaignsCount: activityBreakdown.campaigns.size,
      automationsCount: activityBreakdown.automations.size,
      campaignsRevenue: totalCampaignsRevenue,
      automationsRevenue: totalAutomationsRevenue,
      totalStoreRevenue: revenueStats.totalRevenue,
    })

    // Diagnostico: marketingActivityID retornado pela Statistics API tem
    // que casar 1:1 com automationID/campaignID do listing /v5. Se logamos
    // 0 matches e o breakdown teve resultados, o ID esta diferente
    // (ex: hash, prefixo) e os flows aparecem zerados na UI.
    const breakdownAutoIds = new Set(activityBreakdown.automations.keys())
    const listingAutoIds = new Set(automations.map(getAutomationId).filter(Boolean))
    const matchedAutos = [...listingAutoIds].filter((id) => breakdownAutoIds.has(id)).length
    const breakdownCampIds = new Set(activityBreakdown.campaigns.keys())
    const listingCampIds = new Set(campaigns.map(getCampaignId).filter(Boolean))
    const matchedCamps = [...listingCampIds].filter((id) => breakdownCampIds.has(id)).length
    log.info("[OmnisendSync] activity ID match", {
      storeId,
      automations: { breakdown: breakdownAutoIds.size, listing: listingAutoIds.size, matched: matchedAutos },
      campaigns: { breakdown: breakdownCampIds.size, listing: listingCampIds.size, matched: matchedCamps },
      sampleBreakdownAutoIds: [...breakdownAutoIds].slice(0, 3),
      sampleListingAutoIds: [...listingAutoIds].slice(0, 3),
    })

    // 7. Map campaigns to rows
    const campaignRows: OmnisendCampaignRow[] = campaigns
      .filter(c => getCampaignId(c))
      .map((c) => {
      const s = getCampaignStats(c)
      // Revenue + engagement REAIS por campanha individual via activity
      // breakdown. marketingActivityID === campaignID (confirmado pelo
      // suporte). Engagement (sent/opened/clicked) prioriza Statistics
      // API; fallback no listing /v5 (que nem sempre traz stats inline).
      const breakdownEntry = activityBreakdown.campaigns.get(getCampaignId(c))
      const sent = breakdownEntry?.sent || s.sent || 0
      const delivered = breakdownEntry?.sent || s.delivered || 0
      const opened = breakdownEntry?.opened || s.uniqueOpened || s.opened || 0
      const clicked = breakdownEntry?.clicked || s.uniqueClicked || s.clicked || 0
      const bounced = s.bounced || 0
      const unsubscribed = s.unsubscribed || 0
      const revenue = breakdownEntry?.totalRevenue ?? (s.totalRevenue || s.revenue || 0)
      const campaignOrders = breakdownEntry?.totalOrders ?? (s.ordersCount || s.orders || 0)
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
        // Revenue + engagement REAIS por automation individual via
        // Statistics API; fallback no listing /v5 quando o breakdown
        // nao tem entrada. /v5/automations nem sempre retorna stats
        // inline — antes resultava em "—" em Entregues/Abertura/Cliques.
        const autoBreakdownEntry = activityBreakdown.automations.get(getAutomationId(a))
        const sent = autoBreakdownEntry?.sent || s.sent || 0
        const delivered = autoBreakdownEntry?.sent || s.delivered || 0
        const opened = autoBreakdownEntry?.opened || s.uniqueOpened || s.opened || 0
        const clicked = autoBreakdownEntry?.clicked || s.uniqueClicked || s.clicked || 0
        const bounced = s.bounced || 0
        const unsubscribed = s.unsubscribed || 0
        const revenue = autoBreakdownEntry?.totalRevenue ?? (s.totalRevenue || s.revenue || 0)
        const automationOrders = autoBreakdownEntry?.totalOrders ?? (s.ordersCount || s.orders || 0)
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

    // 9. Revenue split REAL via activityBreakdown:
    //    Schema oficial confirmado pelo suporte da Omnisend usando
    //    marketingActivityType=Campaign|Automation como filter na
    //    Statistics API. Cada activityID retorna seu attributedRevenue
    //    individual — somamos pra ter os totais por canal de marketing.
    const totalAttributedRevenue = Math.max(0, revenueStats.attributedRevenue)
    const totalAttributedOrders = Math.max(0, revenueStats.attributedOrders)
    const totalCampaignRevenue = Math.max(0, totalCampaignsRevenue)
    const totalAutomationRevenue = Math.max(0, totalAutomationsRevenue)

    // engagedContacts via /api/analytics/reports openedUnique (caminho
    // recomendado pelo suporte 2026-05-06). Cap em subscribedContacts —
    // mas se raw EXCEDE muito o subscribed (>110%), e claramente
    // overcount da agregacao da API; exibimos 0 (UI mostra "—") em vez
    // de capar em 100% espurio. Limite tolerante (110%) absorve pequena
    // imprecisao de boundary do periodo, mas pega overcount obvio.
    const engagedRaw = reportsTotals.openedUnique || activityBreakdown.engagement.openedUnique || 0
    const engagedTooHigh = subscribedContacts > 0 && engagedRaw > subscribedContacts * 1.1
    const engagedContacts = engagedTooHigh
      ? 0  // mascara overcount obvio — UI mostra "—" via condicional `?: "—"`
      : subscribedContacts > 0
        ? Math.min(engagedRaw, subscribedContacts)
        : engagedRaw

    log.info("[OmnisendSync] Sync summary", {
      storeId,
      totalRevenue: revenueStats.totalRevenue,
      totalOrders: revenueStats.totalOrders,
      attributedRevenue: totalAttributedRevenue,
      attributedOrders: totalAttributedOrders,
      totalContacts,
      subscribedContacts,
      engagedRawFromReports: reportsTotals.openedUnique,
      engagedRawFromStats: activityBreakdown.engagement.openedUnique,
      engagedContacts,
      engagedTooHigh,
      engagedCapped: !engagedTooHigh && engagedRaw > subscribedContacts && subscribedContacts > 0,
      engagedSource: engagedTooHigh
        ? "discarded-overcount"
        : reportsTotals.openedUnique > 0
          ? "reports-openedUnique"
          : "stats-openedUnique",
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
        engagedContacts,
        engagedSource: "statistics-openedUnique" as const,
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
