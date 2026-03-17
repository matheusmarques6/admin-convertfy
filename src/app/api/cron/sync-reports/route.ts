import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { cleanExpiredCache } from "@/lib/cache"
import { logger } from "@/lib/logger"
import { getStoreCredentials, KLAVIYO_CREDENTIALS_FILTER } from "@/lib/services/credentials.service"
import {
  parseDateRangeInTimezone,
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
} from "@/lib/services/klaviyo-sync.service"
import { upsertSyncResults, upsertAudiences } from "@/lib/services/sync-persistence.service"

const log = logger.child("CronSyncReports")

export const maxDuration = 300
export const dynamic = "force-dynamic"

const MAX_PARALLEL_GROUPS = 2
const INTRA_GROUP_DELAY_MS = 2500
const MAX_DURATION_MS = 240_000 // 80% of 300s — stop before Vercel kills us
const STALE_LOCK_MS = 10 * 60 * 1000 // 10 minutes
const PERMISSION_RETRY_MS = 24 * 60 * 60 * 1000 // 24 hours — retry stores with permission failures after this

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
  klaviyo_has_reporting_access?: boolean
  klaviyo_validated_at?: string
  klaviyo_missing_scopes?: string[]
}

// ==============================
// Lock helpers
// ==============================

async function acquireSyncLock(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("acquire_sync_lock", {
    p_lock_name: "sync_reports",
    p_stale_ms: STALE_LOCK_MS,
  })

  if (error) {
    log.error("[Cron] Failed to acquire lock via RPC:", error.message)
    return false
  }

  if (data === true) {
    return true
  }

  log.warn("[Cron] Another sync is running, skipping")
  return false
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
// Shared upsert helper for sync errors
// ==============================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function upsertSyncError(
  supabase: SupabaseClient,
  store: StoreRow,
  period: string,
  timezone: string,
  errorMsg: string,
): Promise<void> {
  const { startDateStr, endDateStr } = parseDateRangeInTimezone(period, timezone)
  const periodStart = new Date(`${startDateStr}T00:00:00Z`).toISOString()
  const periodEnd = new Date(`${endDateStr}T23:59:59.999Z`).toISOString()
  try {
    const { data: existing } = await supabase
      .from("store_revenue_summary")
      .select("sync_status, klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue, store_total_revenue")
      .eq("store_id", store.id)
      .eq("period_label", period)
      .single()

    // Preserve valid revenue when existing row has status "ok" or "partial"
    if (existing && (existing.sync_status === "ok" || existing.sync_status === "partial")) {
      log.info(`[Cron] Preserving valid revenue for store ${store.store_name}/${period}, marking as partial due to: ${errorMsg}`)
      await supabase
        .from("store_revenue_summary")
        .update({
          sync_status: "partial",
          sync_error: errorMsg,
          expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
          fetched_at: new Date().toISOString(),
        })
        .eq("store_id", store.id)
        .eq("period_label", period)
      return
    }

    // No existing data or status is "error"/"pending" — write zeros
    await supabase
      .from("store_revenue_summary")
      .upsert({
        store_id: store.id,
        org_id: store.org_id || null,
        period_label: period,
        period_start: periodStart,
        period_end: periodEnd,
        klaviyo_total_revenue: 0,
        klaviyo_campaign_revenue: 0,
        klaviyo_flow_revenue: 0,
        store_total_revenue: 0,
        total_leads: 0,
        engaged_leads: 0,
        engagement_rate: 0,
        sync_status: "error",
        sync_source: "cron",
        sync_error: errorMsg,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        fetched_at: new Date().toISOString(),
      }, { onConflict: "store_id,period_label" })
  } catch { /* Don't fail the whole store on summary upsert error */ }
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
  // Wrapped in try-catch to handle KlaviyoPermissionError gracefully
  let accountInfo: Awaited<ReturnType<typeof getCachedAccountInfo>>
  let timezoneOffset: string
  let metricId: string | null
  let flowNames: Awaited<ReturnType<typeof fetchFlowNames>>
  let campNames: Awaited<ReturnType<typeof fetchCampaignNames>>

  try {
    accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined, store.id)
    timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined, store.id)

    if (!metricId) {
      return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No Placed Order metric" }))
    }

    // Fetch names ONCE per store (reused across all periods)
    ;[flowNames, campNames] = await Promise.all([
      fetchFlowNames(apiKey),
      fetchCampaignNames(apiKey),
    ])
  } catch (err) {
    if (err instanceof KlaviyoPermissionError) {
      const scopes = err.missingScopes.join(", ")
      const errorMsg = `[PERMISSION] Klaviyo API key missing scopes: ${scopes}`
      log.warn(`[Cron] ${store.store_name}: ${errorMsg}`)

      // Record error for ALL periods
      const defaultTz = "UTC"
      await Promise.all(
        periods.map(p => upsertSyncError(supabase, store, p, defaultTz, errorMsg))
      )

      // Update client_stores validation fields
      try {
        await supabase
          .from("client_stores")
          .update({
            klaviyo_validation_error: errorMsg,
            klaviyo_missing_scopes: err.missingScopes,
            klaviyo_validated_at: new Date().toISOString(),
            klaviyo_has_reporting_access: false,
          })
          .eq("id", store.id)
      } catch { /* Don't fail on client_stores update error */ }

      return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "error" as const, error: errorMsg }))
    }
    if (err instanceof KlaviyoInvalidKeyError) {
      const errorMsg = `[INVALID_KEY] ${err.message}`
      log.warn(`[Cron] ${store.store_name}: ${errorMsg}`)

      const defaultTz = "UTC"
      await Promise.all(
        periods.map(p => upsertSyncError(supabase, store, p, defaultTz, errorMsg))
      )

      // Update client_stores validation fields
      try {
        await supabase
          .from("client_stores")
          .update({
            klaviyo_validation_error: errorMsg,
            klaviyo_validated_at: new Date().toISOString(),
            klaviyo_has_reporting_access: false,
          })
          .eq("id", store.id)
      } catch { /* Don't fail on client_stores update error */ }

      return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "error" as const, error: errorMsg }))
    }
    if (err instanceof KlaviyoRateLimitError) {
      const errorMsg = `[RATE_LIMIT] Klaviyo rate limited during pre-fetch (Retry-After: ${err.retryAfterMs}ms)`
      log.warn(`[Cron] ${store.store_name}: ${errorMsg}`)

      const defaultTz = "UTC"
      await Promise.all(
        periods.map(p => upsertSyncError(supabase, store, p, defaultTz, errorMsg))
      )

      return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "error" as const, error: errorMsg }))
    }
    throw err // re-throw other errors
  }

  // Fetch audience metrics ONCE per store (not per period — audience is a snapshot)
  // Wrapped in try-catch: fetchAudienceForStore re-throws KlaviyoPermissionError/KlaviyoRateLimitError
  let audience = { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }
  try {
    const audienceResult = await fetchAudienceForStore(apiKey)
    if (audienceResult.success && audienceResult.data) {
      audience = audienceResult.data
      log.info(`[Cron] ${store.store_name}: audience totalLeads=${audience.totalLeads} engagedLeads=${audience.engagedLeads} rate=${audience.engagementRate}%`)

      // Persist individual audience items (lists + segments) to klaviyo_audiences table
      if (audienceResult.data.items.length > 0) {
        await upsertAudiences(supabase, store, audienceResult.data.items)
      }
    } else {
      log.warn(`[Cron] Failed to fetch audience for ${store.store_name}: ${audienceResult.error || "unknown"}`)
      // Continue with 0s — audience is optional
    }
  } catch (err) {
    // KlaviyoPermissionError / KlaviyoRateLimitError bubble up to syncStore's caller
    if (err instanceof KlaviyoPermissionError) throw err
    if (err instanceof KlaviyoRateLimitError) throw err
    // Other errors: log and continue with 0s (audience is optional)
    log.warn(`[Cron] Unexpected error fetching audience for ${store.store_name}:`, err)
  }

  // Sync each period
  let consecutiveRateLimits = 0
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
        consecutiveRateLimits = 0 // reset on success
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
        await upsertSyncError(supabase, store, period, accountInfo.timezone, msg)
      }
    } catch (err) {
      // KlaviyoRateLimitError in period loop: try next period, break after 2 consecutive
      if (err instanceof KlaviyoRateLimitError) {
        consecutiveRateLimits++
        const errorMsg = `[RATE_LIMIT] ${err.message}`
        log.warn(`[Cron] ${store.store_name}/${period}: ${errorMsg}`)
        results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: errorMsg })
        await upsertSyncError(supabase, store, period, accountInfo.timezone, errorMsg)

        // Backoff before trying next period (cap at 15s to not waste cron budget)
        const waitMs = Math.min(err.retryAfterMs || 5000, 15000)
        log.warn(`[Cron] Rate limited for ${store.store_name}/${period}, waiting ${waitMs}ms before next period`)
        await new Promise(resolve => setTimeout(resolve, waitMs))

        if (consecutiveRateLimits >= 3) {
          log.warn(`[Cron] 3+ consecutive rate limits for ${store.store_name}, skipping remaining periods`)
          break
        }
        continue
      }

      // KlaviyoPermissionError in period loop: scope missing for specific endpoint (e.g. flow-values-reports)
      if (err instanceof KlaviyoPermissionError) {
        const scopes = err.missingScopes.join(", ")
        const errorMsg = `[PERMISSION] Klaviyo API key missing scopes: ${scopes}`
        log.warn(`[Cron] ${store.store_name}/${period}: ${errorMsg}`)
        results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: errorMsg })
        await upsertSyncError(supabase, store, period, accountInfo.timezone, errorMsg)

        // Update client_stores validation fields
        try {
          await supabase
            .from("client_stores")
            .update({
              klaviyo_validation_error: errorMsg,
              klaviyo_missing_scopes: err.missingScopes,
              klaviyo_validated_at: new Date().toISOString(),
              klaviyo_has_reporting_access: false,
            })
            .eq("id", store.id)
        } catch { /* Don't fail on client_stores update error */ }

        break // If a scope is missing, all periods will fail
      }

      if (err instanceof KlaviyoInvalidKeyError) {
        const errorMsg = `[INVALID_KEY] ${err.message}`
        log.warn(`[Cron] ${store.store_name}/${period}: ${errorMsg}`)
        results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: errorMsg })
        await upsertSyncError(supabase, store, period, accountInfo.timezone, errorMsg)

        try {
          await supabase
            .from("client_stores")
            .update({
              klaviyo_validation_error: errorMsg,
              klaviyo_validated_at: new Date().toISOString(),
              klaviyo_has_reporting_access: false,
            })
            .eq("id", store.id)
        } catch { /* Don't fail on client_stores update error */ }

        break // Invalid key won't work for any period
      }

      const msg = err instanceof Error ? err.message : "Unknown error"
      log.warn(`[Cron] Error syncing ${store.store_name}/${period}:`, err)
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "error", error: msg })
      await upsertSyncError(supabase, store, period, accountInfo.timezone, msg)
    }
  }

  return results
}

