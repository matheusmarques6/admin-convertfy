/**
 * Vercel Cron — snapshot diário de métricas de email por loja.
 *
 * Schedule: 0 5 * * * (5h UTC). Popula store_daily_metrics com as campanhas
 * enviadas no dia anterior (via send_time), habilitando os gráficos de
 * tendência reais do dashboard.
 *
 * Modo backfill: GET ?backfill=120 reprocessa os últimos N dias a partir do
 * histórico já persistido (send_time das campanhas). Idempotente (upsert).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import {
  snapshotStoreDailyMetrics,
  backfillStoreDailyMetrics,
} from "@/lib/services/store-daily-metrics.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronStoreDailyMetrics")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  try {
    const admin = createAdminClient()
    const backfillParam = request.nextUrl.searchParams.get("backfill")

    if (backfillParam) {
      const daysBack = Math.max(1, Math.min(365, parseInt(backfillParam, 10) || 120))
      log.info("Store daily metrics backfill started", { daysBack })
      const result = await backfillStoreDailyMetrics(admin, { daysBack })
      log.info("Store daily metrics backfill completed", result)
      return NextResponse.json({ success: true, mode: "backfill", ...result })
    }

    log.info("Store daily metrics snapshot started")
    const result = await snapshotStoreDailyMetrics(admin)
    log.info("Store daily metrics snapshot completed", result)
    return NextResponse.json({ success: true, mode: "snapshot", ...result })
  } catch (error) {
    log.error("Store daily metrics cron failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    )
  }
}
