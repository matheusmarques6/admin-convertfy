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
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { getEmailDailySeries } from "@/lib/services/store-daily-metrics.service"
import { resolveWindow, previousWindow, type DateWindow } from "@/lib/services/ops-dashboard/period-window"
import {
  buildOpsSeries,
  dailyPointsFromCampaignRows,
  type CampaignDailyRow,
} from "@/lib/services/ops-dashboard/series"

export const dynamic = "force-dynamic"

/**
 * Fallback: deriva a série diária das linhas de CAMPANHA (send_time,
 * period_label 90d — mesma fonte do backfill do cron) quando
 * store_daily_metrics está vazia na janela (cron parado/atrasado).
 * Limite: o label 90d só cobre ~90 dias de envios — janela mais antiga
 * fica parcial, mas parcial-real > vazio.
 */
async function campaignFallback(
  admin: SupabaseClient,
  orgId: string,
  win: DateWindow,
): Promise<CampaignDailyRow[]> {
  const { data: stores } = await admin
    .from("client_stores")
    .select("id")
    .eq("org_id", orgId)
    .limit(1000)
  const storeIds = (stores ?? []).map((s) => s.id)
  if (storeIds.length === 0) return []

  const cols =
    "store_id, campaign_id, send_time, recipients, delivered, opened, clicked, conversions, conversion_value, bounced, unsubscribed, fetched_at"

  const [k, o] = await Promise.all([
    admin
      .from("klaviyo_campaign_metrics")
      .select(cols)
      .in("store_id", storeIds)
      .eq("period_label", "90d")
      .gte("send_time", `${win.from}T00:00:00Z`)
      .lte("send_time", `${win.to}T23:59:59Z`),
    admin
      .from("omnisend_campaign_metrics")
      .select(cols)
      .in("store_id", storeIds)
      .eq("period_label", "90d")
      .gte("send_time", `${win.from}T00:00:00Z`)
      .lte("send_time", `${win.to}T23:59:59Z`),
  ])
  const kRows = (k.error ? [] : (k.data ?? [])) as unknown as CampaignDailyRow[]
  const oRows = (o.error ? [] : (o.data ?? [])) as unknown as CampaignDailyRow[]
  return [...kRows, ...oRows]
}

async function handleGet(request: NextRequest) {
  try {
    const uc = await createClient()
    const user = await requireAuth(uc)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const win = resolveWindow(sp.get("period"), sp.get("start"), sp.get("end"))
    const prevWin = previousWindow(win)

    let [current, previous] = await Promise.all([
      getEmailDailySeries(admin, orgId, win.from, win.to),
      getEmailDailySeries(admin, orgId, prevWin.from, prevWin.to),
    ])

    let source: "daily" | "campaign_fallback" = "daily"
    if (current.length === 0) {
      const rows = await campaignFallback(admin, orgId, win)
      const fallback = dailyPointsFromCampaignRows(rows, win)
      if (fallback.length > 0) {
        current = fallback
        source = "campaign_fallback"
        // Janela anterior na MESMA régua (comparar fonte diária com
        // fonte de campanha distorceria o "vs anterior").
        const prevRows = await campaignFallback(admin, orgId, prevWin)
        previous = dailyPointsFromCampaignRows(prevRows, prevWin)
      }
    }

    const payload = buildOpsSeries(current, previous, win, prevWin)

    return successResponse(request, {
      ...payload,
      source,
      window: win,
      previous_window: prevWin,
    })
  } catch (error) {
    return errorResponse(request, error, "dashboard-ops-series")
  }
}

export const GET = withTiming("dashboard/ops-series", handleGet)
