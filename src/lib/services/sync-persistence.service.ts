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

  if (data.flowRows.length > 0) {
    const { error: flowErr } = await supabase
      .from("klaviyo_flow_metrics")
      .upsert(
        data.flowRows.map(r => ({ ...r, period_label: period, fetched_at: syncTimestamp, expires_at: metricsExpiresAt })),
        { onConflict: "store_id,flow_id,period_start,period_end" },
      )
    if (flowErr) {
      log.warn(`[SyncPersistence] Failed to upsert flow metrics for ${store.id}/${period}:`, flowErr.message)
    } else {
      // Cleanup: remove rows not touched by this sync (stale/removed flows)
      await supabase
        .from("klaviyo_flow_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", period)
        .lt("fetched_at", syncTimestamp)
    }
  }

  if (data.campRows.length > 0) {
    const { error: campErr } = await supabase
      .from("klaviyo_campaign_metrics")
      .upsert(
        data.campRows.map(r => ({ ...r, period_label: period, fetched_at: syncTimestamp, expires_at: metricsExpiresAt })),
        { onConflict: "store_id,campaign_id,period_start,period_end" },
      )
    if (campErr) {
      log.warn(`[SyncPersistence] Failed to upsert campaign metrics for ${store.id}/${period}:`, campErr.message)
    } else {
      // Cleanup: remove rows not touched by this sync (stale/removed campaigns)
      await supabase
        .from("klaviyo_campaign_metrics")
        .delete()
        .eq("store_id", store.id)
        .eq("period_label", period)
        .lt("fetched_at", syncTimestamp)
    }
  }

  // Guard: org_id is NOT NULL in store_revenue_summary — skip if missing
  if (!store.org_id) {
    log.warn(`[SyncPersistence] Skipping revenue summary for store ${store.id}: missing org_id`)
    return
  }

  // Build upsert payload — only include revenue fields when data was actually fetched
  const summaryPayload: Record<string, unknown> = {
    store_id: store.id,
    org_id: store.org_id,
    period_label: period,
    period_start: data.startDateStr,
    period_end: data.endDateStr,
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
      .eq("period_label", period)
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
    log.error(`[SyncPersistence] Failed to upsert summary for ${store.id}/${period}:`, summaryErr.message)
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

  const days = PERIOD_DAYS[period] ?? 30
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()
  const periodStartIso = periodStart.toISOString()

  const engagedCount = data.engagedContacts ?? data.subscribedContacts
  const engagementRate = data.totalContacts > 0
    ? Math.round((engagedCount / data.totalContacts) * 10000) / 100
    : 0

  // omnisend_total_revenue reflete exatamente o attributedRevenue da
  // Statistics API — e a fonte de verdade da receita atribuida ao Omnisend.
  // omnisend_campaign_revenue/omnisend_flow_revenue mantem o breakdown
  // derivado (campaign=0, flow=attributed) que o report usa como fallback
  // enquanto a API nao suporta dimension=campaign|workflow.
  const summaryPayload = {
    store_id: store.id,
    org_id: store.org_id,
    period_label: period,
    period_start: periodStartIso,
    period_end: nowIso,
    store_total_revenue: data.totalStoreRevenue,
    store_orders: data.totalOrders,
    omnisend_total_revenue: data.totalAttributedRevenue,
    omnisend_total_orders: data.totalAttributedOrders,
    omnisend_campaign_revenue: data.totalCampaignRevenue,
    omnisend_flow_revenue: data.totalAutomationRevenue,
    total_leads: data.totalContacts,
    engaged_leads: engagedCount,
    engagement_rate: engagementRate,
    sync_status: "ok",
    sync_source: "omnisend",
    sync_error: null,
    currency: data.currency,
    fetched_at: nowIso,
    expires_at: expiresAt,
  }

  log.info("[SyncPersist] writing row", {
    store_id: store.id,
    period_label: period,
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
      period_label: period,
      recipients: c.recipients,
      delivered: c.delivered,
      delivery_rate: c.delivery_rate,
      opened: c.opened,
      open_rate: c.open_rate,
      clicked: c.clicked,
      click_rate: c.click_rate,
      conversions: c.conversions,
      conversion_rate: c.conversion_rate,
      conversion_value: c.conversion_value,
      revenue_per_recipient: c.revenue_per_recipient,
      bounced: c.bounced,
      bounce_rate: c.bounce_rate,
      unsubscribed: c.unsubscribed,
      unsubscribe_rate: c.unsubscribe_rate,
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
      log.info(`[SyncPersistence] Upserted ${campaignPayload.length} omnisend_campaign_metrics rows for ${store.id}/${period}`)
    }
  } else {
    log.warn(`[SyncPersistence] No campaign rows to upsert for ${store.id}/${period} — data.campaignRows.length=0`)
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
      period_label: period,
      recipients: a.recipients,
      delivered: a.delivered,
      delivery_rate: a.delivery_rate,
      opened: a.opened,
      open_rate: a.open_rate,
      clicked: a.clicked,
      click_rate: a.click_rate,
      conversions: a.conversions,
      conversion_rate: a.conversion_rate,
      conversion_value: a.conversion_value,
      revenue_per_recipient: a.revenue_per_recipient,
      bounced: a.bounced,
      bounce_rate: a.bounce_rate,
      unsubscribed: a.unsubscribed,
      unsubscribe_rate: a.unsubscribe_rate,
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
      log.info(`[SyncPersistence] Upserted ${flowPayload.length} omnisend_flow_metrics rows for ${store.id}/${period}`)
    }
  } else {
    log.warn(`[SyncPersistence] No automation rows to upsert for ${store.id}/${period} — data.automationRows.length=0`)
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
        open_rate: c.openRate,
        click_rate: c.clickRate,
        conversion_value: c.revenue,
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
        open_rate: f.openRate,
        click_rate: f.clickRate,
        conversion_value: f.revenue,
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
