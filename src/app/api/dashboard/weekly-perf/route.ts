/**
 * GET /api/dashboard/weekly-perf?weeks=4
 *
 * Performance agregada por semana (Open % / Click % / Conv %) usando
 * snapshots historicos de campanhas Klaviyo+Omnisend.
 *
 * Estrategia:
 *   1. Le todas as rows de klaviyo_campaign_metrics + omnisend_campaign_metrics
 *      cuja period_end fica dentro das ultimas N semanas (default 4).
 *   2. Agrupa por semana ISO (Mon-Sun) usando period_end.
 *   3. Calcula taxas medias ponderadas por delivered (mais correto que
 *      media simples — uma campanha com 100k recipients pesa mais que
 *      uma com 1k).
 *
 * Se nenhuma campanha foi enviada na janela, retorna array vazio
 * (componente mostra empty state).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

interface WeekBucket {
  delivered: number
  opened: number
  clicked: number
  conversions: number
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dow)
  return d
}

function weekLabel(weekStart: Date, weeksAgoIndex: number, totalWeeks: number): string {
  const order = totalWeeks - weeksAgoIndex
  return `Sem ${order}`
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const weeks = Math.max(1, Math.min(12, parseInt(request.nextUrl.searchParams.get("weeks") || "4", 10)))
    const today = new Date()
    const weekStart0 = startOfIsoWeek(today)
    const oldest = new Date(weekStart0)
    oldest.setUTCDate(oldest.getUTCDate() - 7 * (weeks - 1))

    type CampaignRow = {
      store_id: string
      delivered: number | null
      opened: number | null
      clicked: number | null
      conversions: number | null
      period_end: string | null
    }

    type StoreRow = { id: string; org_id: string }

    const { data: orgStores } = await admin
      .from("client_stores")
      .select("id, org_id")
      .eq("org_id", orgId)
      .returns<StoreRow[]>()

    const storeIds = (orgStores || []).map((s) => s.id)
    if (storeIds.length === 0) {
      return successResponse(request, { weeks: emptyWeeks(weeks, weekStart0), totalsZero: true })
    }

    const fetchKlav = admin
      .from("klaviyo_campaign_metrics")
      .select("store_id, delivered, opened, clicked, conversions, period_end")
      .in("store_id", storeIds)
      .gte("period_end", oldest.toISOString())
      .returns<CampaignRow[]>()

    const fetchOmni = admin
      .from("omnisend_campaign_metrics")
      .select("store_id, delivered, opened, clicked, conversions, period_end")
      .in("store_id", storeIds)
      .gte("period_end", oldest.toISOString())
      .returns<CampaignRow[]>()

    const [klavRes, omniRes] = await Promise.all([fetchKlav, fetchOmni])

    // Omnisend pode nao existir se migration nao foi aplicada — ignora erro
    const klavRows = klavRes.data ?? []
    const omniRows = omniRes.error ? [] : (omniRes.data ?? [])
    const allRows = [...klavRows, ...omniRows]

    // Agrupa por inicio da semana ISO
    const buckets = new Map<string, WeekBucket>()
    for (let w = 0; w < weeks; w++) {
      const ws = new Date(weekStart0)
      ws.setUTCDate(ws.getUTCDate() - 7 * (weeks - 1 - w))
      buckets.set(ws.toISOString(), {
        delivered: 0,
        opened: 0,
        clicked: 0,
        conversions: 0,
      })
    }

    for (const r of allRows) {
      if (!r.period_end) continue
      const end = new Date(r.period_end)
      const ws = startOfIsoWeek(end).toISOString()
      const b = buckets.get(ws)
      if (!b) continue
      b.delivered += Number(r.delivered) || 0
      b.opened += Number(r.opened) || 0
      b.clicked += Number(r.clicked) || 0
      b.conversions += Number(r.conversions) || 0
    }

    const result: Array<{ week: string; open: number; click: number; conv: number }> = []
    let i = 0
    let anyData = false
    for (const [iso, b] of buckets.entries()) {
      const open = b.delivered > 0 ? (b.opened / b.delivered) * 100 : 0
      const click = b.delivered > 0 ? (b.clicked / b.delivered) * 100 : 0
      const conv = b.delivered > 0 ? (b.conversions / b.delivered) * 100 : 0
      if (b.delivered > 0) anyData = true
      result.push({
        week: weekLabel(new Date(iso), weeks - 1 - i, weeks),
        open: Math.round(open * 10) / 10,
        click: Math.round(click * 10) / 10,
        conv: Math.round(conv * 10) / 10,
      })
      i++
    }

    return successResponse(request, { weeks: result, totalsZero: !anyData })
  } catch (error) {
    return errorResponse(request, error, "weekly-perf")
  }
}

function emptyWeeks(n: number, weekStart0: Date): Array<{ week: string; open: number; click: number; conv: number }> {
  const arr: Array<{ week: string; open: number; click: number; conv: number }> = []
  for (let w = 0; w < n; w++) {
    const ws = new Date(weekStart0)
    ws.setUTCDate(ws.getUTCDate() - 7 * (n - 1 - w))
    arr.push({ week: weekLabel(ws, n - 1 - w, n), open: 0, click: 0, conv: 0 })
  }
  return arr
}
