/**
 * GET   /api/stores/[id]/alerts             — lista alertas da loja
 * PATCH /api/stores/[id]/alerts/[alertId]   — ack/resolve (em [alertId]/route.ts)
 *
 * Consumido pela aba "Alertas" no detalhe da loja. Substitui o antigo
 * fluxo de "Leads CS" — alertas vivem na propria loja, sem duplicacao
 * com clients/client_stores.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreAlerts")

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const statusFilter = sp.get("status") // active | acknowledged | resolved | all
    const typeFilter = sp.get("type")

    let q = admin
      .from("store_alerts")
      .select(
        `id, type, severity, title, message, status, metadata,
         created_at, updated_at, resolved_at,
         resolved_by_profile:profiles!store_alerts_resolved_by_fkey(id, name, avatar_url)`,
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })

    if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter)
    if (typeFilter) q = q.eq("type", typeFilter)

    const { data, error } = await q
    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { alerts: data ?? [] })
  } catch (error) {
    log.error("GET error:", error)
    return errorResponse(request, error, "store-alerts-get")
  }
}
