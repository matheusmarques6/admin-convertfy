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
  getAllReportQuotaUsage,
  getReportQuotaUsage,
  DAILY_REPORT_QUOTA_LIMIT,
  XS_BUDGET_PER_CYCLE,
  type KlaviyoAccountInfo,
} from "@/lib/integrations/klaviyo"
import { CACHED_PERIODS, PERIOD_FRESHNESS_THRESHOLDS, type CachedPeriod } from "@/lib/shared/data-status"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
  type FlowNameInfo,
  type CampaignNameInfo,
} from "@/lib/services/klaviyo-sync.service"
import { upsertSyncResults, upsertAudiences } from "@/lib/services/sync-persistence.service"

const log = logger.child("CronSyncReports")

export const maxDuration = 300
export const dynamic = "force-dynamic"

// 3 groups = ~3 concurrent API key streams; safe because rate limiter is per-call
const MAX_PARALLEL_GROUPS = 3
const INTRA_GROUP_DELAY_MS = 1000 // reduced from 2500ms — global rate limiter (1200ms/req) handles spacing
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

// ==============================
// AK-12: Per-cycle XS budget tracking per API key group
// ==============================

/** Tracks XS (reporting) calls used during THIS cron cycle, per API key.
 *  Uses the daily quota counter from AK-2 as the source of truth —
 *  snapshots the counter at cycle start and computes delta. */
class CycleBudgetTracker {
  /** Snapshot of daily quota counter at the start of this cycle, per API key */
  private readonly snapshots = new Map<string, number>()
  /** Number of stores skipped due to budget cap, per API key */
  private readonly skippedCounts = new Map<string, number>()
  private readonly budget: number

  constructor(budget = XS_BUDGET_PER_CYCLE) {
    this.budget = budget
  }

  /** Take a snapshot of the current daily quota for this API key (call once before processing a group). */
  snapshot(apiKey: string): void {
    if (!this.snapshots.has(apiKey)) {
      this.snapshots.set(apiKey, getReportQuotaUsage(apiKey).used)
    }
  }

  /** How many XS calls this key group has used in the current cycle. */
  used(apiKey: string): number {
    const snap = this.snapshots.get(apiKey) ?? 0
    return getReportQuotaUsage(apiKey).used - snap
  }

  /** True if the key group has hit or exceeded the per-cycle budget. */
  isExhausted(apiKey: string): boolean {
    return this.used(apiKey) >= this.budget
  }

  /** Record a store as skipped due to budget cap. */
  recordSkipped(apiKey: string): void {
    this.skippedCounts.set(apiKey, (this.skippedCounts.get(apiKey) ?? 0) + 1)
  }

  /** Get budget summary for a key (for logging). */
  getSummary(apiKey: string): { used: number; limit: number; skipped: number } {
    return {
      used: this.used(apiKey),
      limit: this.budget,
      skipped: this.skippedCounts.get(apiKey) ?? 0,
    }
  }

  /** Get all tracked API keys. */
  getTrackedKeys(): string[] {
    return Array.from(this.snapshots.keys())
  }
}

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
  klaviyo_has_reporting_access?: boolean
  klaviyo_validated_at?: string
  klaviyo_missing_scopes?: string[]
}

/** Pre-fetched data shared across stores in the same API key group */
interface PreFetchedGroupData {
  accountInfo: KlaviyoAccountInfo
  timezoneOffset: string
  metricId: string
  flowNames: Map<string, FlowNameInfo>
  campNames: Map<string, CampaignNameInfo>
}

/** Map of period_label → fetched_at Date (or null if no fresh entry) */
type FreshnessMap = Map<string, Date | null>

// ==============================
// Freshness helpers (Story 55.1)
// ==============================

/** Batch-fetch freshness for ALL stores in a group in a single query.
 *  Returns Map<storeId, FreshnessMap>. */
async function getGroupFreshness(
  supabase: SupabaseClient,
  storeIds: string[],
): Promise<Map<string, FreshnessMap>> {
  const result = new Map<string, FreshnessMap>()
  // Initialize empty maps so callers don't need to null-check
  for (const id of storeIds) result.set(id, new Map())

  const { data, error } = await supabase
    .from("store_revenue_summary")
    .select("store_id, period_label, fetched_at")
    .in("store_id", storeIds)
    .in("sync_status", ["ok", "partial"])

  if (error) {
    log.warn("[Cron] Failed to fetch freshness data, will sync all periods:", error.message)
    return result
  }

  for (const row of data ?? []) {
    const map = result.get(row.store_id)
    if (map) {
      map.set(row.period_label, row.fetched_at ? new Date(row.fetched_at) : null)
    }
  }
  return result
}

