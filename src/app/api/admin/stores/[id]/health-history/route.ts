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
      .select("health_score, components, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      // Se a tabela nao existe ainda em ambientes legados, devolve vazio
      // ao inves de 500 pra UI nao quebrar.
      return successResponse(request, { history: [] })
    }

    return successResponse(request, { history: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "health-history")
  }
}
