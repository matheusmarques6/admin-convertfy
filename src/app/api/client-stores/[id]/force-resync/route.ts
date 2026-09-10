/**
 * POST /api/client-stores/[id]/force-resync
 *
 * Limpa o cache da loja e dispara um sync imediato. Util quando os
 * valores no overview/relatorio nao batem com a realidade e suspeita-se
 * de cache stale ou linha velha gravada com calculo bugado.
 *
 * ── O período agora vem de quem clicou (set/2026) ────────────────────
 *
 * A rota apagava TODOS os `period_label` da loja e repopulava só o
 * "30d", fixo no código. Quem estivesse olhando o dashboard em 7 dias,
 * 90 dias ou num período personalizado clicava em sincronizar e via o
 * cache do seu período ser apagado sem ser reposto — a tela continuava
 * igual, ou pior, zerava, e a queixa "não está sincronizando" era
 * literal: o que foi sincronizado não era o que estava na tela.
 *
 * Agora aceita `period` (+ `start_date`/`end_date` quando custom), roda
 * o sync com a janela pedida e grava sob o rótulo dela. E a limpeza é
 * ESCOPADA ao período que vai ser reposto: apagar os outros deixava
 * buraco em tela nenhuma pediu.
 *
 * Body (todos opcionais):
 *   { period?: "1d"|"7d"|"30d"|"90d"|"12m"|"custom",
 *     start_date?: "YYYY-MM-DD", end_date?: "YYYY-MM-DD",
 *     all_periods?: boolean }   // limpeza total, o comportamento antigo
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
import { syncOmnisendForStore, periodLabelToDays } from "@/lib/services/omnisend-sync.service"
import { upsertOmnisendSyncResults, normalizePeriodLabel } from "@/lib/services/sync-persistence.service"
import { omnisendDateRange, fusoDaLoja } from "@/lib/integrations/omnisend/timezone"
import { diasDoPeriodo } from "@/lib/reports/periodo"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("StoreForceResync")

export const maxDuration = 120
export const dynamic = "force-dynamic"

/** Fuso IANA da loja, com o padrão declarado quando ela não tem um. */
async function fusoDaLojaDoBanco(admin: SupabaseClient, storeId: string): Promise<string> {
  const { data } = await admin
    .from("client_stores")
    .select("timezone")
    .eq("id", storeId)
    .maybeSingle()
  return fusoDaLoja((data?.timezone as string | null) ?? null).tz
}

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

    // Período pedido pela tela. Sem body, mantém o "30d" histórico —
    // nenhum chamador antigo quebra.
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const rawPeriod = typeof body.period === "string" ? body.period : "30d"
    const startDate = typeof body.start_date === "string" ? body.start_date : null
    const endDate = typeof body.end_date === "string" ? body.end_date : null
    const todosOsPeriodos = body.all_periods === true
    const periodLabel = normalizePeriodLabel(rawPeriod, startDate, endDate)
    const periodDays =
      rawPeriod === "custom" && startDate && endDate
        ? diasDoPeriodo(startDate, endDate)
        : periodLabelToDays(rawPeriod)

    log.info(`[ForceResync] Starting for store ${storeId}`, { periodLabel, periodDays })

    // 1. Limpa caches em paralelo.
    //    Escopado ao período que será reposto — apagar os rótulos que este
    //    sync não vai repopular deixa a tela de OUTRO período sem dado.
    const escopo = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
      todosOsPeriodos ? q : q.eq("period_label", periodLabel)
    const [reportsRes, campaignsRes, flowsRes, summaryRes] = await Promise.all([
      admin.from("omnisend_reports_cache").delete().eq("store_id", storeId),
      escopo(admin.from("omnisend_campaign_metrics").delete().eq("store_id", storeId)),
      escopo(admin.from("omnisend_flow_metrics").delete().eq("store_id", storeId)),
      escopo(admin.from("store_revenue_summary").delete().eq("store_id", storeId)),
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

    const janela =
      rawPeriod === "custom" && startDate && endDate
        ? omnisendDateRange(startDate, endDate, (await fusoDaLojaDoBanco(admin, storeId)))
        : null
    const syncResult = await syncOmnisendForStore({
      storeId,
      orgId,
      apiKey,
      periodDays,
      ...(janela ? { startDate: janela.from, endDate: janela.to } : {}),
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
      periodLabel,
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
      period: { label: periodLabel, days: periodDays },
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