// ==============================
// Main handler
// ==============================

export async function GET(request: NextRequest) {
  try {
    const authError = requireCronAuth(request)
    if (authError) return authError

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
        .select("id, store_name, org_id, klaviyo_has_reporting_access, klaviyo_validated_at, klaviyo_missing_scopes")
        .or(KLAVIYO_CREDENTIALS_FILTER)
        .not("org_id", "is", null)

      if (storesError || !stores) {
        log.error("[Cron] Failed to fetch stores:", storesError)
        return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
      }

      // Filter out stores with recent permission failures (retry after 24h)
      const now = Date.now()
      const retryThreshold = new Date(now - PERMISSION_RETRY_MS).toISOString()

      const skippedPermission: { name: string; scopes: string[]; validatedAt: string }[] = []
      const eligibleStores = stores.filter(store => {
        // Include if has reporting access or field is null/undefined
        if (store.klaviyo_has_reporting_access !== false) return true
        // Include if validation timestamp is missing (treat as needing retry)
        if (!store.klaviyo_validated_at) return true
        // Include if validation is older than 24h (retry)
        if (store.klaviyo_validated_at < retryThreshold) return true
        // Skip — recent permission failure
        const minutesAgo = Math.round((now - new Date(store.klaviyo_validated_at).getTime()) / (60 * 1000))
        const timeAgo = minutesAgo < 60 ? `${minutesAgo}min ago` : `${Math.round(minutesAgo / 60)}h ago`
        skippedPermission.push({
          name: store.store_name,
          scopes: store.klaviyo_missing_scopes ?? [],
          validatedAt: timeAgo,
        })
        return false
      })

      if (skippedPermission.length > 0) {
        const details = skippedPermission
          .map(s => `${s.name} (missing ${s.scopes.join(", ") || "unknown scopes"}, validated ${s.validatedAt})`)
          .join(", ")
        log.warn(`[Cron] Skipping ${skippedPermission.length} stores with recent permission failures: ${details}`)
      }

      log.info(`[Cron] Found ${stores.length} stores with credentials, processing ${eligibleStores.length} (skipping ${skippedPermission.length} with recent permission failures)`)
      log.info(`[Cron] ${eligibleStores.length} stores × ${CACHED_PERIODS.length} periods`)

      const allResults: CronSyncResult[] = []
      let timedOut = false

      // Step 1: Fetch API keys and group stores by Klaviyo API key
      const apiKeyGroups = new Map<string, StoreRow[]>()
      const skippedNoKey: string[] = []

      for (const store of eligibleStores) {
        try {
          const credentials = await getStoreCredentials(store.id)
          const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
          if (!apiKey) {
            skippedNoKey.push(store.store_name)
            continue
          }
          const existing = apiKeyGroups.get(apiKey)
          if (existing) {
            existing.push(store as StoreRow)
          } else {
            apiKeyGroups.set(apiKey, [store as StoreRow])
          }
        } catch {
          skippedNoKey.push(store.store_name)
        }
      }

      if (skippedNoKey.length > 0) {
        log.warn(`[Cron] Skipped ${skippedNoKey.length} stores with no valid API key: ${skippedNoKey.join(", ")}`)
      }

      const groups = Array.from(apiKeyGroups.entries())
      const groupSizes = groups.map(g => g[1].length)
      log.info(`[Cron] ${eligibleStores.length} stores grouped into ${groups.length} API key groups: [${groupSizes.join(", ")}]`)

      // Log which group each store belongs to (masked key, not plaintext)
      groups.forEach(([apiKey, groupStores], groupIdx) => {
        const maskedKey = `...${apiKey.slice(-4)}`
        for (const s of groupStores) {
          log.info(`[Cron] Store "${s.store_name}" → API key group #${groupIdx + 1} (${groupStores.length} stores in group, key ${maskedKey})`)
        }
      })

      // Step 2: Process groups in batches of MAX_PARALLEL_GROUPS
      for (let i = 0; i < groups.length; i += MAX_PARALLEL_GROUPS) {
        if (Date.now() - startTime > MAX_DURATION_MS) {
          timedOut = true
          log.warn(`[Cron] Timeout approaching at group batch ${i}/${groups.length}`)
          break
        }

        const groupBatch = groups.slice(i, i + MAX_PARALLEL_GROUPS)

        const groupResults = await Promise.allSettled(
          groupBatch.map(async ([, groupStores]) => {
            const results: CronSyncResult[] = []
            for (let j = 0; j < groupStores.length; j++) {
              if (Date.now() - startTime > MAX_DURATION_MS) {
                // Mark remaining stores as skipped due to timeout
                for (let k = j; k < groupStores.length; k++) {
                  for (const period of CACHED_PERIODS) {
                    results.push({
                      storeId: groupStores[k].id,
                      storeName: groupStores[k].store_name,
                      period,
                      status: "skipped",
                      error: "timeout",
                    })
                  }
                }
                break
              }

              const storeResults = await syncStore(groupStores[j], CACHED_PERIODS, supabase, startTime)
              results.push(...storeResults)

              // Delay between stores in the same API key group
              if (j < groupStores.length - 1) {
                await new Promise(resolve => setTimeout(resolve, INTRA_GROUP_DELAY_MS))
              }
            }
            return results
          })
        )

        // Collect results from all groups in this batch
        for (let g = 0; g < groupResults.length; g++) {
          const result = groupResults[g]
          if (result.status === "fulfilled") {
            allResults.push(...result.value)
          } else {
            const msg = result.reason instanceof Error ? result.reason.message : "Unknown error"
            const failedStores = groupBatch[g][1]
            for (const s of failedStores) {
              for (const period of CACHED_PERIODS) {
                allResults.push({
                  storeId: s.id,
                  storeName: s.store_name,
                  period,
                  status: "error",
                  error: msg,
                })
              }
            }
          }
        }

        // Delay between batches of groups
        if (i + MAX_PARALLEL_GROUPS < groups.length) {
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }

      const elapsed = Date.now() - startTime
      const okCount = allResults.filter(r => r.status === "ok").length
      const errorCount = allResults.filter(r => r.status === "error").length
      const skippedCount = allResults.filter(r => r.status === "skipped").length

      // CA7: Log rate limit summary for observability
      const rateLimitResults = allResults.filter(r => r.error?.includes("RATE_LIMIT"))
      if (rateLimitResults.length > 0) {
        const affectedStores = new Set(rateLimitResults.map(r => r.storeName))
        log.warn(`[Cron] Rate limit summary: ${rateLimitResults.length} periods affected across ${affectedStores.size} stores: ${[...affectedStores].join(", ")}`)
      }

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
