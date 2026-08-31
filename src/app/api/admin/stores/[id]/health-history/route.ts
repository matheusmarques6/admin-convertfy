/**
 * GET /api/admin/stores/[id]/health-history
 *
 * Retorna as N últimas rows de crm_health_history pra renderizar
 * dimensões (componentes email/revenue/tickets/nps) e delta vs período
 * anterior na sidebar de Saúde da Visão Geral.
 *
 * Query params:
 *  ?limit=N (default 5, max 30)
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { requireStoreAccess } from "@/lib/api/require-store-access"
import { logger } from "@/lib/logger"

const log = logger.child("StoreHealthHistory")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)

    if (!storeId) throw new AppError("store_id é obrigatório", 400)
    await requireStoreAccess(storeId, user.id)

    const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") || "5", 10)
    const limit = Math.min(Math.max(isNaN(limitRaw) ? 5 : limitRaw, 1), 30)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("crm_health_history")
      // A coluna é `computed_at`; o alias mantém `created_at` no contrato
      // que HealthHistoryRow consome na sidebar de Saúde.
      .select("health_score, components, created_at:computed_at")
      .eq("store_id", storeId)
      .order("computed_at", { ascending: false })
      .limit(limit)

    if (error) {
      // Tabela ausente em ambiente legado (42P01) degrada em silêncio pra UI
      // não quebrar. Qualquer outro erro também devolve vazio — a sidebar não
      // é crítica —, mas agora aparece no log: foi um `created_at` inexistente
      // escondido por este mesmo fallback que manteve o histórico de saúde
      // invisível com 8.343 linhas no banco.
      if (error.code !== "42P01") {
        log.warn("crm_health_history falhou", { code: error.code, message: error.message })
      }
      return successResponse(request, { history: [] })
    }

    return successResponse(request, { history: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "health-history")
  }
}
