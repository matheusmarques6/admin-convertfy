import { withTiming } from "@/lib/api/with-timing"
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
import {
  groupPaidInvoices,
  resolveCashCollect,
  type PaidInvoice,
} from "@/lib/services/crm-cash-collect"
import {
  cyclesPerYear,
  lineTotal,
  round2,
  type DealProductLine,
} from "@/lib/services/crm-deal-products"
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
  client_id?: string | null
  cash_collected?: number | null
  pipeline?: { id: string; name: string; scope: string } | null
}

/** Cash collect real das vendas (unified_invoices + override manual). */
async function computeCash(
  admin: ReturnType<typeof createAdminClient>,
  wonDeals: DealRow[],
): Promise<number> {
  const clientIds = Array.from(
    new Set(wonDeals.map((d) => d.client_id).filter((id): id is string => !!id)),
  )
  let invoices: PaidInvoice[] = []
  if (clientIds.length > 0) {
    const { data } = await admin
      .from("unified_invoices")
      .select("client_id, amount, payment_date, status, source")
      .in("client_id", clientIds)
      .eq("status", "paid")
    invoices = (data ?? []) as PaidInvoice[]
  }
  const byClient = groupPaidInvoices(invoices)
  return round2(
    wonDeals.reduce(
      (sum, d) =>
        sum +
        resolveCashCollect(
          {
            client_id: d.client_id ?? null,
            cash_collected: d.cash_collected ?? null,
            won_at: d.won_at,
            created_at: d.created_at,
          },
          byClient,
        ).effective,
      0,
    ),
  )
}

async function handleGet(request: NextRequest) {
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

    const sincePrev = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString()

    // Closed deals in window (won + lost) + vendas da janela ANTERIOR
    // (base dos deltas "vs período anterior" — antes o delta não existia)
    const [{ data: closedDeals }, { data: prevWonDeals }] = await Promise.all([
      admin
        .from("deals")
        .select("id, pipeline_id, title, value, status, source, created_at, won_at, lost_at, client_id, cash_collected")
        .in("pipeline_id", pipelineIds)
        .in("status", ["won", "lost"])
        .or(`won_at.gte.${since},lost_at.gte.${since}`)
        .order("won_at", { ascending: false, nullsFirst: false }),
      admin
        .from("deals")
        .select("id, pipeline_id, title, value, status, source, created_at, won_at, lost_at, client_id, cash_collected")
        .in("pipeline_id", pipelineIds)
        .eq("status", "won")
        .gte("won_at", sincePrev)
        .lt("won_at", since),
    ])

    const open: DealRow[] = (openDeals as DealRow[] | null) ?? []
    const closed: DealRow[] = (closedDeals as DealRow[] | null) ?? []
    const won = closed.filter((d) => d.status === "won")
    const lost = closed.filter((d) => d.status === "lost")
    const wonPrev: DealRow[] = (prevWonDeals as DealRow[] | null) ?? []

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

    // ── Extensões do design ago/2026 (tudo aditivo) ────────────────

    // Pipeline aberto "vs anterior": snapshot diário mais próximo do
    // início da janela (cron crm-snapshot). Sem snapshot → delta null.
    const sinceDay = since.slice(0, 10)
    const snapFloor = new Date(Date.parse(since) - 3 * 86_400_000).toISOString().slice(0, 10)
    const { data: snapRows } = await admin
      .from("crm_pipeline_snapshots")
      .select("pipeline_id, day, open_value")
      .in("pipeline_id", pipelineIds)
      .gte("day", snapFloor)
      .lte("day", sinceDay)
      .order("day", { ascending: false })
    const snapByPipeline = new Map<string, number>()
    for (const s of snapRows ?? []) {
      if (!snapByPipeline.has(s.pipeline_id as string)) {
        snapByPipeline.set(s.pipeline_id as string, Number(s.open_value) || 0)
      }
    }
    const pipeline_open_prev =
      snapByPipeline.size > 0
        ? [...snapByPipeline.values()].reduce((a, b) => a + b, 0)
        : null

    // Cash collect (unified_invoices + override) — janela atual e anterior.
    const [cashNow, cashPrev] = await Promise.all([
      computeCash(admin, won),
      computeCash(admin, wonPrev),
    ])
    const won_value_prev = sumValue(wonPrev)
    const ticket = won.length > 0 ? won_value / won.length : null
    const ticket_prev = wonPrev.length > 0 ? won_value_prev / wonPrev.length : null

    // Atividades do time por tipo — janela atual vs anterior (join inner
    // pra contar só atividades de deals dos pipelines de VENDAS).
    const { data: activityRows } = await admin
      .from("crm_deal_activities")
      .select("type, created_at, deal:deals!inner(pipeline_id)")
      .in("deal.pipeline_id", pipelineIds)
      .gte("created_at", sincePrev)
      .limit(20000)
    const actMap = new Map<string, { current: number; previous: number }>()
    for (const a of (activityRows ?? []) as Array<{ type: string; created_at: string }>) {
      const key = a.type || "outro"
      const slot = actMap.get(key) ?? { current: 0, previous: 0 }
      if (a.created_at >= since) slot.current += 1
      else slot.previous += 1
      actMap.set(key, slot)
    }
    const activities = [...actMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.current - a.current)

    // Composição do ganho: linhas de produto das vendas da janela.
    // Deal SEM itens entra como pontual (valor manual) — a UI mostra a
    // cobertura ("N de M vendas com itens").
    let recorrente = 0
    let pontual = 0
    let mrrNovo = 0
    const dealsComItens = new Set<string>()
    if (won.length > 0) {
      const wonIds = won.map((d) => d.id)
      let itemsQ: { data: unknown[] | null; error: { code?: string; message?: string } | null } =
        await admin
          .from("crm_deal_products")
          .select("deal_id, quantity, unit_price, discount_pct, billing_type, recurring_interval")
          .in("deal_id", wonIds)
      if (itemsQ.error && /column .* does not exist|42703/i.test(`${itemsQ.error.code} ${itemsQ.error.message}`)) {
        itemsQ = await admin
          .from("crm_deal_products")
          .select("deal_id, quantity, unit_price, discount_pct, billing_type")
          .in("deal_id", wonIds)
      }
      const items = (itemsQ.data ?? []) as Array<DealProductLine & { deal_id: string }>
      for (const item of items) {
        dealsComItens.add(item.deal_id)
        const t = lineTotal(item)
        if (item.billing_type === "recurring") {
          recorrente = round2(recorrente + t)
          mrrNovo = round2(mrrNovo + (t * cyclesPerYear(item.recurring_interval)) / 12)
        } else {
          pontual = round2(pontual + t)
        }
      }
      for (const d of won) {
        if (!dealsComItens.has(d.id)) pontual = round2(pontual + (d.value || 0))
      }
    }

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
      // aditivos (design ago/2026)
      compare: {
        won_value_prev,
        won_count_prev: wonPrev.length,
        pipeline_open_prev,
        cash_prev: cashPrev,
        ticket_prev,
      },
      cash: { value: cashNow, pct: won_value > 0 ? (cashNow / won_value) * 100 : null },
      ticket,
      activities,
      composicao: {
        recorrente,
        pontual,
        mrr_novo: mrrNovo,
        vendas_com_itens: dealsComItens.size,
        vendas_total: won.length,
      },
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

export const GET = withTiming("crm/dashboard/sales", handleGet)
