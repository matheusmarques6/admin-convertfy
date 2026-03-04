import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { cleanExpiredCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { getStoreCredentials, KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"
import {
  parseDateRangeInTimezone,
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
} from "@/lib/integrations/klaviyo"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
} from "@/lib/services/klaviyo-sync.service"
import { upsertSyncResults } from "@/lib/services/sync-persistence.service"

const log = logger.child("CronSyncReports")

export const maxDuration = 300
export const dynamic = "force-dynamic"

const BATCH_SIZE = 10
const MAX_DURATION_MS = 240_000 // 80% of 300s — stop before Vercel kills us
const STALE_LOCK_MS = 10 * 60 * 1000 // 10 minutes

interface CronSyncResult {
  storeId: string
  storeName: string
  period: string
  status: "ok" | "skipped" | "error"
  error?: string
  campaignRevenue?: number
  flowRevenue?: number
}

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
}

// ==============================
// Lock helpers
// ==============================

async function acquireSyncLock(supabase: SupabaseClient): Promise<boolean> {
  const { data: lock } = await supabase
    .from("cron_locks")
    .select("is_running, started_at")
    .eq("lock_name", "sync_reports")
    .single()

  if (lock?.is_running && lock.started_at) {
    const startedAt = new Date(lock.started_at).getTime()
    if (Date.now() - startedAt < STALE_LOCK_MS) {
      log.warn("[Cron] Another sync is running, skipping")
      return false
    }
    log.warn("[Cron] Stale lock detected, proceeding")
  }

  await supabase
    .from("cron_locks")
    .upsert({
      lock_name: "sync_reports",
      is_running: true,
      started_at: new Date().toISOString(),
    }, { onConflict: "lock_name" })

  return true
}

async function releaseSyncLock(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from("cron_locks")
    .update({
      is_running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("lock_name", "sync_reports")
}

// ==============================
// Full sync for one store across all periods
// ==============================

async function syncStore(
  store: StoreRow,
  periods: readonly string[],
  supabase: SupabaseClient,
  startTime: number,
): Promise<CronSyncResult[]> {
  const results: CronSyncResult[] = []

  const credentials = await getStoreCredentials(store.id)
  const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
  if (!apiKey) {
    return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No valid API key" }))
  }

  // Pre-fetch shared data (cached, minimal API calls)
  const accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined)
  const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
  const metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined)

  if (!metricId) {
    return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No Placed Order metric" }))
  }

  // Fetch names ONCE per store (reused across all periods)
  const [flowNames, campNames] = await Promise.all([
    fetchFlowNames(apiKey),
    fetchCampaignNames(apiKey),
  ])

  // Fetch audience metrics ONCE per store (not per period — audience is a snapshot)
  let audience = { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }
  const audienceResult = await fetchAudienceForStore(apiKey)
  if (audienceResult.success && audienceResult.data) {
    audience = audienceResult.data
    log.info(`[Cron] ${store.store_name}: audience totalLeads=${audience.totalLeads} engagedLeads=${audience.engagedLeads} rate=${audience.engagementRate}%`)
  } else {
    log.warn(`[Cron] Failed to fetch audience for ${store.store_name}: ${audienceResult.error || "unknown"}`)
    // Continue with 0s — audience is optional
  }

  // Sync each period
  for (const period of periods) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "skipped", error: "timeout" })
      continue
    }

    try {
      const result = await syncKlaviyoForPeriod({
        storeId: store.id,
        orgId: store.org_id,
        apiKey,
        timezone: accountInfo.timezone,
        timezoneOffset,
        metricId,
        period,
        flowNames,
        campNames,
        currency: accountInfo.currency,
      })

      if (result.success && result.data) {
        // Upsert flow metrics, campaign metrics, and revenue summary via shared service
        await upsertSyncResults(supabase, store, result.data, period, audience)

        results.push({
          storeId: store.id,
          storeName: store.store_name,
          period,
          status: "ok",
          campaignRevenue: result.data.campaignRevenue,
          flowRevenue: result.data.flowRevenue,
        })
      } else {
        // Service returned failure
        const msg = result.error || "Sync service returned failure"
        log.warn(`[Cron] Sync failed for ${store.store_name}/${period}: ${msg}`)
        results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: msg })

        // Upsert error status in store_revenue_summary (org_id can be null)
        {
          const { startDateStr: errStartDate, endDateStr: errEndDate } = parseDateRangeInTimezone(period, accountInfo.timezone)
          const errPeriodStart = new Date(`${errStartDate}T00:00:00Z`).toISOString()
          const errPeriodEnd = new Date(`${errEndDate}T23:59:59.999Z`).toISOString()
          try {
            await supabase
              .from("store_revenue_summary")
              .upsert({
                store_id: store.id,
                org_id: store.org_id || null,
                period_label: period,
                period_start: errPeriodStart,
                period_end: errPeriodEnd,
                klaviyo_total_revenue: 0,
                klaviyo_campaign_revenue: 0,
                klaviyo_flow_revenue: 0,
                store_total_revenue: 0,
                sync_status: "error",
                sync_source: "cron",
                sync_error: msg,
                expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
                fetched_at: new Date().toISOString(),
              }, { onConflict: "store_id,period_label" })
          } catch { /* Don't fail the whole store on summary upsert error */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      log.warn(`[Cron] Error syncing ${store.store_name}/${period}:`, err)
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: msg })

      // Upsert error status in store_revenue_summary (org_id can be null)
      {
        const { startDateStr: errStartDate, endDateStr: errEndDate } = parseDateRangeInTimezone(period, accountInfo.timezone)
        const errPeriodStart = new Date(`${errStartDate}T00:00:00Z`).toISOString()
        const errPeriodEnd = new Date(`${errEndDate}T23:59:59.999Z`).toISOString()
        try {
          await supabase
            .from("store_revenue_summary")
            .upsert({
              store_id: store.id,
              org_id: store.org_id || null,
              period_label: period,
              period_start: errPeriodStart,
              period_end: errPeriodEnd,
              klaviyo_total_revenue: 0,
              klaviyo_campaign_revenue: 0,
              klaviyo_flow_revenue: 0,
              store_total_revenue: 0,
              sync_status: "error",
              sync_source: "cron",
              sync_error: msg,
              expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
              fetched_at: new Date().toISOString(),
            }, { onConflict: "store_id,period_label" })
        } catch { /* Don't fail the whole store on summary upsert error */ }
      }
    }
  }

  // Update per-store sync status
  await supabase
    .from("klaviyo_sync_config")
    .upsert({
      store_id: store.id,
      last_sync_at: new Date().toISOString(),
      last_sync_status: results.some(r => r.status === "error") ? "partial" : "success",
    }, { onConflict: "store_id" })

  return results
}

