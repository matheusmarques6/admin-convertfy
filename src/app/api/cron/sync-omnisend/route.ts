/**
 * Cron: Sync Omnisend Reports
 *
 * GET /api/cron/sync-omnisend
 *
 * Fetches campaign metrics, automation metrics, audience data,
 * and revenue data from Omnisend for all stores with Omnisend credentials.
 *
 * Stores results in store_revenue_summary (reusing existing table).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"
import { getStoreCredentials, OMNISEND_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { sleep } from "@/lib/integrations/omnisend/client"

const log = logger.child("CronSyncOmnisend")

export const maxDuration = 300
export const dynamic = "force-dynamic"

const MAX_DURATION_MS = 240_000 // 80% of 300s

interface SyncResult {
  storeId: string
  storeName: string
  status: "ok" | "error" | "skipped"
  error?: string
  campaigns?: number
  automations?: number
  revenue?: number
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const startTime = Date.now()
  const results: SyncResult[] = []

  try {
    const adminClient = createAdminClient()

    // Fetch all stores with Omnisend credentials
    const { data: stores, error } = await adminClient
      .from("client_stores")
      .select("id, store_name, org_id, omnisend_validated_at, omnisend_validation_error")
      .or(OMNISEND_CREDENTIALS_FILTER)
      .eq("is_active", true)
      .order("store_name")

    if (error) {
      log.error("Failed to fetch stores", { error })
      return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
    }

    if (!stores || stores.length === 0) {
      log.info("No stores with Omnisend credentials found")
      return NextResponse.json({ message: "No stores to sync", results: [] })
    }

    log.info(`Found ${stores.length} stores with Omnisend credentials`)

    for (const store of stores) {
      // Check time budget
      if (Date.now() - startTime > MAX_DURATION_MS) {
        log.warn("Time budget exhausted, stopping sync")
        break
      }

      // Skip stores with validation errors (API key issue)
      if (store.omnisend_validation_error && !store.omnisend_validated_at) {
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "skipped",
          error: "Credentials not validated",
        })
        continue
      }

      try {
        // Get decrypted credentials
        const credentials = await getStoreCredentials(store.id, store.org_id)
        const apiKey = credentials.omnisend_api_key

        if (!apiKey) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            status: "skipped",
            error: "No API key found",
          })
          continue
        }

        log.info(`Syncing Omnisend for ${store.store_name}`, { storeId: store.id })

        // Sync 30-day period (primary period for dashboard)
        const syncResult = await syncOmnisendForStore({
          storeId: store.id,
          orgId: store.org_id,
          apiKey,
          periodDays: 30,
        })

        if (!syncResult.ok || !syncResult.data) {
          results.push({
            storeId: store.id,
            storeName: store.store_name,
            status: "error",
            error: syncResult.error || "Sync failed",
          })
          continue
        }

        const data = syncResult.data

        // Upsert into store_revenue_summary (reuse existing table)
        const now = new Date()
        const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const summaryPayload = {
          store_id: store.id,
          org_id: store.org_id,
          period_label: "30d",
          period_start: periodStart.toISOString(),
          period_end: now.toISOString(),
          store_total_revenue: data.totalStoreRevenue,
          store_orders: data.totalOrders,
          // Colunas omnisend_* dedicadas (uma loja usa UMA plataforma,
          // entao Klaviyo e Omnisend nao se sobrepoem)
          omnisend_total_revenue: data.totalCampaignRevenue + data.totalAutomationRevenue,
          omnisend_campaign_revenue: data.totalCampaignRevenue,
          omnisend_flow_revenue: data.totalAutomationRevenue,
          total_leads: data.totalContacts,
          engaged_leads: data.subscribedContacts,
          engagement_rate: data.totalContacts > 0
            ? Math.round((data.subscribedContacts / data.totalContacts) * 10000) / 100
            : 0,
          sync_status: "ok",
          sync_source: "omnisend",
          sync_error: null,
          currency: data.currency,
          fetched_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        }

        const { error: upsertError } = await adminClient
          .from("store_revenue_summary")
          .upsert(summaryPayload, { onConflict: "store_id,period_label" })

        if (upsertError) {
          log.error("Failed to upsert revenue summary", { storeId: store.id, error: upsertError })
        }

        // Persistir metricas granulares das campanhas em omnisend_campaign_metrics
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
            period_start: periodStart.toISOString(),
            period_end: now.toISOString(),
            period_label: "30d",
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
            fetched_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          }))
          const { error: campErr } = await adminClient
            .from("omnisend_campaign_metrics")
            .upsert(campaignPayload, { onConflict: "store_id,campaign_id,period_start,period_end" })
          if (campErr) log.warn("Failed to upsert omnisend_campaign_metrics", { error: campErr })
        }

        // Persistir metricas granulares dos flows/automacoes em omnisend_flow_metrics
        if (data.automationRows.length > 0) {
          const flowPayload = data.automationRows.map((a) => ({
            store_id: a.store_id,
            org_id: a.org_id,
            flow_id: a.automation_id,
            flow_name: a.automation_name,
            flow_status: a.automation_status || "live",
            trigger_type: a.trigger_type,
            period_start: periodStart.toISOString(),
            period_end: now.toISOString(),
            period_label: "30d",
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
            fetched_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          }))
          const { error: flowErr } = await adminClient
            .from("omnisend_flow_metrics")
            .upsert(flowPayload, { onConflict: "store_id,flow_id,period_start,period_end" })
          if (flowErr) log.warn("Failed to upsert omnisend_flow_metrics", { error: flowErr })
        }

        // Marcar a plataforma da loja (idempotente)
        await adminClient
          .from("client_stores")
          .update({ email_platform: "omnisend" })
          .eq("id", store.id)
          .neq("email_platform", "omnisend")

        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "ok",
          campaigns: data.campaignRows.length,
          automations: data.automationRows.length,
          revenue: data.totalStoreRevenue,
        })

        log.info(`Omnisend sync complete for ${store.store_name}`, {
          campaigns: data.campaignRows.length,
          automations: data.automationRows.length,
          revenue: data.totalStoreRevenue,
          contacts: data.totalContacts,
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        log.error(`Failed to sync ${store.store_name}`, { error: errMsg })
        results.push({
          storeId: store.id,
          storeName: store.store_name,
          status: "error",
          error: errMsg,
        })
      }

      // Rate limit spacing between stores
      await sleep(1500)
    }

    const okCount = results.filter((r) => r.status === "ok").length
    const errorCount = results.filter((r) => r.status === "error").length

    log.info("Omnisend cron sync complete", {
      total: stores.length,
      ok: okCount,
      errors: errorCount,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    })

    return NextResponse.json({
      message: `Synced ${okCount}/${stores.length} stores`,
      duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      results,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error("Cron sync-omnisend failed", { error: errMsg })
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
