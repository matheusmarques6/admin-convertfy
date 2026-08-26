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
  storeIds: string[],
  win: DateWindow,
): Promise<CampaignDailyRow[]> {
  if (storeIds.length === 0) return []

  const cols =
    "store_id, campaign_id, send_time, recipients, delivered, opened, clicked, conversions, conversion_value, bounced, unsubscribed, fetched_at"

  // SEM filtro de period_label: se a org só tem linhas de outra janela
  // ("30d" etc.), o fallback ainda funciona — o dedup por
  // (store, campaign, fetched_at mais recente) no builder elimina a
  // multiplicidade entre labels.
  const [k, o] = await Promise.all([
    admin
      .from("klaviyo_campaign_metrics")
      .select(cols)
      .in("store_id", storeIds)
      .gte("send_time", `${win.from}T00:00:00Z`)
      .lte("send_time", `${win.to}T23:59:59Z`)
      .limit(10000),
    admin
      .from("omnisend_campaign_metrics")
      .select(cols)
      .in("store_id", storeIds)
      .gte("send_time", `${win.from}T00:00:00Z`)
      .lte("send_time", `${win.to}T23:59:59Z`)
      .limit(10000),
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

    // store_daily_metrics pode nem existir (migration pendente) — erro
    // aqui NÃO pode derrubar a rota: cai no fallback por campanhas.
    let [current, previous] = await Promise.all([
      getEmailDailySeries(admin, orgId, win.from, win.to).catch(() => []),
      getEmailDailySeries(admin, orgId, prevWin.from, prevWin.to).catch(() => []),
    ])

    let source: "daily" | "campaign_fallback" = "daily"
    let fallbackRows = 0
    if (current.length === 0) {
      // As duas janelas do fallback rodam em PARALELO com uma lista de
      // lojas compartilhada — em série (lojas + 2 janelas × 2 tabelas) a
      // rota passava de 4s no ApiTiming quando o cron diário está parado.
      const { data: stores } = await admin
        .from("client_stores")
        .select("id")
        .eq("org_id", orgId)
        .limit(1000)
      const storeIds = (stores ?? []).map((s) => s.id)
      const [rows, prevRows] = await Promise.all([
        campaignFallback(admin, storeIds, win),
        campaignFallback(admin, storeIds, prevWin),
      ])
      fallbackRows = rows.length
      const fallback = dailyPointsFromCampaignRows(rows, win)
      if (fallback.length > 0) {
        current = fallback
        source = "campaign_fallback"
        // Janela anterior na MESMA régua (comparar fonte diária com
        // fonte de campanha distorceria o "vs anterior").
        previous = dailyPointsFromCampaignRows(prevRows, prevWin)
      }
    }

    const payload = buildOpsSeries(current, previous, win, prevWin)

    return successResponse(request, {
      ...payload,
      source,
      window: win,
      previous_window: prevWin,
      // Diagnóstico visível na UI quando vazio: quantos pontos a fonte
      // diária tinha e quantas linhas de campanha (com send_time na
      // janela) o fallback encontrou.
      debug: {
        daily_points: source === "daily" ? current.length : 0,
        fallback_campaign_rows: fallbackRows,
      },
    })
  } catch (error) {
    return errorResponse(request, error, "dashboard-ops-series")
  }
}

export const GET = withTiming("dashboard/ops-series", handleGet)
