/**
 * Vercel Cron — processa a importação de histórico do WhatsApp.
 *
 * Schedule: a cada minuto. Pega UM job ativo (o índice parcial único
 * garante um por canal) e trabalha por um budget de tempo abaixo do
 * maxDuration, salvando o cursor a cada página. Se sobrar histórico, a
 * execução seguinte retoma de onde parou — um timeout custa uma página.
 *
 * Sem job ativo, retorna imediatamente: rodar de minuto em minuto é
 * barato porque o caminho vazio é uma query indexada.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { claimNextJob, runImportJob } from "@/lib/services/crm-history-import.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronCrmHistoryImport")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const job = await claimNextJob(admin)
    if (!job) return NextResponse.json({ success: true, idle: true })

    log.info("processando job", { jobId: job.id, mode: job.mode, channelId: job.channel_id })
    const result = await runImportJob(admin, job)

    return NextResponse.json({ success: true, jobId: job.id, ...result })
  } catch (error) {
    log.error("history import cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
