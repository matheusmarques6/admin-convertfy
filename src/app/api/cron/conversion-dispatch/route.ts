/**
 * Vercel Cron — Conversion Dispatch.
 *
 * Schedule: every minute (cron: see vercel.json).
 *
 * Processa a fila `crm_conversion_events`: reenvia (com retry) os eventos
 * de conversao Meta CAPI que ficaram pending/failed apos o envio inline do
 * submit. Reenvio e seguro — o Meta deduplica por `event_id`.
 *
 * Concorrencia: claim otimista por `updated_at` (lease). Ver
 * `conversion-dispatch.service.ts`.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { processPendingConversionEvents } from "@/lib/services/conversion-dispatch.service"
import { logger } from "@/lib/logger"

const log = logger.child("ConversionDispatchCron")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const t0 = Date.now()
  try {
    const summary = await processPendingConversionEvents()
    log.info("cron.done", { ...summary, duration_ms: Date.now() - t0 })
    return NextResponse.json({ success: true, ...summary, duration_ms: Date.now() - t0 })
  } catch (err) {
    log.error("cron.fatal", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
