import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { ANY_EMAIL_PLATFORM_FILTER, KLAVIYO_CREDENTIALS_FILTER, getStoreCredentials } from "@/lib/services/credentials.service"
import {
  CACHED_PERIODS,
  buildCustomPeriodLabel,
  parseCustomPeriodLabel,
} from "@/lib/shared/data-status"
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
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { detectStorePlatform } from "@/lib/services/report-platform.service"
import { upsertSyncResults, upsertOmnisendSyncResults } from "@/lib/services/sync-persistence.service"

const log = logger.child("RefreshRevenue")

// Vercel Pro: max 300s. Antes era 120 e estourava com varias stores.
// Mesmo assim, paramos antes pra retornar parcial gracefully (vide deadline).
export const maxDuration = 300
export const dynamic = "force-dynamic"

const LOCK_TTL_MS = 5 * 60 * 1000 // 5 minutes
// Deadline interno: para o loop ~30s antes do maxDuration pra dar tempo
// de liberar lock + responder antes do Vercel cortar (504).
const LOOP_DEADLINE_MS = 270_000

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
  const now = new Date().toISOString()
  const ttlSeconds = Math.floor(LOCK_TTL_MS / 1000)

  // Atomic lock: INSERT or UPDATE only if not currently locked (or lock is stale)
  const { data, error } = await supabase.rpc("acquire_cron_lock", {
    p_lock_name: name,
    p_ttl_seconds: ttlSeconds,
    p_now: now,
  })

  if (error) {
    // Fallback: if RPC doesn't exist, use non-atomic approach
    log.warn(`[RefreshRevenue] acquire_cron_lock RPC failed, falling back: ${error.message}`)

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
        started_at: now,
      }, { onConflict: "lock_name" })

    return { acquired: true }
  }

  const acquired = data === true
  if (!acquired) {
    // Lock is held by another process — read who holds it
    const { data: lockRow } = await supabase
      .from("cron_locks")
      .select("started_at")
      .eq("lock_name", name)
      .single()
    return { acquired: false, lockedSince: lockRow?.started_at }
  }

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

const PERIOD_DAYS: Record<string, number> = {
  today: 1, yesterday: 1, "7d": 7, "15d": 15, "30d": 30, "90d": 90,
}

