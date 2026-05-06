/**
 * Vercel Cron — Daily CRM health score computation.
 *
 * Schedule: 0 5 * * * (5h UTC = 02h America/Sao_Paulo)
 *
 * Calcula health score de cada loja ativa e:
 * - Atualiza client_stores.health_score
 * - Insere snapshot em crm_health_history (sparkline)
 *
 * Componentes do score:
 * - Email metrics (35%): delivery, open, click, bounce, spam, unsub
 * - Revenue trend (30%): 30d vs mes anterior
 * - Tickets (20%): tickets abertos + SLA breaches
 * - NPS (15%): nps_last_score
 *
 * Pesos foram escolhidos pra refletir prioridades de retencao e nao
 * variam por org. Caso clientes futuros queiram pesos custom, mover
 * pra config-per-org (org_settings.health_weights).
 */

import { NextRequest, NextResponse } from "next/server"
import { computeAllStoresHealth } from "@/lib/services/crm-health.service"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { logger } from "@/lib/logger"

const log = logger.child("CronCrmHealth")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    log.info("CRM health cron started")
    const result = await computeAllStoresHealth()
    log.info("CRM health cron completed", result)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    log.error("CRM health cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
