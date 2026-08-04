/**
 * Vercel Cron — retomada de automações em espera (nó "Aguardar").
 *
 * Schedule: * * * * * (a cada minuto)
 *
 * Runs com status='waiting' e resume_at vencido continuam a partir do
 * nó seguinte ao wait. Claim atômico por update condicional — execuções
 * concorrentes do cron nunca retomam o mesmo run duas vezes. É o que
 * faz cadência D+1/D+3/D+7 funcionar de verdade nas automações.
 */

import { NextRequest, NextResponse } from "next/server"
import { resumeDueAutomationRuns } from "@/lib/services/crm-automation-executor.service"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronCrmAutomationResume")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const result = await resumeDueAutomationRuns(20)
    if (result.resumed || result.requeued || result.errors) {
      log.info("Automation resume tick", result)
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    log.error("Automation resume cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