/** Filter periods based on freshness thresholds. Returns periods that NEED syncing. */
function filterFreshPeriods(
  periods: readonly string[],
  freshness: FreshnessMap,
  now: number,
): { toSync: string[]; skipped: string[] } {
  const toSync: string[] = []
  const skipped: string[] = []

  for (const period of periods) {
    const threshold = PERIOD_FRESHNESS_THRESHOLDS[period as CachedPeriod] ?? 0
    if (threshold === 0) {
      toSync.push(period)
      continue
    }

    const fetchedAt = freshness.get(period)
    if (!fetchedAt) {
      // No cached data — must sync
      toSync.push(period)
      continue
    }

    const ageMs = now - fetchedAt.getTime()
    if (ageMs < threshold) {
      const agoMin = Math.round(ageMs / 60_000)
      skipped.push(`${period}=${agoMin}min ago`)
    } else {
      toSync.push(period)
    }
  }

  return { toSync, skipped }
}

/** Get oldest fetched_at for a store (MIN across all periods). null = no data (highest priority). */
function getOldestFetchedAt(freshness: FreshnessMap): number | null {
  let oldest: number | null = null
  for (const date of freshness.values()) {
    if (!date) return null // any missing period = treat as brand new
    const ts = date.getTime()
    if (oldest === null || ts < oldest) oldest = ts
  }
  return oldest
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
  preFetched?: PreFetchedGroupData,
  apiKeyOverride?: string,
  freshness?: FreshnessMap,
): Promise<CronSyncResult[]> {
  const results: CronSyncResult[] = []

  // Story 55.1: filter out fresh periods
  const { toSync, skipped } = filterFreshPeriods(periods, freshness ?? new Map(), Date.now())
  if (skipped.length > 0) {
    log.info(`[Cron] ${store.store_name}: syncing ${toSync.length}/${periods.length} periods (skipped ${skipped.join(", ")})`)
    // Add skipped results
    for (const skipInfo of skipped) {
      const period = skipInfo.split("=")[0]
      results.push({ storeId: store.id, storeName: store.store_name, period, status: "skipped", error: `fresh (fetched ${skipInfo.split("=")[1]})` })
    }
  }

  if (toSync.length === 0) {
    log.info(`[Cron] ${store.store_name}: all periods fresh, nothing to sync`)
    return results
  }

  let apiKey: string
  if (apiKeyOverride) {
    apiKey = apiKeyOverride
  } else {
    const credentials = await getStoreCredentials(store.id)
    const key = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (!key) {
      return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No valid API key" }))
    }
    apiKey = key
  }

  // Use pre-fetched group data if available, otherwise fetch per-store (backward compat)
  let accountInfo: KlaviyoAccountInfo
  let timezoneOffset: string
  let metricId: string
  let flowNames: Map<string, FlowNameInfo>
  let campNames: Map<string, CampaignNameInfo>

  if (preFetched) {
    accountInfo = preFetched.accountInfo
    timezoneOffset = preFetched.timezoneOffset
    metricId = preFetched.metricId
    flowNames = preFetched.flowNames
    campNames = preFetched.campNames
    log.info(`[Cron] ${store.store_name}: using shared group data (${flowNames.size} flows, ${campNames.size} campaigns)`)
  } else {
    // Fallback: pre-fetch per store (original behavior)
    try {
      accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined, store.id)
      timezoneOffset = getTimezoneOffset(accountInfo.timezone)
      const mid = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined, store.id)

      if (!mid) {
        return periods.map(p => ({ storeId: store.id, storeName: store.store_name, period: p, status: "skipped" as const, error: "No Placed Order metric" }))
      }
      metricId = mid

      ;[flowNames, campNames] = await Promise.all([
        fetchFlowNames(apiKey),
        fetchCampaignNames(apiKey),
      ])
    } catch (err) {
      if (err instanceof KlaviyoPermissionError) {
        const scopes = err.missingScopes.join(", ")
        const errorMsg = `[PERMISSION] Klaviyo API key missing scopes: ${scopes}`
        log.warn(`[Cron] ${store.store_name}: ${errorMsg}`)

        const defaultTz = "UTC"
        await Promise.all(
          periods.map(p => upsertSyncError(supabase, store, p, defaultTz, errorMsg))
        )

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
      throw err
    }
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

  // Sync each period (only non-fresh ones)
  let consecutiveRateLimits = 0
  for (const period of toSync) {
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

      const { data: metricsCleanResult } = await supabase.rpc("clean_expired_metrics")
      if (metricsCleanResult && metricsCleanResult > 0) {
        log.info(`[Cron] Cleaned ${metricsCleanResult} expired flow/campaign metric rows`)
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

      // Story 55.5: Fetch freshness for ALL eligible stores upfront (one query)
      const allStoreIds = eligibleStores.map(s => s.id)
      const allFreshness = await getGroupFreshness(supabase, allStoreIds)

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

      // Story 55.5: Sort stores WITHIN each group by oldest_fetched_at ASC (stalest first, NULL = highest priority)
      for (const [, groupStores] of apiKeyGroups) {
        groupStores.sort((a, b) => {
          const aOldest = getOldestFetchedAt(allFreshness.get(a.id) ?? new Map())
          const bOldest = getOldestFetchedAt(allFreshness.get(b.id) ?? new Map())
          if (aOldest === null && bOldest === null) return 0
          if (aOldest === null) return -1
          if (bOldest === null) return 1
          return aOldest - bOldest
        })
      }

      // Story 55.5: Sort groups by MIN(oldest_fetched_at) — groups with stalest stores first
      // ?? 0 ensures NULL (no data / new stores) sorts first (epoch 0 < any real timestamp)
      const groups = Array.from(apiKeyGroups.entries()).sort((a, b) => {
        const aMin = Math.min(...a[1].map(s => getOldestFetchedAt(allFreshness.get(s.id) ?? new Map()) ?? 0))
        const bMin = Math.min(...b[1].map(s => getOldestFetchedAt(allFreshness.get(s.id) ?? new Map()) ?? 0))
        return aMin - bMin
      })

      const groupSizes = groups.map(g => g[1].length)
      log.info(`[Cron] ${eligibleStores.length} stores grouped into ${groups.length} API key groups: [${groupSizes.join(", ")}]`)

      // Story 55.5: Log processing order with staleness
      const orderLog = groups.flatMap(([, groupStores]) =>
        groupStores.map(s => {
          const oldest = getOldestFetchedAt(allFreshness.get(s.id) ?? new Map())
          if (oldest === null) return `${s.store_name} (NEW)`
          const agoMin = Math.round((Date.now() - oldest) / 60_000)
          const agoStr = agoMin < 60 ? `${agoMin}min` : `${Math.round(agoMin / 60)}h`
          return `${s.store_name} (stale ${agoStr})`
        })
      )
      log.info(`[Cron] Processing order: ${orderLog.join(", ")}`)

      // AK-12: Initialize per-cycle XS budget tracker
      const budgetTracker = new CycleBudgetTracker()

      // Step 2: Process groups in batches of MAX_PARALLEL_GROUPS
      for (let i = 0; i < groups.length; i += MAX_PARALLEL_GROUPS) {
        if (Date.now() - startTime > MAX_DURATION_MS) {
          timedOut = true
          log.warn(`[Cron] Timeout approaching at group batch ${i}/${groups.length}`)
          break
        }

        const groupBatch = groups.slice(i, i + MAX_PARALLEL_GROUPS)

        const groupResults = await Promise.allSettled(
          groupBatch.map(async ([groupApiKey, groupStores]) => {
            const results: CronSyncResult[] = []
            const maskedKey = `...${groupApiKey.slice(-4)}`
            const firstStore = groupStores[0]

            // AK-12: Snapshot daily quota counter before processing this group
            budgetTracker.snapshot(groupApiKey)

            // Pre-fetch shared data ONCE per API key group
            let groupData: PreFetchedGroupData | undefined
            try {
              const accountInfo = await getCachedAccountInfo(groupApiKey, firstStore.org_id ?? undefined, firstStore.id)
              const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
              const metricId = await getCachedPlacedOrderMetric(groupApiKey, firstStore.org_id ?? undefined, firstStore.id)

              if (!metricId) {
                log.warn(`[Cron] Group ${maskedKey}: No Placed Order metric — skipping all ${groupStores.length} stores`)
                for (const s of groupStores) {
                  for (const period of CACHED_PERIODS) {
                    results.push({ storeId: s.id, storeName: s.store_name, period, status: "skipped", error: "No Placed Order metric" })
                  }
                }
                return results
              }

              const [flowNames, campNames] = await Promise.all([
                fetchFlowNames(groupApiKey),
                fetchCampaignNames(groupApiKey),
              ])

              groupData = { accountInfo, timezoneOffset, metricId, flowNames, campNames }
              log.info(`[Cron] Group ${maskedKey}: pre-fetched ${flowNames.size} flows, ${campNames.size} campaigns — sharing across ${groupStores.length} stores`)
            } catch (err) {
              if (err instanceof KlaviyoPermissionError) {
                const scopes = err.missingScopes.join(", ")
                const errorMsg = `[PERMISSION] Klaviyo API key missing scopes: ${scopes}`
                log.warn(`[Cron] Group ${maskedKey}: ${errorMsg} — failing all ${groupStores.length} stores`)
                for (const s of groupStores) {
                  const defaultTz = "UTC"
                  await Promise.all(
                    CACHED_PERIODS.map(p => upsertSyncError(supabase, s as StoreRow, p, defaultTz, errorMsg))
                  )
                  try {
                    await supabase
                      .from("client_stores")
                      .update({
                        klaviyo_validation_error: errorMsg,
                        klaviyo_missing_scopes: err.missingScopes,
                        klaviyo_validated_at: new Date().toISOString(),
                        klaviyo_has_reporting_access: false,
                      })
                      .eq("id", s.id)
                  } catch { /* Don't fail on client_stores update */ }
                  for (const period of CACHED_PERIODS) {
                    results.push({ storeId: s.id, storeName: s.store_name, period, status: "error", error: errorMsg })
                  }
                }
                return results
              }
              if (err instanceof KlaviyoInvalidKeyError) {
                const errorMsg = `[INVALID_KEY] ${err.message}`
                log.warn(`[Cron] Group ${maskedKey}: ${errorMsg} — failing all ${groupStores.length} stores`)
                for (const s of groupStores) {
                  const defaultTz = "UTC"
                  await Promise.all(
                    CACHED_PERIODS.map(p => upsertSyncError(supabase, s as StoreRow, p, defaultTz, errorMsg))
                  )
                  try {
                    await supabase
                      .from("client_stores")
                      .update({
                        klaviyo_validation_error: errorMsg,
                        klaviyo_validated_at: new Date().toISOString(),
                        klaviyo_has_reporting_access: false,
                      })
                      .eq("id", s.id)
                  } catch { /* Don't fail on client_stores update */ }
                  for (const period of CACHED_PERIODS) {
                    results.push({ storeId: s.id, storeName: s.store_name, period, status: "error", error: errorMsg })
                  }
                }
                return results
              }
              if (err instanceof KlaviyoRateLimitError) {
                const errorMsg = `[RATE_LIMIT] Klaviyo rate limited during group pre-fetch (Retry-After: ${err.retryAfterMs}ms)`
                log.warn(`[Cron] Group ${maskedKey}: ${errorMsg} — marking all ${groupStores.length} stores as error (preserving existing data)`)
                // Don't fall back to per-store pre-fetch — it would hit the same rate limit,
                // wasting time budget and API calls. Instead, use upsertSyncError which
                // preserves existing OK/partial data.
                for (const s of groupStores) {
                  const defaultTz = "UTC"
                  await Promise.all(
                    CACHED_PERIODS.map(p => upsertSyncError(supabase, s as StoreRow, p, defaultTz, errorMsg))
                  )
                  for (const period of CACHED_PERIODS) {
                    results.push({ storeId: s.id, storeName: s.store_name, period, status: "error", error: errorMsg })
                  }
                }
                return results
              } else {
                log.warn(`[Cron] Group ${maskedKey}: unexpected error during pre-fetch, falling back to per-store`, err)
                // Fall through: groupData stays undefined
              }
            }

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

              // AK-12: Check per-cycle XS budget before syncing this store.
              // If budget is exhausted, skip remaining stores in this key group.
              // Story 55.5 freshness-based ordering ensures skipped stores (less fresh)
              // are naturally prioritized in the next cron cycle.
              if (budgetTracker.isExhausted(groupApiKey)) {
                for (let k = j; k < groupStores.length; k++) {
                  budgetTracker.recordSkipped(groupApiKey)
                  for (const period of CACHED_PERIODS) {
                    results.push({
                      storeId: groupStores[k].id,
                      storeName: groupStores[k].store_name,
                      period,
                      status: "skipped",
                      error: "skipped:budget",
                    })
                  }
                }
                const summary = budgetTracker.getSummary(groupApiKey)
                log.warn(`[Cron] API key ${maskedKey} hit XS budget cap (${summary.limit}) — ${summary.skipped} stores skipped, will retry next cycle`)
                break
              }

              const storeFreshness = allFreshness.get(groupStores[j].id)
              const storeResults = await syncStore(groupStores[j], CACHED_PERIODS, supabase, startTime, groupData, groupApiKey, storeFreshness)
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

        // Delay between batches of groups (rate limiter handles per-call spacing)
        if (i + MAX_PARALLEL_GROUPS < groups.length) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      }

      const elapsed = Date.now() - startTime
      const okCount = allResults.filter(r => r.status === "ok").length
      const errorCount = allResults.filter(r => r.status === "error").length
      const skippedCount = allResults.filter(r => r.status === "skipped").length

      // Story 55.1: Log freshness skip summary
      const freshSkipped = allResults.filter(r => r.status === "skipped" && r.error?.startsWith("fresh"))
      if (freshSkipped.length > 0) {
        const totalPeriods = allResults.length
        const syncedCount = allResults.filter(r => r.status === "ok" || r.status === "error").length
        log.info(`[Cron] Freshness: ${syncedCount}/${totalPeriods} periods synced, ${freshSkipped.length} skipped (fresh)`)
      }

      // CA7: Log rate limit summary for observability
      const rateLimitResults = allResults.filter(r => r.error?.includes("RATE_LIMIT"))
      if (rateLimitResults.length > 0) {
        const affectedStores = new Set(rateLimitResults.map(r => r.storeName))
        log.warn(`[Cron] Rate limit summary: ${rateLimitResults.length} periods affected across ${affectedStores.size} stores: ${[...affectedStores].join(", ")}`)
      }

      // Story 55.5: Log store coverage
      const processedStores = new Set(allResults.filter(r => r.status === "ok" || r.status === "error").map(r => r.storeId))
      const timeoutStores = new Set(allResults.filter(r => r.error === "timeout").map(r => r.storeId))
      const totalStores = new Set(allResults.map(r => r.storeId)).size
      if (timeoutStores.size > 0) {
        log.warn(`[Cron] Processed ${processedStores.size}/${totalStores} stores (${timeoutStores.size} skipped by timeout — will be prioritized next run)`)
      } else {
        log.info(`[Cron] Processed ${processedStores.size}/${totalStores} stores (0 skipped by timeout)`)
      }

      // AK-2: Log report quota usage per API key group
      const quotaUsage = getAllReportQuotaUsage()
      const quotaSummary: Record<string, { used: number; limit: number }> = {}
      const quotaWarnings: string[] = []
      for (const [qApiKey, quota] of quotaUsage) {
        const kid = `...${qApiKey.slice(-4)}`
        quotaSummary[kid] = { used: quota.used, limit: quota.limit }
        if (quota.used >= DAILY_REPORT_QUOTA_LIMIT * 0.8) {
          quotaWarnings.push(`${kid}: ${quota.used}/${quota.limit}`)
        }
      }
      if (Object.keys(quotaSummary).length > 0) {
        log.info(`[Cron] Report quota usage: ${JSON.stringify(quotaSummary)}`)
      }
      if (quotaWarnings.length > 0) {
        log.warn(`[Cron] Report quota warning — keys near limit: ${quotaWarnings.join(", ")}`)
      }

      // AK-12: Log per-cycle XS budget usage per API key group
      const xsBudgetSummary: Record<string, { used: number; limit: number; skipped: number }> = {}
      for (const apiKey of budgetTracker.getTrackedKeys()) {
        const kid = `...${apiKey.slice(-4)}`
        xsBudgetSummary[kid] = budgetTracker.getSummary(apiKey)
      }
      if (Object.keys(xsBudgetSummary).length > 0) {
        log.info(`[Cron] XS budget usage (this cycle): ${JSON.stringify(xsBudgetSummary)}`)
      }
      // Budget skip summary
      const budgetSkipped = allResults.filter(r => r.error === "skipped:budget")
      if (budgetSkipped.length > 0) {
        const budgetSkippedStores = new Set(budgetSkipped.map(r => r.storeName))
        log.warn(`[Cron] Budget skip summary: ${budgetSkipped.length} period-slots skipped across ${budgetSkippedStores.size} stores due to XS budget cap`)
      }

      log.info(`[Cron] Sync completed in ${elapsed}ms. ok=${okCount} error=${errorCount} skipped=${skippedCount}${timedOut ? " (timed out)" : ""}`)

      return NextResponse.json({
        status: timedOut ? "partial" : errorCount > 0 ? "partial" : "ok",
        elapsed: `${elapsed}ms`,
        cleanedCacheEntries: cleanedCount,
        summary: { ok: okCount, error: errorCount, skipped: skippedCount },
        reportQuota: quotaSummary,
        xsBudget: xsBudgetSummary,
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
