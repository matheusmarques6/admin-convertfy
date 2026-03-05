/**
 * Sync Persistence Service
 *
 * Shared logic for upserting Klaviyo sync results to cache tables.
 * Used by both admin total-revenue and portal dashboard endpoints.
 *
 * Epic 10 - QA Finding F5
 */

import { SupabaseClient } from "@supabase/supabase-js"
import type { KlaviyoSyncData } from "./klaviyo-sync.service"
import type { KlaviyoPerformanceData } from "./klaviyo-performance.service"
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
    await supabase
      .from("klaviyo_flow_metrics")
      .upsert(data.flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
  }

  // Upsert campaign metrics
  if (data.campRows.length > 0) {
    await supabase
      .from("klaviyo_campaign_metrics")
      .upsert(data.campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
  }

  // Upsert revenue summary
  // Audience fields are only included when explicitly passed (e.g. from cron job).
  // Portal live-fetch calls omit audience to avoid overwriting cron-populated values.
  await supabase
    .from("store_revenue_summary")
    .upsert({
      store_id: store.id,
      org_id: store.org_id || null,
      period_label: period,
      period_start: data.startDateStr,
      period_end: data.endDateStr,
      klaviyo_total_revenue: data.campaignRevenue + data.flowRevenue,
      klaviyo_campaign_revenue: data.campaignRevenue,
      klaviyo_flow_revenue: data.flowRevenue,
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
    await supabase
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
      await supabase
        .from("klaviyo_campaign_metrics")
        .upsert(campRows, { onConflict: "store_id,campaign_id,period_start,period_end" })
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
      await supabase
        .from("klaviyo_flow_metrics")
        .upsert(flowRows, { onConflict: "store_id,flow_id,period_start,period_end" })
    }

    log.info(`[SyncPersistence] Saved perf data to cache for store ${storeId}/${period}`)
  } catch (err) {
    // Non-fatal — log and continue
    log.warn(`[SyncPersistence] Failed to save perf data to cache for store ${storeId}/${period}:`, err)
  }
}
