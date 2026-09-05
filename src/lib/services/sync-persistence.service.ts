/**
 * Sync Persistence Service
 *
 * Shared logic for upserting Klaviyo sync results to cache tables.
 * Used by both admin total-revenue and portal dashboard endpoints.
 *
 * Epic 10 - QA Finding F5
 */

import { SupabaseClient } from "@supabase/supabase-js"
import type { KlaviyoSyncData, CampaignMetricRow, AudienceItem } from "./klaviyo-sync.service"
import type { KlaviyoPerformanceData, KlaviyoCampaignItem } from "./klaviyo-performance.service"
import type { OmnisendSyncData } from "./omnisend-sync.service"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

const PERIOD_DAYS: Record<string, number> = {
  today: 1, yesterday: 1, "7d": 7, "15d": 15, "30d": 30, "90d": 90,
}

const log = logger.child("SyncPersistence")

// ─── Clamp helpers ────────────────────────────────────────────
// Colunas NUMERIC(p,s) explodem com "numeric field overflow" se o valor
// passar do max. Edge cases comuns: API retorna Infinity quando
// delivered=0 + opened>0, ou rates > 100% por bugs upstream. Clampar
// antes de persistir mantem o sync estavel.

function clampRate(v: number | null | undefined): number | null {
  // NUMERIC(5,2) = max 999.99
  if (v == null || !isFinite(v)) return 0
  return Math.max(0, Math.min(999.99, Number(v)))
}

function clampMoney10(v: number | null | undefined): number | null {
  // NUMERIC(10,2) = max 99_999_999.99
  if (v == null || !isFinite(v)) return 0
  return Math.max(0, Math.min(99_999_999.99, Number(v)))
}

function clampMoney12(v: number | null | undefined): number | null {
  // NUMERIC(12,2) = max 9_999_999_999.99
  if (v == null || !isFinite(v)) return 0
  return Math.max(0, Math.min(9_999_999_999.99, Number(v)))
}

/**
 * Normaliza period_label para o que a constraint `valid_period_label`
 * aceita em store_revenue_summary, omnisend_campaign_metrics e
 * omnisend_flow_metrics.
 *
 * Constraint atual (migration 20260318_report_generation_cache):
 *   period_label IN ('7d', '15d', '30d', '90d', '1d', '12m')
 *   OR period_label LIKE 'custom:%'
 *
 * Mapeamentos:
 *   "today" / "yesterday"  → "1d"   (janela de 1 dia, mesmo bucket)
 *   "1y"                   → "12m"  (alias da UI)
 *   demais                 → passa direto
 *
 * USAR em TODOS os lugares que lerem/escreverem period_label, senao
 * write em "1d" + read em "today" da cache miss permanente.
 */
export function normalizePeriodLabel(
  period: string,
  customStart?: string | null,
  customEnd?: string | null,
): string {
  if (period === "today" || period === "yesterday") return "1d"
  if (period === "1y") return "12m"
  if (period === "custom") {
    if (customStart && customEnd) {
      // Normaliza para YYYY-MM-DD (descarta timezone e horario do ISO).
      // Constraint do DB exige `custom:%` — precisa de algo apos os ":".
      const startISO = customStart.slice(0, 10)
      const endISO = customEnd.slice(0, 10)
      return `custom:${startISO}:${endISO}`
    }
    // Defensivo: "custom" sem datas viola constraint. Fallback pra 30d
    // pra nao quebrar o sync.
    return "30d"
  }
  return period
}

interface StoreInfo {
  id: string
  org_id?: string | null | undefined
}

/**
 * Upserts flow metrics, campaign metrics, and revenue summary
 * from a KlaviyoSyncData result into the corresponding cache tables.
 */
