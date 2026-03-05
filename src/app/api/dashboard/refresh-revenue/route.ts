import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { KLAVIYO_CREDENTIALS_FILTER, getStoreCredentials } from "@/lib/services/credentials.service"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import {
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
} from "@/lib/services/klaviyo-sync.service"
import { upsertSyncResults } from "@/lib/services/sync-persistence.service"

const log = logger.child("RefreshRevenue")

export const maxDuration = 120
export const dynamic = "force-dynamic"

const LOCK_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ── Lock helpers (reuses cron_locks table) ────────────────────────────────

function lockName(orgId: string, period: string): string {
  return `refresh_${orgId}_${period}`
}

async function acquireRefreshLock(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<{ acquired: boolean; lockedSince?: string }> {
  const name = lockName(orgId, period)

  const { data: existing } = await supabase
    .from("cron_locks")
    .select("is_running, started_at")
    .eq("lock_name", name)
    .single()

  if (existing?.is_running && existing.started_at) {
    const startedAt = new Date(existing.started_at).getTime()
    if (Date.now() - startedAt < LOCK_TTL_MS) {
      return { acquired: false, lockedSince: existing.started_at }
    }
    log.warn(`[RefreshRevenue] Stale lock detected for ${name}, overriding`)
  }

  await supabase
    .from("cron_locks")
    .upsert({
      lock_name: name,
      is_running: true,
      started_at: new Date().toISOString(),
    }, { onConflict: "lock_name" })

  return { acquired: true }
}

async function releaseRefreshLock(
  supabase: SupabaseClient,
  orgId: string,
  period: string,
): Promise<void> {
  await supabase
    .from("cron_locks")
    .update({
      is_running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("lock_name", lockName(orgId, period))
}

// ── Store sync (extracted from cron logic) ────────────────────────────────

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
}

async function refreshStoreForPeriod(
  supabase: SupabaseClient,
  store: StoreRow,
  period: string,
): Promise<{ status: "ok" | "error"; error?: string }> {
  const credentials = await getStoreCredentials(store.id)
  const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
  if (!apiKey) return { status: "error", error: "No API key" }

  try {
    const accountInfo = await getCachedAccountInfo(apiKey, store.org_id ?? undefined, store.id)
    const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
    const metricId = await getCachedPlacedOrderMetric(apiKey, store.org_id ?? undefined, store.id)

    if (!metricId) return { status: "error", error: "No Placed Order metric" }

    const [flowNames, campNames] = await Promise.all([
      fetchFlowNames(apiKey),
      fetchCampaignNames(apiKey),
    ])

    const audience = await fetchAudienceForStore(apiKey)
    const audienceData = audience.success && audience.data
      ? audience.data
      : { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }

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
      await upsertSyncResults(supabase, store, result.data, period, audienceData)
      return { status: "ok" }
    }

    return { status: "error", error: result.error || "Sync failed" }
  } catch (err) {
    if (err instanceof KlaviyoPermissionError) {
      return { status: "error", error: `Permission denied: ${err.missingScopes.join(", ")}` }
    }
    if (err instanceof KlaviyoRateLimitError) {
      return { status: "error", error: `Rate limited (retry after ${err.retryAfterMs}ms)` }
    }
    if (err instanceof KlaviyoInvalidKeyError) {
      return { status: "error", error: `Invalid key: ${err.message}` }
    }
    return { status: "error", error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ── POST Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json().catch(() => ({}))
    const period = body.period || "30d"

    if (!(CACHED_PERIODS as readonly string[]).includes(period)) {
      return NextResponse.json(
        { success: false, error: `Invalid period: ${period}. Use: ${CACHED_PERIODS.join(", ")}` },
        { status: 400 }
      )
    }

    const orgId = await resolveOrgId(user.id)
    const adminClient = createAdminClient()

    // Try to acquire lock
    const { acquired, lockedSince } = await acquireRefreshLock(adminClient, orgId, period)
    if (!acquired) {
      log.info(`[RefreshRevenue] Already running for org ${orgId}/${period} since ${lockedSince}`)
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        lockedSince,
      })
    }

    log.info(`[RefreshRevenue] Starting refresh for org ${orgId}/${period}`)

    try {
      // Get ALL stores with Klaviyo credentials for this org
      const { data: stores, error: storesError } = await adminClient
        .from("client_stores")
        .select("id, store_name, org_id")
        .eq("org_id", orgId)
        .or(KLAVIYO_CREDENTIALS_FILTER)

      if (storesError || !stores || stores.length === 0) {
        log.warn("[RefreshRevenue] No stores found for org", orgId)
        return NextResponse.json({ success: true, storesRefreshed: 0, durationMs: Date.now() - startTime })
      }

      // Refresh ALL stores sequentially (consistency: same moment, same rates)
      let okCount = 0
      let errorCount = 0

      for (const store of stores) {
        const result = await refreshStoreForPeriod(adminClient, store as StoreRow, period)
        if (result.status === "ok") {
          okCount++
          log.info(`[RefreshRevenue] OK: ${store.store_name}/${period}`)
        } else {
          errorCount++
          log.warn(`[RefreshRevenue] Error: ${store.store_name}/${period}: ${result.error}`)
        }

        // Small delay between stores to respect Klaviyo rate limits
        if (stores.indexOf(store) < stores.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      const durationMs = Date.now() - startTime
      log.info(`[RefreshRevenue] Completed org ${orgId}/${period}: ok=${okCount} error=${errorCount} duration=${durationMs}ms`)

      return NextResponse.json({
        success: true,
        alreadyRunning: false,
        storesRefreshed: okCount,
        storeErrors: errorCount,
        durationMs,
      })
    } finally {
      await releaseRefreshLock(adminClient, orgId, period)
    }
  } catch (error) {
    return errorResponse(request, error, "RefreshRevenue POST")
  }
}