async function refreshStoreForPeriod(
  supabase: SupabaseClient,
  store: StoreRow,
  period: string,
): Promise<{ status: "ok" | "error"; error?: string }> {
  // Dispatcher por plataforma
  const platform = await detectStorePlatform(store.id)

  if (platform === "omnisend") {
    const credentials = await getStoreCredentials(store.id, store.org_id ?? undefined)
    const apiKey = credentials.omnisend_api_key
    if (!apiKey) return { status: "error", error: "No Omnisend API key" }
    // Range custom: o sync Omnisend só entende janela relativa (now−Nd).
    // Range terminando HOJE vira periodDays exato; range retroativo é
    // pulado com erro honesto (melhor sem número que número errado).
    const custom = parseCustomPeriodLabel(period)
    let days = PERIOD_DAYS[period] ?? 30
    if (custom) {
      const today = new Date().toISOString().slice(0, 10)
      if (custom.endDate < today) {
        return { status: "error", error: "Omnisend não suporta range retroativo (janela é relativa a hoje)" }
      }
      days = Math.max(
        1,
        Math.round(
          (Date.parse(custom.endDate) - Date.parse(custom.startDate)) / 86_400_000,
        ) + 1,
      )
    }
    const result = await syncOmnisendForStore({
      storeId: store.id,
      orgId: store.org_id ?? "",
      apiKey,
      periodDays: days,
    })
    if (result.ok && result.data) {
      await upsertOmnisendSyncResults(supabase, { id: store.id, org_id: store.org_id }, result.data, period)
      return { status: "ok" }
    }
    return { status: "error", error: result.error || "Omnisend sync failed" }
  }

  if (platform !== "klaviyo") {
    return { status: "error", error: `Unsupported platform: ${platform}` }
  }

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
    let period: string = body.period || "30d"

    // Range personalizado: {period:"custom", start, end} vira o rótulo
    // composto custom:YYYY-MM-DD:YYYY-MM-DD — o MESMO que as rotas de
    // leitura resolvem via normalizePeriodLabel. Sincronizar sob esse
    // label é o que popula o cache do range selecionado.
    if (period === "custom") {
      const start = typeof body.start === "string" ? body.start.slice(0, 10) : null
      const end = typeof body.end === "string" ? body.end.slice(0, 10) : null
      const valid =
        start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) &&
        start <= end &&
        (Date.parse(end) - Date.parse(start)) / 86_400_000 <= 366
      if (!valid) {
        return NextResponse.json(
          { success: false, error: "Range custom inválido: envie start/end (YYYY-MM-DD, máx. 366 dias)" },
          { status: 400 },
        )
      }
      period = buildCustomPeriodLabel(start!, end!)
    } else if (!(CACHED_PERIODS as readonly string[]).includes(period)) {
      return NextResponse.json(
        { success: false, error: `Invalid period: ${period}. Use: ${CACHED_PERIODS.join(", ")} ou custom+start/end` },
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
      // Get ALL stores with Klaviyo OR Omnisend credentials for this org.
      // Resiliente a migration pendente: fallback para so-Klaviyo se omnisend_api_key
      // coluna nao existe.
      let storesResp = await adminClient
        .from("client_stores")
        .select("id, store_name, org_id")
        .eq("org_id", orgId)
        .or(ANY_EMAIL_PLATFORM_FILTER)
      if (storesResp.error && /omnisend_api_key/.test(storesResp.error.message || "")) {
        storesResp = await adminClient
          .from("client_stores")
          .select("id, store_name, org_id")
          .eq("org_id", orgId)
          .or(KLAVIYO_CREDENTIALS_FILTER)
      }
      const { data: stores, error: storesError } = storesResp

      if (storesError || !stores || stores.length === 0) {
        log.warn("[RefreshRevenue] No stores found for org", orgId)
        return NextResponse.json({ success: true, storesRefreshed: 0, durationMs: Date.now() - startTime })
      }

      // Refresh stores sequentially, mas com deadline pra nao estourar
      // o maxDuration do Vercel (504). Quando atinge deadline, retorna
      // parcial — proxima request continua dali (idempotente).
      let okCount = 0
      let errorCount = 0
      let skippedCount = 0
      let timedOut = false

      for (let i = 0; i < stores.length; i++) {
        if (Date.now() - startTime > LOOP_DEADLINE_MS) {
          skippedCount = stores.length - i
          timedOut = true
          log.warn(
            `[RefreshRevenue] Deadline reached at store ${i}/${stores.length}, returning partial.`,
          )
          break
        }
        const store = stores[i]
        const result = await refreshStoreForPeriod(adminClient, store as StoreRow, period)
        if (result.status === "ok") {
          okCount++
          log.info(`[RefreshRevenue] OK: ${store.store_name}/${period}`)
        } else {
          errorCount++
          log.warn(`[RefreshRevenue] Error: ${store.store_name}/${period}: ${result.error}`)
        }

        // Small delay between stores to respect Klaviyo rate limits
        if (i < stores.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      const durationMs = Date.now() - startTime
      log.info(
        `[RefreshRevenue] Completed org ${orgId}/${period}: ok=${okCount} error=${errorCount} skipped=${skippedCount} duration=${durationMs}ms`,
      )

      return NextResponse.json({
        success: true,
        alreadyRunning: false,
        storesRefreshed: okCount,
        storeErrors: errorCount,
        storesSkipped: skippedCount,
        timedOut,
        durationMs,
      })
    } finally {
      await releaseRefreshLock(adminClient, orgId, period)
    }
  } catch (error) {
    return errorResponse(request, error, "RefreshRevenue POST")
  }
}
