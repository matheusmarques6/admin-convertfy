/**
 * POST /api/client-stores/[id]/sync-email
 *
 * Dispara sincronizacao manual da plataforma de email marketing
 * (Klaviyo OU Omnisend) para UMA loja especifica, sem esperar o cron.
 *
 * Util quando:
 *  - Cache esta vazio (ex: primeira configuracao de API key)
 *  - Rate limit forcou `rateLimited: true` e queremos repopular cache
 *  - Admin quer refresh imediato sem aguardar os 30min do cron
 *
 * Body (opcional):
 *   { "period": "7d" | "15d" | "30d" | "90d" }
 *
 * Returns:
 *   { success, platform, period, campaigns, automations, revenue, durationMs }
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { detectStorePlatform } from "@/lib/services/report-platform.service"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { syncOmnisendForStore } from "@/lib/services/omnisend-sync.service"
import {
  syncKlaviyoForPeriod,
  fetchFlowNames,
  fetchCampaignNames,
  fetchAudienceForStore,
} from "@/lib/services/klaviyo-sync.service"
import {
  upsertOmnisendSyncResults,
  upsertSyncResults,
} from "@/lib/services/sync-persistence.service"
import {
  getTimezoneOffset,
  getCachedAccountInfo,
  getCachedPlacedOrderMetric,
  KlaviyoPermissionError,
  KlaviyoRateLimitError,
  KlaviyoInvalidKeyError,
} from "@/lib/integrations/klaviyo"
import { CACHED_PERIODS } from "@/lib/shared/data-status"
import { logger } from "@/lib/logger"

const log = logger.child("StoreSyncEmail")

export const maxDuration = 120
export const dynamic = "force-dynamic"

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7, "15d": 15, "30d": 30, "90d": 90,
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const { id: storeId } = await params

    if (!storeId) {
      throw new AppError("store_id é obrigatório", 400)
    }

    // Body (period opcional, default 30d)
    const body = await request.json().catch(() => ({}))
    const period: string = body.period || "30d"
    if (!(CACHED_PERIODS as readonly string[]).includes(period)) {
      throw new AppError(
        `Periodo inválido: ${period}. Use: ${CACHED_PERIODS.join(", ")}`,
        400,
      )
    }

    // Multi-tenant isolation + requires can_edit permission
    const storeAccess = await requireStoreAccess(storeId, user.id, "can_edit")

    const platform = await detectStorePlatform(storeId)
    if (platform === "none") {
      throw new AppError(
        "Loja não tem plataforma de email marketing configurada",
        400,
      )
    }

    const adminClient = createAdminClient()
    const storeInfo = { id: storeId, org_id: storeAccess.orgId }
    const credentials = await getStoreCredentials(storeId, storeAccess.orgId)

    if (platform === "omnisend") {
      const apiKey = credentials.omnisend_api_key
      if (!apiKey) {
        throw new AppError("API Key Omnisend não configurada para esta loja", 400)
      }

      const days = PERIOD_DAYS[period] ?? 30
      const result = await syncOmnisendForStore({
        storeId,
        orgId: storeAccess.orgId,
        apiKey,
        periodDays: days,
      })

      if (!result.ok || !result.data) {
        throw new AppError(result.error || "Sincronizacao Omnisend falhou", 502)
      }

      await upsertOmnisendSyncResults(adminClient, storeInfo, result.data, period)

      log.info("Manual Omnisend sync complete", {
        storeId,
        storeName: storeAccess.storeName,
        campaigns: result.data.campaignRows.length,
        automations: result.data.automationRows.length,
        revenue: result.data.totalStoreRevenue,
      })

      return successResponse(request, {
        success: true,
        platform: "omnisend",
        period,
        campaigns: result.data.campaignRows.length,
        automations: result.data.automationRows.length,
        revenue: result.data.totalStoreRevenue,
        contacts: result.data.totalContacts,
        durationMs: Date.now() - startTime,
      })
    }

    // platform === "klaviyo"
    const apiKey = credentials.klaviyo_private_key || credentials.klaviyo_api_key
    if (!apiKey) {
      throw new AppError("API Key Klaviyo não configurada para esta loja", 400)
    }

    try {
      const accountInfo = await getCachedAccountInfo(apiKey, storeAccess.orgId, storeId)
      const timezoneOffset = getTimezoneOffset(accountInfo.timezone)
      const metricId = await getCachedPlacedOrderMetric(apiKey, storeAccess.orgId, storeId)
      if (!metricId) {
        throw new AppError("Metrica Placed Order nao encontrada", 502)
      }

      const [flowNames, campNames] = await Promise.all([
        fetchFlowNames(apiKey),
        fetchCampaignNames(apiKey),
      ])

      const audience = await fetchAudienceForStore(apiKey)
      const audienceData = audience.success && audience.data
        ? audience.data
        : { totalLeads: 0, engagedLeads: 0, engagementRate: 0 }

      const result = await syncKlaviyoForPeriod({
        storeId,
        orgId: storeAccess.orgId,
        apiKey,
        timezone: accountInfo.timezone,
        timezoneOffset,
        metricId,
        period,
        flowNames,
        campNames,
        currency: accountInfo.currency,
      })

      if (!result.success || !result.data) {
        throw new AppError(result.error || "Sincronizacao Klaviyo falhou", 502)
      }

      await upsertSyncResults(adminClient, storeInfo, result.data, period, audienceData)

      log.info("Manual Klaviyo sync complete", {
        storeId,
        storeName: storeAccess.storeName,
        campaigns: result.data.campRows.length,
        flows: result.data.flowRows.length,
        revenue: result.data.storeRevenue,
      })

      return successResponse(request, {
        success: true,
        platform: "klaviyo",
        period,
        campaigns: result.data.campRows.length,
        automations: result.data.flowRows.length,
        revenue: result.data.storeRevenue,
        contacts: audienceData.totalLeads,
        durationMs: Date.now() - startTime,
      })
    } catch (err) {
      if (err instanceof KlaviyoPermissionError) {
        throw new AppError(
          `Permissao negada: faltam scopes ${err.missingScopes.join(", ")}`,
          403,
        )
      }
      if (err instanceof KlaviyoRateLimitError) {
        throw new AppError(
          `Klaviyo rate limit (tente novamente em ${Math.ceil(err.retryAfterMs / 1000)}s)`,
          429,
        )
      }
      if (err instanceof KlaviyoInvalidKeyError) {
        throw new AppError(`API Key Klaviyo invalida: ${err.message}`, 401)
      }
      throw err
    }
  } catch (error) {
    return errorResponse(request, error, "StoreSyncEmail POST")
  }
}
