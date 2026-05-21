/**
 * PATCH /api/stores/[id]/alerts/[alertId]
 *
 * Acoes sobre um alerta:
 *  - { status: 'acknowledged' }: marca como visto (CSM ja olhou, vai agir)
 *  - { status: 'resolved' }: marca como resolvido (fecha o ciclo)
 *
 * Pode reverter pra 'active' caso o CSM tenha resolvido erroneamente.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("StoreAlertPatch")

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  status: z.enum(["active", "acknowledged", "resolved"]),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; alertId: string }> },
) {
  try {
    const { id: storeId, alertId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const { status } = patchSchema.parse(body)

    const update: {
      status: string
      resolved_at: string | null
      resolved_by: string | null
    } = {
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? user.id : null,
    }

    const { data, error } = await admin
      .from("store_alerts")
      .update(update)
      .eq("id", alertId)
      .eq("store_id", storeId)
      .select("id, status, resolved_at")
      .single()

    if (error) throw new AppError(error.message, 500)

    log.info("Alert updated", { alert_id: alertId, status })
    return successResponse(request, { alert: data })
  } catch (error) {
    log.error("PATCH error:", error)
    return errorResponse(request, error, "store-alert-patch")
  }
}
