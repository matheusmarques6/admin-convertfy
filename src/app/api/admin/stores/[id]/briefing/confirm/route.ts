/**
 * POST /api/admin/stores/[id]/briefing/confirm
 *
 * Marca o briefing mais recente da loja como `status='confirmed'`.
 * A trigger SQL `trg_store_briefings_confirmed` (AE-1) cuida de
 * inserir o sinal em `email_generation_queue_signals`.
 *
 * Idempotente: se ja esta confirmed, retorna 200 sem disparar trigger novo.
 * (Trigger so dispara quando OLD.status != 'confirmed'.)
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  NotFoundError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("BriefingConfirm")

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    // Buscar briefing mais recente
    const { data: briefing, error: fetchErr } = await admin
      .from("store_briefings")
      .select("id, version, status, confirmed_at")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!briefing) {
      throw new NotFoundError("Briefing")
    }

    // Idempotente: ja confirmed
    if (briefing.status === "confirmed") {
      log.info("already_confirmed", { storeId, briefingId: briefing.id })
      return successResponse(request, {
        briefing_id: briefing.id,
        confirmed_at: briefing.confirmed_at,
        already_confirmed: true,
      })
    }

    const confirmedAt = new Date().toISOString()
    const { error: updErr } = await admin
      .from("store_briefings")
      .update({
        status: "confirmed",
        confirmed_at: confirmedAt,
        confirmed_by: user.id,
      })
      .eq("id", briefing.id)

    if (updErr) throw updErr

    log.info("confirmed", {
      storeId,
      briefingId: briefing.id,
      version: briefing.version,
      userId: user.id,
    })

    return successResponse(request, {
      briefing_id: briefing.id,
      confirmed_at: confirmedAt,
    })
  } catch (error) {
    log.error("error", error)
    return errorResponse(request, error, "briefing-confirm")
  }
}