export async function upsertSyncResults(
  supabase: SupabaseClient,
  store: StoreInfo,
  data: KlaviyoSyncData,
  period: string,
  audience?: { totalLeads: number; engagedLeads: number; engagementRate: number },
): Promise<void> {
  // Atomic write: UPSERT first, then CLEANUP stale rows by fetched_at.
  // This eliminates the race condition where DELETE+UPSERT could show 0 rows
  // to the portal between the two operations. (Story 54.3)
  const syncTimestamp = new Date().toISOString()
  const metricsExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48h TTL (Story 54.9)

  // Normaliza period_label para o que `valid_period_label` aceita.
  // Aliases da UI ("today", "yesterday", "1y", "custom" puro) violam
  // a constraint e quebram TODO o upsert silenciosamente — bug confirmado
  // em producao em 29/04 (Omnisend). Mesmo padrao aqui pra Klaviyo.
  // data.startDateStr/endDateStr ja vem ISO, normalizePeriodLabel
  // truncar pra YYYY-MM-DD internamente.
  const normalizedPeriod = normalizePeriodLabel(period, data.startDateStr, data.endDateStr)
  if (normalizedPeriod !== period) {
    log.info(`[SyncPersistence] period_label normalizado`, {
      store_id: store.id,
      input: period,
      normalized: normalizedPeriod,
    })
  }

  if (data.flowRows.length > 0) {
    const { error: flowErr } = await supabase
      .from("klaviyo_flow_metrics")
      .upsert(
        data.flowRows.map(r => ({ ...r, period_label: normalizedPeriod, fetched_at: syncTimestamp, expires_at: metricsExpiresAt })),
        { onConflict: "store_id,flow_id,period_start,period_end" },
      )
    if (flowErr) {
      log.warn(`[SyncPersistence] Failed to upsert flow metrics for ${store.id}/${normalizedPeriod}:`, flowErr.message)
    } else {
      // Cleanup: remove rows not touched by this sync (stale/removed flows)
      await supabase
        .from("klaviyo_flow_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", normalizedPeriod)
        .lt("fetched_at", syncTimestamp)
    }
  }

  if (data.campRows.length > 0) {
    const { error: campErr } = await supabase
      .from("klaviyo_campaign_metrics")
      .upsert(
        data.campRows.map(r => ({ ...r, period_label: normalizedPeriod, fetched_at: syncTimestamp, expires_at: metricsExpiresAt })),
        { onConflict: "store_id,campaign_id,period_start,period_end" },
      )
    if (campErr) {
      log.warn(`[SyncPersistence] Failed to upsert campaign metrics for ${store.id}/${normalizedPeriod}:`, campErr.message)
    } else {
      // Cleanup: remove rows not touched by this sync (stale/removed campaigns)
      await supabase
        .from("klaviyo_campaign_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", normalizedPeriod)
        .lt("fetched_at", syncTimestamp)
    }
  }

  // Guard: org_id is NOT NULL in store_revenue_summary — skip if missing
  if (!store.org_id) {
    log.warn(`[SyncPersistence] Skipping revenue summary for store ${store.id}: missing org_id`)
    return
  }

  // Constraint chk_custom_range_dates exige range_start/range_end pra
  // period_label "custom:..." e NULL pra demais (migration 20260318).
  const klaviyoCustomRangeFields = normalizedPeriod.startsWith("custom:")
    ? (() => {
        const [, start, end] = normalizedPeriod.split(":")
        return { range_start: start, range_end: end }
      })()
    : { range_start: null, range_end: null }

  // Build upsert payload — only include revenue fields when data was actually fetched
  const summaryPayload: Record<string, unknown> = {
    store_id: store.id,
    org_id: store.org_id,
    period_label: normalizedPeriod,
    period_start: data.startDateStr,
    period_end: data.endDateStr,
    ...klaviyoCustomRangeFields,
    currency: data.currency || "BRL",
    sync_source: "cron",
    sync_error: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    fetched_at: new Date().toISOString(),
    store_total_revenue: data.storeRevenue,
    store_orders: data.storeOrders,
    ...(audience ? {
      total_leads: audience.totalLeads,
      engaged_leads: audience.engagedLeads,
      engagement_rate: audience.engagementRate,
    } : {}),
  }

  if (data.flowDataAvailable) {
    summaryPayload.klaviyo_flow_revenue = data.flowRevenue
  }
  if (data.campaignDataAvailable) {
    summaryPayload.klaviyo_campaign_revenue = data.campaignRevenue
  }

  if (data.flowDataAvailable && data.campaignDataAvailable) {
    summaryPayload.klaviyo_total_revenue = data.campaignRevenue + data.flowRevenue
    summaryPayload.sync_status = "ok"
  } else if (data.flowDataAvailable || data.campaignDataAvailable) {
    summaryPayload.sync_status = "partial"
    summaryPayload.sync_error = !data.campaignDataAvailable
      ? "Campaign report unavailable"
      : "Flow report unavailable"
    // Recalculate total from available field + existing DB value
    const { data: existing } = await supabase
      .from("store_revenue_summary")
      .select("klaviyo_campaign_revenue, klaviyo_flow_revenue")
      .eq("store_id", store.id)
      .eq("period_label", normalizedPeriod)
      .single()

    const campRev = data.campaignDataAvailable
      ? data.campaignRevenue
      : (existing ? Number(existing.klaviyo_campaign_revenue) || 0 : 0)
    const flowRev = data.flowDataAvailable
      ? data.flowRevenue
      : (existing ? Number(existing.klaviyo_flow_revenue) || 0 : 0)
    summaryPayload.klaviyo_total_revenue = campRev + flowRev
  } else {
    summaryPayload.klaviyo_total_revenue = 0
    summaryPayload.sync_status = "error"
    summaryPayload.sync_error = "Both campaign and flow reports unavailable"
  }

  const { error: summaryErr } = await supabase
    .from("store_revenue_summary")
    .upsert(summaryPayload, { onConflict: "store_id,period_label" })
  if (summaryErr) {
    log.error(`[SyncPersistence] Failed to upsert summary for ${store.id}/${normalizedPeriod}:`, summaryErr.message)
  }

  // Sync campaigns to calendar table
  await syncCampaignsToCalendarFromCron(supabase, store, data.campRows)
}

