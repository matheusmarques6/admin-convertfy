/**
 * GET /api/crm/dashboard/sales
 *
 * KPIs do dashboard comercial. Dados vivos (nao cache), agregados em runtime
 * via SQL — quantidades pequenas (<10k deals em qualquer agencia razoavel).
 *
 * Quando a base crescer, migrar pra crm_health_history (snapshots diarios).
 *
 * Query params:
 *   - days: janela de analise (default 30)
 *
 * Retorna:
 *   - pipeline_value: soma de value de deals abertos
 *   - won_value: soma de value de deals ganhos no periodo
 *   - lost_value: soma de value de deals perdidos no periodo
 *   - won_count, lost_count, open_count
 *   - win_rate: won / (won + lost) em deals fechados no periodo
 *   - avg_cycle_days: ciclo medio entre criacao e won_at em deals ganhos no periodo
 *   - by_pipeline: breakdown por pipeline (sales scope)
 *   - by_source: breakdown por source
 *   - recent_wins: ultimos 5 deals ganhos
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDashboardSales")

export const dynamic = "force-dynamic"

interface DealRow {
  id: string
  pipeline_id: string
  title: string
  value: number | null
  status: string
  source: string | null
  created_at: string
  won_at: string | null
  lost_at: string | null
  pipeline?: { id: string; name: string; scope: string } | null
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const sp = request.nextUrl.searchParams
    const days = Math.min(parseInt(sp.get("days") || "30", 10), 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Fetch sales-scope pipelines IDs first
    const { data: salesPipelines } = await admin
      .from("pipelines")
      .select("id, name, scope, color")
      .eq("scope", "sales")
      .eq("is_archived", false)

    const pipelineIds = (salesPipelines || []).map((p) => p.id)
    if (pipelineIds.length === 0) {
      return successResponse(request, emptyPayload(days))
    }

    // Open deals (current pipeline value)
    const { data: openDeals } = await admin
      .from("deals")
      .select("id, pipeline_id, value, source, created_at")
      .in("pipeline_id", pipelineIds)
      .eq("status", "open")

    // Closed deals in window (won + lost)
    const { data: closedDeals } = await admin
      .from("deals")
      .select("id, pipeline_id, title, value, status, source, created_at, won_at, lost_at")
      .in("pipeline_id", pipelineIds)
      .in("status", ["won", "lost"])
      .or(`won_at.gte.${since},lost_at.gte.${since}`)
      .order("won_at", { ascending: false, nullsFirst: false })

    const open: DealRow[] = (openDeals as DealRow[] | null) ?? []
    const closed: DealRow[] = (closedDeals as DealRow[] | null) ?? []
    const won = closed.filter((d) => d.status === "won")
    const lost = closed.filter((d) => d.status === "lost")

    const sumValue = (rows: DealRow[]) =>
      rows.reduce((sum, r) => sum + (r.value || 0), 0)

    const pipeline_value = sumValue(open)
    const won_value = sumValue(won)
    const lost_value = sumValue(lost)
    const win_rate = won.length + lost.length > 0
      ? (won.length / (won.length + lost.length)) * 100
      : 0

    // Avg cycle in days for won deals
    const cycleDays = won
      .filter((d) => d.won_at && d.created_at)
      .map((d) => {
        const start = new Date(d.created_at).getTime()
        const end = new Date(d.won_at as string).getTime()
        return (end - start) / (1000 * 60 * 60 * 24)
      })
    const avg_cycle_days = cycleDays.length > 0
      ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
      : 0

    // By pipeline
    const pipelineMap = new Map<string, { name: string; color: string | null; open_value: number; open_count: number; won_value: number; won_count: number }>()
    for (const p of salesPipelines || []) {
      pipelineMap.set(p.id, {
        name: p.name,
        color: p.color || null,
        open_value: 0,
        open_count: 0,
        won_value: 0,
        won_count: 0,
      })
    }
    for (const d of open) {
      const item = pipelineMap.get(d.pipeline_id)
      if (item) {
        item.open_value += d.value || 0
        item.open_count += 1
      }
    }
    for (const d of won) {
      const item = pipelineMap.get(d.pipeline_id)
      if (item) {
        item.won_value += d.value || 0
        item.won_count += 1
      }
    }
    const by_pipeline = Array.from(pipelineMap.entries()).map(([id, v]) => ({ id, ...v }))

    // By source
    const sourceMap = new Map<string, { source: string; open_count: number; won_count: number; won_value: number }>()
    for (const d of open) {
      const key = d.source || "Sem fonte"
      const item = sourceMap.get(key) || { source: key, open_count: 0, won_count: 0, won_value: 0 }
      item.open_count += 1
      sourceMap.set(key, item)
    }
    for (const d of won) {
      const key = d.source || "Sem fonte"
      const item = sourceMap.get(key) || { source: key, open_count: 0, won_count: 0, won_value: 0 }
      item.won_count += 1
      item.won_value += d.value || 0
      sourceMap.set(key, item)
    }
    const by_source = Array.from(sourceMap.values()).sort(
      (a, b) => b.won_value - a.won_value,
    )

    const recent_wins = won.slice(0, 5).map((d) => ({
      id: d.id,
      title: d.title,
      value: d.value,
      won_at: d.won_at,
      pipeline_id: d.pipeline_id,
    }))

    return successResponse(request, {
      window_days: days,
      pipeline_value,
      won_value,
      lost_value,
      open_count: open.length,
      won_count: won.length,
      lost_count: lost.length,
      win_rate,
      avg_cycle_days,
      by_pipeline,
      by_source,
      recent_wins,
    })
  } catch (error) {
    log.error("Sales dashboard error:", error)
    return errorResponse(request, error, "crm-dashboard-sales")
  }
}

function emptyPayload(days: number) {
  return {
    window_days: days,
    pipeline_value: 0,
    won_value: 0,
    lost_value: 0,
    open_count: 0,
    won_count: 0,
    lost_count: 0,
    win_rate: 0,
    avg_cycle_days: 0,
    by_pipeline: [],
    by_source: [],
    recent_wins: [],
  }
}
