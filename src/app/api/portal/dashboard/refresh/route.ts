import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { requireAuth, errorResponse, AppError } from "@/lib/api/errors"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { ANY_EMAIL_PLATFORM_FILTER, KLAVIYO_CREDENTIALS_FILTER, getStoreCredentials } from "@/lib/services/credentials.service"
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
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import { detectStorePlatform } from "@/lib/services/report-platform.service"
import { upsertSyncResults } from "@/lib/services/sync-persistence.service"

const PERIOD_DAYS: Record<string, number> = {
  today: 1, yesterday: 1, "7d": 7, "15d": 15, "30d": 30, "90d": 90,
}

const log = logger.child("PortalRefresh")

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

interface StoreRow {
  id: string
  store_name: string
  org_id: string | null
}

async function refreshStoreForPeriod(
  adminClient: ReturnType<typeof createAdminClient>,
  store: StoreRow,
  period: string,
): Promise<{ status: "ok" | "error"; error?: string }> {
  // Dispatcher por plataforma: cada loja usa UMA (Klaviyo ou Omnisend)
  const platform = await detectStorePlatform(store.id)

  if (platform === "omnisend") {
    const credentials = await getStoreCredentials(store.id, store.org_id ?? undefined)
    const apiKey = credentials.omnisend_api_key
    if (!apiKey) return { status: "error", error: "No Omnisend API key" }
    const result = await syncOmnisendForStore({
      storeId: store.id,
      orgId: store.org_id ?? "",
      apiKey,
      periodDays: PERIOD_DAYS[period] ?? 30,
    })
    if (result.ok) return { status: "ok" }
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
      await upsertSyncResults(adminClient, store, result.data, period, audienceData)
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

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const adminClient = createAdminClient()

    // Resolve client_id via portal user (NOT org_members)
    const { data: portalUser } = await adminClient
      .from("client_portal_users")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!portalUser) {
      throw new AppError("Nao autorizado", 401)
    }

    const body = await request.json().catch(() => ({}))
    const period = body.period || "30d"

    if (!(CACHED_PERIODS as readonly string[]).includes(period)) {
      return NextResponse.json(
        { success: false, error: `Invalid period: ${period}` },
        { status: 400 },
      )
    }

    // Get client's stores with Klaviyo OU Omnisend credentials.
    // Resiliente a migration pendente.
    let storesResp = await adminClient
      .from("client_stores")
      .select("id, store_name, org_id")
      .eq("client_id", portalUser.client_id)
      .eq("is_active", true)
      .or(ANY_EMAIL_PLATFORM_FILTER)
    if (storesResp.error && /omnisend_api_key/.test(storesResp.error.message || "")) {
      storesResp = await adminClient
        .from("client_stores")
        .select("id, store_name, org_id")
        .eq("client_id", portalUser.client_id)
        .eq("is_active", true)
        .or(KLAVIYO_CREDENTIALS_FILTER)
    }
    const stores = storesResp.data

    if (!stores || stores.length === 0) {
      return NextResponse.json({ success: true, storesRefreshed: 0, durationMs: Date.now() - startTime })
    }

    // Refresh stores sequentially
    let okCount = 0
    let errorCount = 0

    for (let i = 0; i < stores.length; i++) {
      const store = stores[i]
      const result = await refreshStoreForPeriod(adminClient, store as StoreRow, period)
      if (result.status === "ok") {
        okCount++
        log.info(`[PortalRefresh] OK: ${store.store_name}/${period}`)
      } else {
        errorCount++
        log.warn(`[PortalRefresh] Error: ${store.store_name}/${period}: ${result.error}`)
      }

      if (i < stores.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const durationMs = Date.now() - startTime
    log.info(`[PortalRefresh] Completed client ${portalUser.client_id}/${period}: ok=${okCount} error=${errorCount} duration=${durationMs}ms`)

    return NextResponse.json({
      success: true,
      storesRefreshed: okCount,
      storeErrors: errorCount,
      durationMs,
    })
  } catch (error) {
    return errorResponse(request, error, "PortalRefresh POST")
  }
}
