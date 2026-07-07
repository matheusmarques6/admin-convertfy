/**
 * Vercel Cron — Figma Import Queue.
 *
 * Schedule: every minute (cron: see vercel.json).
 *
 * Processa a fila `figma_import_jobs` (Telas 1 e 2 da Central de Campanhas):
 * claima o job mais antigo e roda o import respeitando o orçamento interno
 * de 8 exports do Figma por minuto — o pacing é imposto pela guarda
 * distribuída `acquireExportSlot` dentro do client do Figma.
 *
 * Por que cron e não inline: o Tier 1 do Figma (/v1/images = 10 req/min)
 * torna imports grandes/concorrentes mais longos que um request aguenta —
 * fatiar em ticks com progresso persistido remove o teto sem perder trabalho.
 *
 * Concorrência: claim otimista por `updated_at` (lease). Ver
 * `figma-import-queue.service.ts`.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { processFigmaImportJobs } from "@/lib/services/figma-import-queue.service"
import { logger } from "@/lib/logger"

const log = logger.child("FigmaImportQueueCron")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const t0 = Date.now()
  try {
    const summary = await processFigmaImportJobs()
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