// ==============================
// Main handler
// ==============================

export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    const startTime = Date.now()

    log.info("[Cron] Starting sync-reports...")

    // Idempotency lock
    const canRun = await acquireSyncLock(supabase)
    if (!canRun) {
      return NextResponse.json({ status: "skipped", reason: "another instance running" }, { status: 409 })
    }

    try {
      // Clean expired cache + revenue summary entries
      const cleanedCount = await cleanExpiredCache(supabase)
      if (cleanedCount > 0) log.info(`[Cron] Cleaned ${cleanedCount} expired cache entries`)

      const { data: revCleanResult } = await supabase.rpc("clean_expired_revenue_summaries")
      if (revCleanResult && revCleanResult > 0) {
        log.info(`[Cron] Cleaned ${revCleanResult} expired revenue summaries`)
      }

      const { data: cooldownCleanResult } = await supabase.rpc("clean_expired_cooldowns")
      if (cooldownCleanResult && cooldownCleanResult > 0) {
        log.info(`[Cron] Cleaned ${cooldownCleanResult} expired cooldown entries`)
      }

      // Get all stores with Klaviyo credentials (either field)
      const { data: stores, error: storesError } = await supabase
        .from("client_stores")
        .select("id, store_name, org_id")
        .or(KLAVIYO_CREDENTIALS_FILTER)
        .not("org_id", "is", null)

      if (storesError || !stores) {
        log.error("[Cron] Failed to fetch stores:", storesError)
        return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
      }

      log.info(`[Cron] Found ${stores.length} stores × ${CACHED_PERIODS.length} periods`)

      const allResults: CronSyncResult[] = []
      let timedOut = false

      // Process stores in batches
      for (let i = 0; i < stores.length; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_DURATION_MS) {
          timedOut = true
          log.warn(`[Cron] Timeout approaching at store batch ${i}/${stores.length}`)
          break
        }

        const batch = stores.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map(store => syncStore(store as StoreRow, CACHED_PERIODS, supabase, startTime))
        )

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j]
          if (result.status === "fulfilled") {
            allResults.push(...result.value)
          } else {
            const msg = result.reason instanceof Error ? result.reason.message : "Unknown error"
            for (const period of CACHED_PERIODS) {
              allResults.push({
                storeId: batch[j].id,
                storeName: batch[j].store_name,
                period,
                status: "error",
                error: msg,
              })
            }
          }
        }
      }

      const elapsed = Date.now() - startTime
      const okCount = allResults.filter(r => r.status === "ok").length
      const errorCount = allResults.filter(r => r.status === "error").length
      const skippedCount = allResults.filter(r => r.status === "skipped").length

      log.info(`[Cron] Sync completed in ${elapsed}ms. ok=${okCount} error=${errorCount} skipped=${skippedCount}${timedOut ? " (timed out)" : ""}`)

      return NextResponse.json({
        status: timedOut ? "partial" : errorCount > 0 ? "partial" : "ok",
        elapsed: `${elapsed}ms`,
        cleanedCacheEntries: cleanedCount,
        summary: { ok: okCount, error: errorCount, skipped: skippedCount },
        stores: allResults,
      })
    } finally {
      await releaseSyncLock(supabase)
    }
  } catch (error) {
    log.error("[Cron] Fatal error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
