/**
 * GET /api/dashboard/email-series?period=30d
 *
 * Série temporal DIÁRIA de métricas de email (open/click/ctor/placed order)
 * agregada por dia entre todas as lojas do org, lida de store_daily_metrics.
 *
 * Usada pelo gráfico de tendência do card "Performance do Email". Quando não
 * há coleta ainda (tabela vazia), retorna série vazia — o front mostra
 * "coletando dados" em vez de plotar zeros.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { requireAuth, successResponse, errorResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getEmailDailySeries } from "@/lib/services/store-daily-metrics.service"

export const dynamic = "force-dynamic"

const PERIOD_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

export async function GET(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const periodParam = request.nextUrl.searchParams.get("period") || "30d"
    const days = PERIOD_DAYS[periodParam] ?? 30

    const to = new Date()
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    const fromDate = from.toISOString().slice(0, 10)
    const toDate = to.toISOString().slice(0, 10)

    const series = await getEmailDailySeries(admin, orgId, fromDate, toDate)

    return successResponse(request, {
      series,
      period: periodParam,
      from: fromDate,
      to: toDate,
      collecting: series.length === 0,
    })
  } catch (error) {
    return errorResponse(request, error, "email-series")
  }
}
