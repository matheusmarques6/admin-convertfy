/**
 * Vercel Cron — continuação de turnos da ConvertIA (ai_chat_jobs).
 *
 * Schedule: * * * * * (a cada minuto)
 *
 * Turno que estourou o orçamento de tempo da rota DEPOIS de executar
 * tools continua daqui: claim atômico (queued→running), loop de tools
 * retomado da rodada onde parou, resposta gravada na mesma linha da
 * mensagem (o chat repõe por polling). Running preso há >6 min volta
 * para a fila; 3 tentativas e a mensagem é fechada com erro.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { runContinuationJobs } from "@/lib/ai/convertia/continuation"
import { logger } from "@/lib/logger"

const log = logger.child("CronConvertiaContinue")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  try {
    const admin = createAdminClient()
    const result = await runContinuationJobs(admin, { budgetMs: 280_000 })
    if (result.processed || result.failed) log.info("convertia continue tick", result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown"
    // tabela ausente (migration não aplicada) não é erro de cron
    if (/ai_chat_jobs/.test(msg) && /does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ success: true, skipped: "schema_missing" })
    }
    log.error("convertia continue falhou", error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
