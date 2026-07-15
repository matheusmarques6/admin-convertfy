/**
 * GET /api/client-stores/[id]/live-store-totals?period=30d
 *
 * Total da loja (pedidos + receita) AO VIVO, direto da Statistics API do
 * Omnisend, com a MESMA janela do sync (00:00 do fuso da loja -> agora).
 *
 * Existe porque o `store_orders`/`store_total_revenue` do cron sempre defasa
 * do painel: o dia corrente esta em movimento e o snapshot foi tirado antes.
 * Buscando ao vivo no page-load, bate com o painel na unidade (mesma API,
 * mesmo instante).
 *
 * Returns: { success, totalOrders, totalRevenue, currency, window }
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
import {
  fetchLiveOmnisendStoreTotals,
  debugOmnisendStoreTotals,
  periodLabelToDays,
} from "@/lib/services/omnisend-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("LiveStoreTotals")

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: storeId } = await context.params

  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const storeAccess = await requireStoreAccess(storeId, user.id)
    const orgId = storeAccess.orgId

    const platform = await detectStorePlatform(storeId)
    if (platform !== "omnisend") {
      // Sem live pra plataformas nao-Omnisend (Shopify ja e live pelo report).
      return successResponse(request, { supported: false })
    }

    const period = request.nextUrl.searchParams.get("period") || "30d"
    const periodDays = periodLabelToDays(period)

    const credentials = await getStoreCredentials(storeId, orgId)
    const apiKey = credentials.omnisend_api_key
    if (!apiKey) {
      throw new AppError("Loja sem Omnisend API key configurada", 400)
    }

    // Modo diagnostico: ?debug=1 retorna month + day + linhas cruas por bucket.
    if (request.nextUrl.searchParams.get("debug") === "1") {
      const dbg = await debugOmnisendStoreTotals(storeId, apiKey, periodDays)
      return successResponse(request, { supported: true, debug: dbg })
    }

    const totals = await fetchLiveOmnisendStoreTotals(storeId, apiKey, periodDays)

    // Currency da loja (client_stores.currency) — o Omnisend nao expoe via API.
    const admin = createAdminClient()
    const { data: storeRow } = await admin
      .from("client_stores")
      .select("currency")
      .eq("id", storeId)
      .single()

    log.info("[LiveStoreTotals] ok", {
      storeId,
      period,
      totalOrders: totals.totalOrders,
      totalRevenue: totals.totalRevenue,
    })

    return successResponse(request, {
      supported: true,
      totalOrders: totals.totalOrders,
      totalRevenue: totals.totalRevenue,
      attributedRevenue: totals.attributedRevenue,
      attributedOrders: totals.attributedOrders,
      currency: storeRow?.currency || "BRL",
      window: { start: totals.startDate, end: totals.endDate },
    })
  } catch (error) {
    return errorResponse(request, error, "live-store-totals")
  }
}
