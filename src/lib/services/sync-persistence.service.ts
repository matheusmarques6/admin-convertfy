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
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

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
  // Delete stale flow metrics with old period dates, then upsert current ones
  if (data.flowRows.length > 0) {
    await supabase
      .from("klaviyo_flow_metrics")
      .delete()
      .eq("store_id", store.id)
      .eq("period_label", period)
    const { error: flowErr } = await supabase
      .from("klaviyo_flow_metrics")
      .upsert(
        data.flowRows.map(r => ({ ...r, period_label: period })),
        { onConflict: "store_id,flow_id,period_start,period_end" },
      )
    if (flowErr) {
      log.warn(`[SyncPersistence] Failed to upsert flow metrics for ${store.id}/${period}:`, flowErr.message)
    }
  }

  // Delete stale campaign metrics with old period dates, then upsert current ones
  if (data.campRows.length > 0) {
    await supabase
      .from("klaviyo_campaign_metrics")
      .delete()
      .eq("store_id", store.id)
      .eq("period_label", period)
    const { error: campErr } = await supabase
      .from("klaviyo_campaign_metrics")
      .upsert(
        data.campRows.map(r => ({ ...r, period_label: period })),
        { onConflict: "store_id,campaign_id,period_start,period_end" },
      )
    if (campErr) {
      log.warn(`[SyncPersistence] Failed to upsert campaign metrics for ${store.id}/${period}:`, campErr.message)
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

  // Delete-then-insert: removes orphaned rows from Klaviyo-deleted audiences
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
