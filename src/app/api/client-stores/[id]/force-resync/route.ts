/**
 * POST /api/client-stores/[id]/force-resync
 *
 * Limpa o cache da loja e dispara um sync imediato. Util quando os
 * valores no overview/relatorio nao batem com a realidade e suspeita-se
 * de cache stale ou linha velha gravada com calculo bugado.
 *
 * Operacoes:
 *  1. DELETE em omnisend_reports_cache (L2 cache 1h)
 *  2. DELETE em omnisend_campaign_metrics + omnisend_flow_metrics
 *  3. DELETE em store_revenue_summary (somente para a loja)
 *  4. Chama sync-email pra repopular tudo
 *
 * Returns:
 *   { success, cleared: { reports, campaigns, flows, summary }, sync: {...} }
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
import { upsertOmnisendSyncResults } from "@/lib/services/sync-persistence.service"
import { logger } from "@/lib/logger"

const log = logger.child("StoreForceResync")

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: storeId } = await context.params

  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const storeAccess = await requireStoreAccess(storeId, user.id, "can_edit")
    const orgId = storeAccess.orgId

    const admin = createAdminClient()
    const platform = await detectStorePlatform(storeId)

    if (platform !== "omnisend") {
      throw new AppError(
        "Force-resync atualmente suportado apenas para lojas Omnisend",
        400
      )
    }

    log.info(`[ForceResync] Starting for store ${storeId}`)

    // 1. Limpa caches em paralelo
    const [reportsRes, campaignsRes, flowsRes, summaryRes] = await Promise.all([
      admin.from("omnisend_reports_cache").delete().eq("store_id", storeId),
      admin.from("omnisend_campaign_metrics").delete().eq("store_id", storeId),
      admin.from("omnisend_flow_metrics").delete().eq("store_id", storeId),
      admin.from("store_revenue_summary").delete().eq("store_id", storeId),
    ])

    const cleared = {
      reports: !reportsRes.error,
      campaigns: !campaignsRes.error,
      flows: !flowsRes.error,
      summary: !summaryRes.error,
    }

    log.info(`[ForceResync] Cache cleared`, { storeId, cleared })

    // 2. Dispara sync imediato
    const credentials = await getStoreCredentials(storeId, orgId)
    const apiKey = credentials.omnisend_api_key
    if (!apiKey) {
      throw new AppError("Loja sem Omnisend API key configurada", 400)
    }

    const syncResult = await syncOmnisendForStore({
      storeId,
      orgId,
      apiKey,
      periodDays: 30,
    })

    if (!syncResult.ok || !syncResult.data) {
      throw new AppError(
        `Sync falhou apos limpar cache: ${syncResult.error || "unknown"}`,
        500
      )
    }

    await upsertOmnisendSyncResults(
      admin,
      { id: storeId, org_id: orgId },
      syncResult.data,
      "30d",
    )

    log.info(`[ForceResync] Done for store ${storeId}`, {
      campaigns: syncResult.data.campaignRows.length,
      automations: syncResult.data.automationRows.length,
      totalRevenue: syncResult.data.totalStoreRevenue,
      attributedRevenue: syncResult.data.totalAttributedRevenue,
    })

    return successResponse(request, {
      success: true,
      cleared,
      sync: {
        platform: "omnisend",
        campaigns: syncResult.data.campaignRows.length,
        automations: syncResult.data.automationRows.length,
        totalRevenue: syncResult.data.totalStoreRevenue,
        attributedRevenue: syncResult.data.totalAttributedRevenue,
        currency: syncResult.data.currency,
      },
    })
  } catch (error) {
    log.error(`[ForceResync] Failed for store ${storeId}`, error)
    return errorResponse(request, error, "force-resync")
  }
}
