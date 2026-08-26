import { withTiming } from "@/lib/api/with-timing"
/**
 * GET /api/dashboard/ops-series?period=&start=&end=
 *
 * Série diária agregada da org (store_daily_metrics) na janela pedida
 * E na janela imediatamente anterior — alimenta o gráfico "Receita
 * atribuída (campanhas) atual vs anterior" e os deltas REAIS de email
 * do Dashboard Operacional. Antes o "vs período anterior" era um
 * toggle que não fazia nada e os deltas eram hardcoded em 0.
 *
 * Limite honesto da fonte: flows não têm série diária (o backfill
 * bucketiza por send_time de CAMPANHA) — a UI rotula a série como
 * "campanhas · diário".
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getEmailDailySeries } from "@/lib/services/store-daily-metrics.service"
import { resolveWindow, previousWindow } from "@/lib/services/ops-dashboard/period-window"
import { buildOpsSeries } from "@/lib/services/ops-dashboard/series"

export const dynamic = "force-dynamic"

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const win = resolveWindow(sp.get("period"), sp.get("start"), sp.get("end"))
    const prevWin = previousWindow(win)

    const [current, previous] = await Promise.all([
      getEmailDailySeries(admin, orgId, win.from, win.to),
      getEmailDailySeries(admin, orgId, prevWin.from, prevWin.to),
    ])

    const payload = buildOpsSeries(current, previous, win, prevWin)

    return successResponse(request, {
      ...payload,
      window: win,
      previous_window: prevWin,
    })
  } catch (error) {
    return errorResponse(request, error, "dashboard-ops-series")
  }
}

export const GET = withTiming("dashboard/ops-series", handleGet)
