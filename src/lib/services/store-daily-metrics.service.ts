/**
 * Store Daily Metrics Service
 *
 * Popula e lê `store_daily_metrics` — série temporal diária de métricas de
 * email por loja. Substitui os gráficos placeholder (arrays de zeros) do
 * dashboard por tendência real.
 *
 * Preenchimento:
 *   - backfillStoreDailyMetrics: histórico via send_time das campanhas já
 *     persistidas (klaviyo/omnisend_campaign_metrics). Dado real existente.
 *   - snapshotStoreDailyMetrics: chamado pelo cron diário para o dia anterior
 *     (campanhas enviadas + receita corrente da loja via janela '1d').
 *
 * Leitura:
 *   - getEmailDailySeries: agrega por dia (soma das lojas do org) no intervalo.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const CAMPAIGN_COLS =
  "store_id, campaign_id, org_id, recipients, delivered, opened, clicked, conversions, conversion_value, bounced, unsubscribed, send_time, fetched_at"

interface CampaignMetricRow {
  store_id: string
  campaign_id: string
  org_id: string
  recipients: number | null
  delivered: number | null
  opened: number | null
  clicked: number | null
  conversions: number | null
  conversion_value: number | null
  bounced: number | null
  unsubscribed: number | null
  send_time: string | null
  fetched_at: string | null
}

interface DailyAgg {
  store_id: string
  org_id: string
  metric_date: string
  source: "klaviyo" | "omnisend"
  recipients: number
  delivered: number
  opened: number
  clicked: number
  conversions: number
  conversion_value: number
  bounced: number
  unsubscribed: number
}

/** YYYY-MM-DD (UTC) a partir de um timestamp ISO. */
function toDateUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/** Dedup por (store_id, campaign_id) mantendo o sync mais recente. */
function dedupCampaigns(rows: CampaignMetricRow[]): CampaignMetricRow[] {
  const seen = new Map<string, CampaignMetricRow>()
  for (const r of rows) {
    const key = `${r.store_id}|${r.campaign_id}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, r)
      continue
    }
    const a = new Date(r.fetched_at ?? 0).getTime()
    const b = new Date(existing.fetched_at ?? 0).getTime()
    if (a > b) seen.set(key, r)
  }
  return [...seen.values()]
}

/** Agrega campanhas deduplicadas em buckets (store_id, dia, source). */
function aggregateByDay(
  rows: CampaignMetricRow[],
  source: "klaviyo" | "omnisend",
): Map<string, DailyAgg> {
  const buckets = new Map<string, DailyAgg>()
  for (const r of dedupCampaigns(rows)) {
    if (!r.send_time) continue // sem data de envio → não entra na série
    const metric_date = toDateUTC(r.send_time)
    const key = `${r.store_id}|${metric_date}|${source}`
    const b = buckets.get(key) ?? {
      store_id: r.store_id,
      org_id: r.org_id,
      metric_date,
      source,
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      conversions: 0,
      conversion_value: 0,
      bounced: 0,
      unsubscribed: 0,
    }
    b.recipients += Number(r.recipients) || 0
    b.delivered += Number(r.delivered) || 0
    b.opened += Number(r.opened) || 0
    b.clicked += Number(r.clicked) || 0
    b.conversions += Number(r.conversions) || 0
    b.conversion_value += Number(r.conversion_value) || 0
    b.bounced += Number(r.bounced) || 0
    b.unsubscribed += Number(r.unsubscribed) || 0
    buckets.set(key, b)
  }
  return buckets
}

async function fetchCampaigns(
  admin: SupabaseClient,
  table: "klaviyo_campaign_metrics" | "omnisend_campaign_metrics",
  sinceISO: string,
  untilISO?: string,
): Promise<CampaignMetricRow[]> {
  // Um único period_label ('90d') evita contar a mesma campanha em várias
  // janelas. O recorte real é feito por send_time.
  let q = admin
    .from(table)
    .select(CAMPAIGN_COLS)
    .eq("period_label", "90d")
    .gte("send_time", sinceISO)
  if (untilISO) q = q.lt("send_time", untilISO)
  const { data, error } = await q.returns<CampaignMetricRow[]>()
  if (error) {
    // Omnisend pode não existir se a migration não foi aplicada.
    if (/omnisend|does not exist|relation/i.test(error.message || "")) return []
    throw error
  }
  return data ?? []
}

/** Mapa store_id → currency (default BRL). */
async function fetchCurrencyMap(
  admin: SupabaseClient,
  storeIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (storeIds.length === 0) return map
  const { data } = await admin
    .from("client_stores")
    .select("id, currency")
    .in("id", storeIds)
  for (const s of data ?? []) {
    map.set(s.id as string, (s.currency as string) || "BRL")
  }
  return map
}

async function upsertDaily(
  admin: SupabaseClient,
  aggs: DailyAgg[],
  currencyMap: Map<string, string>,
): Promise<number> {
  if (aggs.length === 0) return 0
  const rows = aggs.map((a) => ({
    store_id: a.store_id,
    metric_date: a.metric_date,
    source: a.source,
    org_id: a.org_id,
    recipients: a.recipients,
    delivered: a.delivered,
    opened: a.opened,
    clicked: a.clicked,
    conversions: a.conversions,
    conversion_value: a.conversion_value,
    bounced: a.bounced,
    unsubscribed: a.unsubscribed,
    currency: currencyMap.get(a.store_id) || "BRL",
    updated_at: new Date().toISOString(),
  }))
  // Upsert em lotes de 500 pra evitar payloads gigantes.
  let written = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await admin
      .from("store_daily_metrics")
      .upsert(batch, { onConflict: "store_id,metric_date,source" })
    if (error) throw error
    written += batch.length
  }
  return written
}

/**
 * Backfill do histórico de métricas diárias a partir de send_time das
 * campanhas já persistidas. Idempotente (upsert). Retorna nº de linhas.
 */
export async function backfillStoreDailyMetrics(
  admin: SupabaseClient,
  opts: { daysBack?: number } = {},
): Promise<{ rowsWritten: number; days: number }> {
  const daysBack = opts.daysBack ?? 120
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

  const [klav, omni] = await Promise.all([
    fetchCampaigns(admin, "klaviyo_campaign_metrics", since),
    fetchCampaigns(admin, "omnisend_campaign_metrics", since),
  ])

  const aggs = [
    ...aggregateByDay(klav, "klaviyo").values(),
    ...aggregateByDay(omni, "omnisend").values(),
  ]
  const storeIds = [...new Set(aggs.map((a) => a.store_id))]
  const currencyMap = await fetchCurrencyMap(admin, storeIds)
  const rowsWritten = await upsertDaily(admin, aggs, currencyMap)
  return { rowsWritten, days: daysBack }
}

/**
 * Snapshot do dia anterior (chamado pelo cron). Cobre campanhas enviadas
 * ontem. Idempotente.
 */
export async function snapshotStoreDailyMetrics(
  admin: SupabaseClient,
): Promise<{ rowsWritten: number }> {
  const now = new Date()
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000)

  const sinceISO = startOfYesterday.toISOString()
  const untilISO = startOfToday.toISOString()

  const [klav, omni] = await Promise.all([
    fetchCampaigns(admin, "klaviyo_campaign_metrics", sinceISO, untilISO),
    fetchCampaigns(admin, "omnisend_campaign_metrics", sinceISO, untilISO),
  ])

  const aggs = [
    ...aggregateByDay(klav, "klaviyo").values(),
    ...aggregateByDay(omni, "omnisend").values(),
  ]
  const storeIds = [...new Set(aggs.map((a) => a.store_id))]
  const currencyMap = await fetchCurrencyMap(admin, storeIds)
  const rowsWritten = await upsertDaily(admin, aggs, currencyMap)
  return { rowsWritten }
}

export interface EmailDailyPoint {
  date: string
  recipients: number
  delivered: number
  opened: number
  clicked: number
  conversions: number
  conversion_value: number
  bounced: number
  unsubscribed: number
  openRate: number
  clickRate: number
  ctor: number
  placedOrderRate: number
}

/**
 * Série diária agregada (soma das lojas do org) no intervalo [fromDate, toDate].
 * Retorna 1 ponto por dia com dados, ordenado asc. Vazio quando não há coleta
 * — o front mostra estado "coletando dados" em vez de zeros.
 */
export async function getEmailDailySeries(
  admin: SupabaseClient,
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<EmailDailyPoint[]> {
  const { data, error } = await admin
    .from("store_daily_metrics")
    .select("metric_date, recipients, delivered, opened, clicked, conversions, conversion_value, bounced, unsubscribed")
    .eq("org_id", orgId)
    .gte("metric_date", fromDate)
    .lte("metric_date", toDate)
  if (error) throw error

  const byDate = new Map<string, EmailDailyPoint>()
  for (const r of data ?? []) {
    const date = String(r.metric_date)
    const p = byDate.get(date) ?? {
      date,
      recipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      conversions: 0,
      conversion_value: 0,
      bounced: 0,
      unsubscribed: 0,
      openRate: 0,
      clickRate: 0,
      ctor: 0,
      placedOrderRate: 0,
    }
    p.recipients += Number(r.recipients) || 0
    p.delivered += Number(r.delivered) || 0
    p.opened += Number(r.opened) || 0
    p.clicked += Number(r.clicked) || 0
    p.conversions += Number(r.conversions) || 0
    p.conversion_value += Number(r.conversion_value) || 0
    p.bounced += Number(r.bounced) || 0
    p.unsubscribed += Number(r.unsubscribed) || 0
    byDate.set(date, p)
  }

  return [...byDate.values()]
    .map((p) => ({
      ...p,
      openRate: p.delivered > 0 ? Math.round((p.opened / p.delivered) * 1000) / 10 : 0,
      clickRate: p.delivered > 0 ? Math.round((p.clicked / p.delivered) * 1000) / 10 : 0,
      ctor: p.opened > 0 ? Math.round((p.clicked / p.opened) * 1000) / 10 : 0,
      placedOrderRate: p.delivered > 0 ? Math.round((p.conversions / p.delivered) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