/**
 * Upserts Omnisend sync results into the same cache tables
 * that Klaviyo uses, but in the omnisend_* columns. Also
 * persists granular rows into omnisend_campaign_metrics and
 * omnisend_flow_metrics.
 *
 * Shared by: cron sync-omnisend + manual per-store trigger.
 */
export async function upsertOmnisendSyncResults(
  supabase: SupabaseClient,
  store: StoreInfo,
  data: OmnisendSyncData,
  period: string,
): Promise<void> {
  if (!store.org_id) {
    log.warn(`[SyncPersistence] Skipping Omnisend summary for store ${store.id}: missing org_id`)
    return
  }

  const normalizedPeriod = normalizePeriodLabel(period)

  const days = PERIOD_DAYS[period] ?? 30
  const now = new Date()
  // "Last N days" inclui hoje (igual Omnisend dashboard): days-1.
  const periodStart = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()
  const periodStartIso = periodStart.toISOString()

  const engagedCount = data.engagedContacts ?? data.subscribedContacts
  const engagementRate = data.totalContacts > 0
    ? Math.round((engagedCount / data.totalContacts) * 10000) / 100
    : 0

  // omnisend_total_revenue reflete exatamente o attributedRevenue da
  // Statistics API — e a fonte de verdade da receita atribuida ao Omnisend.
  // omnisend_campaign_revenue/omnisend_flow_revenue recebem o split REAL da
  // Statistics API (data.totalCampaignRevenue / data.totalAutomationRevenue,
  // ver revenueFields abaixo) — nao mais o breakdown derivado campaign=0.
  //
  // CRITICO: quando Statistics API esta rate-limited, o sync devolve
  // {totalStoreRevenue: 0, totalAttributedRevenue: 0}. Sem cuidado, isso
  // SOBRESCREVE valores bons de um sync anterior com zeros, apagando
  // €371k do Overview. Por isso, quando TODOS os campos de revenue
  // estao zerados, omitimos os campos do payload — o upsert preserva
  // os valores existentes na linha.
  const revenueCollected = data.totalStoreRevenue > 0
    || data.totalAttributedRevenue > 0
    || data.totalOrders > 0
    || data.totalAttributedOrders > 0

  const revenueFields = revenueCollected ? {
    store_total_revenue: data.totalStoreRevenue,
    store_orders: data.totalOrders,
    omnisend_total_revenue: data.totalAttributedRevenue,
    omnisend_total_orders: data.totalAttributedOrders,
    omnisend_campaign_revenue: data.totalCampaignRevenue,
    omnisend_flow_revenue: data.totalAutomationRevenue,
  } : {}

  // Constraint chk_custom_range_dates (migration 20260318): quando
  // period_label e "custom:YYYY-MM-DD:YYYY-MM-DD" precisa setar
  // range_start/range_end. Quando e "30d" etc precisa deixar NULL.
  const customRangeFields = normalizedPeriod.startsWith("custom:")
    ? (() => {
        const [, start, end] = normalizedPeriod.split(":")
        return { range_start: start, range_end: end }
      })()
    : { range_start: null, range_end: null }

  const summaryPayload = {
    store_id: store.id,
    org_id: store.org_id,
    period_label: normalizedPeriod,
    period_start: periodStartIso,
    period_end: nowIso,
    ...customRangeFields,
    ...revenueFields,
    total_leads: data.totalContacts,
    engaged_leads: engagedCount,
    engagement_rate: engagementRate,
    sync_status: revenueCollected ? "ok" : "partial",
    // sync_source tem CHECK CONSTRAINT restrito a 'cron' | 'live' | 'report'
    // (migration 20260318). "omnisend" viola o check e faz o upsert explodir.
    sync_source: "cron",
    sync_error: revenueCollected ? null : "Statistics API unavailable — revenue preserved from previous sync",
    currency: data.currency,
    fetched_at: nowIso,
    expires_at: expiresAt,
  }

  log.info("[SyncPersist] writing row", {
    store_id: store.id,
    period_label: normalizedPeriod,
    period_input: period,
    revenueCollected,
    store_total_revenue: data.totalStoreRevenue,
    store_orders: data.totalOrders,
    omnisend_total_revenue: data.totalAttributedRevenue,
    omnisend_total_orders: data.totalAttributedOrders,
    total_leads: data.totalContacts,
    engaged_leads: engagedCount,
  })

  // Fallback: se a migration 20260422_omnisend_total_orders nao foi
  // aplicada ainda, faz retry sem essa coluna para nao quebrar o sync.
  let summaryErr: { message: string } | null = null
  const firstRes = await supabase
    .from("store_revenue_summary")
    .upsert(summaryPayload, { onConflict: "store_id,period_label" })
  if (firstRes.error && /omnisend_total_orders/.test(firstRes.error.message || "")) {
    log.warn("[SyncPersist] omnisend_total_orders column missing, retrying without it")
    const { omnisend_total_orders: _drop, ...payloadWithoutOrders } = summaryPayload
    void _drop
    const retryRes = await supabase
      .from("store_revenue_summary")
      .upsert(payloadWithoutOrders, { onConflict: "store_id,period_label" })
    summaryErr = retryRes.error
  } else {
    summaryErr = firstRes.error
  }
  if (summaryErr) {
    log.error(`[SyncPersistence] Failed to upsert Omnisend summary for ${store.id}/${period}:`, summaryErr.message)
  }

  if (data.campaignRows.length > 0) {
    const campaignPayload = data.campaignRows.map((c) => ({
      store_id: c.store_id,
      org_id: c.org_id,
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      campaign_status: c.campaign_status,
      send_time: c.send_time,
      subject: c.subject,
      channel: c.channel || "email",
      period_start: periodStartIso,
      period_end: nowIso,
      period_label: normalizedPeriod,
      recipients: c.recipients,
      delivered: c.delivered,
      // Rates: clamp em [0, 999.99] pra caber em NUMERIC(5,2). Sem isso,
      // valores edge-case (delivered=0 + opened>0 = Infinity, ou bugs da
      // API) explodem a coluna com "numeric field overflow" e quebram o
      // sync inteiro.
      delivery_rate: clampRate(c.delivery_rate),
      opened: c.opened,
      open_rate: clampRate(c.open_rate),
      clicked: c.clicked,
      click_rate: clampRate(c.click_rate),
      conversions: c.conversions,
      conversion_rate: clampRate(c.conversion_rate),
      conversion_value: clampMoney12(c.conversion_value),
      revenue_per_recipient: clampMoney10(c.revenue_per_recipient),
      bounced: c.bounced,
      bounce_rate: clampRate(c.bounce_rate),
      unsubscribed: c.unsubscribed,
      unsubscribe_rate: clampRate(c.unsubscribe_rate),
      spam_complaints: c.spam_complaints,
      fetched_at: nowIso,
      expires_at: expiresAt,
    }))
    const { error: campErr } = await supabase
      .from("omnisend_campaign_metrics")
      .upsert(campaignPayload, { onConflict: "store_id,campaign_id,period_start,period_end" })
    if (campErr) {
      log.error(`[SyncPersistence] Failed to upsert omnisend_campaign_metrics for ${store.id}/${period}`, {
        error: campErr.message,
        rowCount: campaignPayload.length,
        firstRow: JSON.stringify(campaignPayload[0]).slice(0, 500),
      })
    } else {
      // Cleanup: period_start/period_end mudam a cada sync (nowIso), entao
      // o onConflict nao colapsa rows de syncs anteriores. Sem isso, a mesma
      // campanha acumula uma linha por sync — aparecia 5x repetida em
      // "Ultimas Campanhas". Deletamos rows deste store/period que nao foram
      // tocadas por este sync (fetched_at antigo).
      await supabase
        .from("omnisend_campaign_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", normalizedPeriod)
        .lt("fetched_at", nowIso)
      log.info(`[SyncPersistence] Upserted ${campaignPayload.length} omnisend_campaign_metrics rows for ${store.id}/${normalizedPeriod}`)
    }
  } else {
    // Loja sem campanha no período é dado, não anomalia — warn aqui
    // poluía o painel de erros da Vercel a cada sync.
    log.info(`[SyncPersistence] No campaign rows to upsert for ${store.id}/${period} — data.campaignRows.length=0`)
  }

  if (data.automationRows.length > 0) {
    const flowPayload = data.automationRows.map((a) => ({
      store_id: a.store_id,
      org_id: a.org_id,
      flow_id: a.automation_id,
      flow_name: a.automation_name,
      flow_status: a.automation_status || "live",
      trigger_type: a.trigger_type,
      period_start: periodStartIso,
      period_end: nowIso,
      period_label: normalizedPeriod,
      recipients: a.recipients,
      delivered: a.delivered,
      delivery_rate: clampRate(a.delivery_rate),
      opened: a.opened,
      open_rate: clampRate(a.open_rate),
      clicked: a.clicked,
      click_rate: clampRate(a.click_rate),
      conversions: a.conversions,
      conversion_rate: clampRate(a.conversion_rate),
      conversion_value: clampMoney12(a.conversion_value),
      revenue_per_recipient: clampMoney10(a.revenue_per_recipient),
      bounced: a.bounced,
      bounce_rate: clampRate(a.bounce_rate),
      unsubscribed: a.unsubscribed,
      unsubscribe_rate: clampRate(a.unsubscribe_rate),
      fetched_at: nowIso,
      expires_at: expiresAt,
    }))
    const { error: flowErr } = await supabase
      .from("omnisend_flow_metrics")
      .upsert(flowPayload, { onConflict: "store_id,flow_id,period_start,period_end" })
    if (flowErr) {
      log.error(`[SyncPersistence] Failed to upsert omnisend_flow_metrics for ${store.id}/${period}`, {
        error: flowErr.message,
        rowCount: flowPayload.length,
        firstRow: JSON.stringify(flowPayload[0]).slice(0, 500),
      })
    } else {
      // Mesmo cleanup das campaigns — evita flows duplicados acumulados
      // entre syncs por causa do period_end mutavel.
      await supabase
        .from("omnisend_flow_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", normalizedPeriod)
        .lt("fetched_at", nowIso)
      log.info(`[SyncPersistence] Upserted ${flowPayload.length} omnisend_flow_metrics rows for ${store.id}/${normalizedPeriod}`)
    }
  } else {
    log.info(`[SyncPersistence] No automation rows to upsert for ${store.id}/${period} — data.automationRows.length=0`)
  }

  await supabase
    .from("client_stores")
    .update({ email_platform: "omnisend" })
    .eq("id", store.id)
    .neq("email_platform", "omnisend")
}

