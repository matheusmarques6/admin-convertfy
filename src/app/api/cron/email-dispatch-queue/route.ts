/**
 * Vercel Cron — Email Dispatch Queue.
 *
 * Schedule: every minute (cron: see vercel.json).
 *
 * Processa a fila `email_dispatch_jobs`: para o job mais antigo claimável,
 * roda o Montador+Blueprint (Architect) dos emails pendentes em lotes dentro
 * do orçamento de tempo do tick e, quando TODOS os emails estão settled
 * (gerados ou esgotados → fallback global), dispara pro n8n UMA vez.
 *
 * Por que cron e não inline: o Architect (Opus, 60-180s/email × N emails) não
 * cabe no maxDuration de um request — fatiar em ticks remove o teto.
 *
 * Concorrência: claim otimista por `updated_at` (lease). Ver
 * `email-dispatch-queue.service.ts`.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { processDispatchJobs } from "@/lib/services/email-dispatch-queue.service"
import { logger } from "@/lib/logger"

const log = logger.child("EmailDispatchQueueCron")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const t0 = Date.now()
  try {
    const summary = await processDispatchJobs()
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
