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
      sync_status: "ok",
      sync_error: null,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      fetched_at: new Date().toISOString(),
    }, { onConflict: "store_id,period_label" })
}
