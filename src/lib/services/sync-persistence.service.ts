/**
 * Sync Persistence Service
 *
 * Shared logic for upserting Klaviyo sync results to cache tables.
 * Used by both admin total-revenue and portal dashboard endpoints.
 *
 * Epic 10 - QA Finding F5
 */

import { SupabaseClient } from "@supabase/supabase-js"
import type { KlaviyoSyncData, CampaignMetricRow } from "./klaviyo-sync.service"
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
  // Upsert flow metrics
  if (data.flowRows.length > 0) {
    const { error: flowErr } = await supabase
      .from("klaviyo_flow_metrics")
      .upsert(data.flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
    if (flowErr) {
      log.warn(`[SyncPersistence] Failed to upsert flow metrics for ${store.id}/${period}:`, flowErr.message)
    }
  }

  // Upsert campaign metrics
  if (data.campRows.length > 0) {
    const { error: campErr } = await supabase
      .from("klaviyo_campaign_metrics")
      .upsert(data.campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
    if (campErr) {
      log.warn(`[SyncPersistence] Failed to upsert campaign metrics for ${store.id}/${period}:`, campErr.message)
    }
  }

  // When the campaign report fails silently (campaignRevenue=0 + no campRows),
  // preserve existing campaign revenue instead of overwriting with 0.
  let effectiveCampaignRevenue = data.campaignRevenue
  let effectiveFlowRevenue = data.flowRevenue

  const campaignReportMissing = data.campaignRevenue === 0 && data.campRows.length === 0
  const flowReportMissing = data.flowRevenue === 0 && data.flowRows.length === 0

  if (campaignReportMissing || flowReportMissing) {
    const { data: existing } = await supabase
      .from("store_revenue_summary")
      .select("klaviyo_campaign_revenue, klaviyo_flow_revenue")
      .eq("store_id", store.id)
      .eq("period_label", period)
      .single()

    if (existing) {
      if (campaignReportMissing && existing.klaviyo_campaign_revenue > 0) {
        effectiveCampaignRevenue = existing.klaviyo_campaign_revenue
        log.info(`[SyncPersistence] Preserving existing campaign revenue ${effectiveCampaignRevenue} for ${store.id}/${period} (campaign report missing)`)
      }
      if (flowReportMissing && existing.klaviyo_flow_revenue > 0) {
        effectiveFlowRevenue = existing.klaviyo_flow_revenue
        log.info(`[SyncPersistence] Preserving existing flow revenue ${effectiveFlowRevenue} for ${store.id}/${period} (flow report missing)`)
      }
    }
  }

  // Upsert revenue summary
  // Audience fields are only included when explicitly passed (e.g. from cron job).
  // Portal live-fetch calls omit audience to avoid overwriting cron-populated values.
  const { error: summaryErr } = await supabase
    .from("store_revenue_summary")
    .upsert({
      store_id: store.id,
      org_id: store.org_id || null,
      period_label: period,
      period_start: data.startDateStr,
      period_end: data.endDateStr,
      klaviyo_total_revenue: effectiveCampaignRevenue + effectiveFlowRevenue,
      klaviyo_campaign_revenue: effectiveCampaignRevenue,
      klaviyo_flow_revenue: effectiveFlowRevenue,
      store_total_revenue: data.storeRevenue,
      store_orders: data.storeOrders,
      currency: data.currency || "BRL",
      sync_status: "ok",
      sync_source: "cron",
      sync_error: null,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      fetched_at: new Date().toISOString(),
      ...(audience ? {
        total_leads: audience.totalLeads,
        engaged_leads: audience.engagedLeads,
        engagement_rate: audience.engagementRate,
      } : {}),
    }, { onConflict: "store_id,period_label" })
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
  orgId: string | null,
  period: string,
  data: KlaviyoPerformanceData,
  startDateStr: string,
  endDateStr: string,
): Promise<void> {
  if (!(CACHED_PERIODS as readonly string[]).includes(period)) return

  const periodStartISO = new Date(`${startDateStr}T00:00:00Z`).toISOString()
  const periodEndISO = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

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
        period_start: periodStartISO,
        period_end: periodEndISO,
        recipients: c.recipients,
        delivered: c.delivered,
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
        status: "sent" as const,
        channel: "email" as const,
        recipients: c.recipients,
        delivered: c.delivered,
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
        status: mapCampaignStatus(r.campaign_status),
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
function mapCampaignStatus(status: string): "draft" | "scheduled" | "sent" | "cancelled" {
  switch (status) {
    case "sent": return "sent"
    case "scheduled": return "scheduled"
    case "cancelled": return "cancelled"
    default: return "draft"
  }
}
