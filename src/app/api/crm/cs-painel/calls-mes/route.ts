/**
 * GET /api/crm/cs-painel/calls-mes
 *
 * Calls realizadas no mes corrente vs meta.
 * Meta = numero de lojas ativas (alvo de 1 call/loja/mes — decisao de produto).
 * Realizadas = store_feedback_calls com conducted_at no mes corrente.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CsPainelCallsMes")

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const now = new Date()
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()

    // Meta = lojas ativas
    const { count: activeCount } = await admin
      .from("client_stores")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)

    // Realizadas no mes
    const { count: doneCount } = await admin
      .from("store_feedback_calls")
      .select("id", { count: "exact", head: true })
      .gte("conducted_at", monthStart)

    const feitas = doneCount ?? 0
    const meta = activeCount ?? 0
    const pct = meta > 0 ? Math.round((feitas / meta) * 100) : 0

    return successResponse(request, { feitas, meta, pct })
  } catch (error) {
    log.error("CS painel calls-mes error:", error)
    return errorResponse(request, error, "cs-painel-calls-mes")
  }
}