/**
 * Save live-fetched KlaviyoPerformanceData back to cache tables so
 * subsequent requests get instant cache hits without hitting the API.
 * Only saves for CACHED_PERIODS (7d, 15d, 30d, 90d).
 */
export async function savePerfDataToCache(
  supabase: SupabaseClient,
  storeId: string,
  orgId: string,
  period: string,
  data: KlaviyoPerformanceData,
  startDateStr: string,
  endDateStr: string,
): Promise<void> {
  if (!(CACHED_PERIODS as readonly string[]).includes(period)) return

  // Guard: org_id is NOT NULL in store_revenue_summary — skip if missing
  if (!orgId) {
    log.warn(`[SyncPersistence] Skipping perf cache save: missing orgId for store ${storeId}`)
    return
  }

  const periodStartISO = new Date(`${startDateStr}T00:00:00Z`).toISOString()
  const periodEndISO = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const metricsExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48h TTL for flow/campaign metrics (Story 54.9)

  try {
    // Upsert revenue summary
    const { error: summaryErr } = await supabase
      .from("store_revenue_summary")
      .upsert({
        store_id: storeId,
        org_id: orgId,
        period_label: period,
        period_start: periodStartISO,
        period_end: periodEndISO,
        klaviyo_total_revenue: data.attributedRevenue,
        klaviyo_campaign_revenue: data.campaignRevenue,
        klaviyo_flow_revenue: data.flowRevenue,
        store_total_revenue: data.storeRevenue,
        store_orders: data.storeOrders,
        total_leads: data.totalLeads,
        engaged_leads: data.engagedLeads,
        engagement_rate: data.engagementRate,
        sync_status: "ok",
        sync_source: "live",
        sync_error: null,
        expires_at: expiresAt,
        fetched_at: now,
      }, { onConflict: "store_id,period_label" })

    if (summaryErr) {
      log.error(`[SyncPersistence] Failed to upsert summary for ${storeId}/${period}:`, summaryErr.message)
      return
    }

    // Upsert campaign detail rows
    if (data.recentCampaigns.length > 0) {
      const campRows = data.recentCampaigns.map(c => ({
        store_id: storeId,
        org_id: orgId,
        campaign_id: c.campaignId,
        campaign_name: c.name,
        send_time: c.sendTime || null,
        period_label: period,
        period_start: periodStartISO,
        period_end: periodEndISO,
        recipients: c.recipients,
        delivered: c.delivered,
        opened: c.opened || 0,
        clicked: c.clicked || 0,
        conversions: c.conversions || 0,
        open_rate: clampRate(c.openRate),
        click_rate: clampRate(c.clickRate),
        conversion_value: clampMoney12(c.revenue),
        fetched_at: now,
        expires_at: metricsExpiresAt,
      }))
      const { error: campErr } = await supabase
        .from("klaviyo_campaign_metrics")
        .upsert(campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
      if (campErr) {
        log.warn(`[SyncPersistence] Failed to upsert campaigns for ${storeId}/${period}:`, campErr.message)
      }
    }

    // Upsert flow detail rows
    if (data.topFlows.length > 0) {
      const flowRows = data.topFlows.map(f => ({
        store_id: storeId,
        org_id: orgId,
        flow_id: f.flowId,
        flow_name: f.name,
        flow_status: f.status,
        period_label: period,
        period_start: periodStartISO,
        period_end: periodEndISO,
        delivered: f.delivered,
        open_rate: clampRate(f.openRate),
        click_rate: clampRate(f.clickRate),
        conversion_value: clampMoney12(f.revenue),
        fetched_at: now,
        expires_at: metricsExpiresAt,
      }))
      const { error: flowErr } = await supabase
        .from("klaviyo_flow_metrics")
        .upsert(flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
      if (flowErr) {
        log.warn(`[SyncPersistence] Failed to upsert flows for ${storeId}/${period}:`, flowErr.message)
      }
    }

    // Sync campaigns to calendar table
    await syncCampaignsToCalendarFromLive(supabase, storeId, data.recentCampaigns)

    log.info(`[SyncPersistence] Saved perf data to cache for store ${storeId}/${period}`)
  } catch (err) {
    // Non-fatal — log and continue
    log.warn(`[SyncPersistence] Failed to save perf data to cache for store ${storeId}/${period}:`, err)
  }
}

/**
 * Sync Klaviyo campaigns to the `campaigns` calendar table
 * from the live-fetch path (KlaviyoCampaignItem[]).
 */
async function syncCampaignsToCalendarFromLive(
  supabase: SupabaseClient,
  storeId: string,
  campaigns: KlaviyoCampaignItem[],
): Promise<void> {
  if (campaigns.length === 0) return

  // Resolve client_id from client_stores
  const clientId = await resolveClientId(supabase, storeId)

  const rows = campaigns
    .filter(c => c.sendTime)
    .map(c => {
      const sendDate = new Date(c.sendTime)
      return {
        store_id: storeId,
        client_id: clientId,
        klaviyo_campaign_id: c.campaignId,
        name: c.name,
        scheduled_date: sendDate.toISOString().split("T")[0],
        scheduled_time: sendDate.toTimeString().split(" ")[0],
        send_datetime: sendDate.toISOString(),
        status: mapCampaignStatus(null, c.sendTime),
        channel: "email" as const,
        recipients: c.recipients,
        delivered: c.delivered,
        opened: c.opened || 0,
        clicked: c.clicked || 0,
        converted: c.conversions || 0,
        revenue: c.revenue,
      }
    })

  if (rows.length === 0) return

  const { error } = await supabase
    .from("campaigns")
    .upsert(rows, { onConflict: "store_id,klaviyo_campaign_id" })

  if (error) {
    log.warn(`[SyncPersistence] Failed to sync campaigns to calendar for ${storeId}:`, error.message)
  }
}

/**
 * Sync Klaviyo campaigns to the `campaigns` calendar table
 * from the cron path (CampaignMetricRow[]).
 */
export async function syncCampaignsToCalendarFromCron(
  supabase: SupabaseClient,
  store: StoreInfo,
  campRows: CampaignMetricRow[],
): Promise<void> {
  if (campRows.length === 0) return

  const clientId = await resolveClientId(supabase, store.id)

  const rows = campRows
    .filter(r => r.send_time)
    .map(r => {
      const sendDate = new Date(r.send_time!)
      return {
        store_id: store.id,
        client_id: clientId,
        klaviyo_campaign_id: r.campaign_id,
        name: r.campaign_name,
        scheduled_date: sendDate.toISOString().split("T")[0],
        scheduled_time: sendDate.toTimeString().split(" ")[0],
        send_datetime: sendDate.toISOString(),
        status: mapCampaignStatus(r.campaign_status, r.send_time),
        channel: (r.channel || "email") as "email" | "sms" | "push" | "whatsapp",
        subject_line: r.subject || null,
        recipients: r.recipients,
        delivered: r.delivered,
        opened: r.opened,
        clicked: r.clicked,
        converted: r.conversions,
        revenue: r.conversion_value,
      }
    })

  if (rows.length === 0) return

  const { error } = await supabase
    .from("campaigns")
    .upsert(rows, { onConflict: "store_id,klaviyo_campaign_id" })

  if (error) {
    log.warn(`[SyncPersistence] Failed to sync campaigns to calendar for ${store.id}:`, error.message)
  }
}

/**
 * Resolve client_id from client_stores table given a store_id.
 * Returns null if not found.
 */
async function resolveClientId(
  supabase: SupabaseClient,
  storeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("client_stores")
    .select("client_id")
    .eq("id", storeId)
    .single()

  if (error || !data) {
    log.warn(`[SyncPersistence] Could not resolve client_id for store ${storeId}`)
    return null
  }
  return data.client_id
}

/**
 * Map Klaviyo campaign status to the campaign_status enum.
 */
function mapCampaignStatus(status: string | null | undefined, sendTime?: string | null): "draft" | "scheduled" | "sent" | "cancelled" {
  if (status) {
    switch (status) {
      case "sent": return "sent"
      case "scheduled": return "scheduled"
      case "cancelled": return "cancelled"
      case "draft": return "draft"
    }
  }
  // Infer from send_time when status is null/undefined
  if (sendTime) {
    return new Date(sendTime) <= new Date() ? "sent" : "scheduled"
  }
  return "draft"
}

/**
 * Upsert Klaviyo audience items (lists + segments) to the klaviyo_audiences table.
 * Uses delete-then-insert pattern to handle Klaviyo-side deletions (QA requirement).
 * Does NOT affect store_revenue_summary — that path remains independent (QA requirement).
 */
export async function upsertAudiences(
  supabase: SupabaseClient,
  store: StoreInfo,
  items: AudienceItem[],
): Promise<void> {
  if (items.length === 0) return

  const now = new Date().toISOString()

  // DELETE+INSERT pattern kept intentionally for audiences (Story 54.3):
  // - Audiences have no unique conflict key suitable for UPSERT cleanup
  // - This table is NOT read by the portal dashboard during sync, so the
  //   brief zero-rows window does not cause a visible race condition
  // - Contrast with flow/campaign metrics which use UPSERT+CLEANUP (atomic write)
  const { error: deleteErr } = await supabase
    .from("klaviyo_audiences")
    .delete()
    .eq("store_id", store.id)

  if (deleteErr) {
    log.warn(`[AudienceSync] Failed to delete stale audiences for ${store.id}:`, deleteErr.message)
    return
  }

  const rows = items.map(item => ({
    store_id: store.id,
    org_id: store.org_id || null,
    klaviyo_id: item.klaviyoId,
    type: item.type,
    name: item.name,
    profile_count: item.profileCount,
    is_active: item.isActive ?? null,
    is_starred: item.isStarred ?? null,
    is_main_list: item.isMainList,
    is_engaged_segment: item.isEngagedSegment,
    created_at_klaviyo: item.createdAtKlaviyo || null,
    fetched_at: now,
  }))

  const { error: insertErr } = await supabase
    .from("klaviyo_audiences")
    .insert(rows)

  if (insertErr) {
    log.warn(`[AudienceSync] Failed to insert audiences for ${store.id}:`, insertErr.message)
  } else {
    log.info(`[AudienceSync] Synced ${items.length} audiences for store ${store.id}`)
  }
}
