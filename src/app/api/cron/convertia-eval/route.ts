/**
 * Vercel Cron — avaliação semanal da ConvertIA (ai_eval_cases × modelos).
 *
 * Schedule: 0 5 * * 1 (segunda, 05h UTC)
 *
 * 1) importa como casos as perguntas das respostas 👍 dos últimos 90
 *    dias (dedupe por hash) de cada org;
 * 2) roda os casos ativos nos modelos do conjunto com tools SÓ de
 *    leitura e um juiz dá a nota. Orçamento de 280 s — o que não
 *    couber fica para a próxima execução (`?batch=` retoma um lote).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { importCasesFromFeedback, runEvalBatch } from "@/lib/ai/convertia/eval"
import { logger } from "@/lib/logger"

const log = logger.child("CronConvertiaEval")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const admin = createAdminClient()
  const started = Date.now()
  try {
    const { data: orgs } = await admin.from("organizations").select("id").limit(20)
    let imported = 0
    for (const o of orgs ?? []) imported += await importCasesFromFeedback(admin, o.id)
    const batch = request.nextUrl.searchParams.get("batch") ?? undefined
    const result = await runEvalBatch(admin, { budgetMs: 280_000 - (Date.now() - started), batchId: batch })
    log.info("convertia eval tick", { imported, ...result })
    return NextResponse.json({ success: true, imported, ...result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown"
    log.error("convertia eval falhou", error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
