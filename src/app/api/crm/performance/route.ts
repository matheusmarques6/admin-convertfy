/**
 * GET /api/crm/performance
 *
 * Painel do gestor comercial, quatro respostas numa chamada:
 *   1. Vamos bater a meta?      → meta do período + ritmo + projeção
 *   2. O que vem pela frente?   → forecast ponderado por mês
 *   3. Como está o time?        → ranking por responsável
 *   4. Onde trava?              → tempo médio por etapa
 *
 * Uma rota só porque as quatro leem os MESMOS deals — separar
 * multiplicaria a query por quatro para montar uma tela única.
 *
 * Query params:
 *   period_type=month|quarter|year  (default month)
 *   pipeline_id=<uuid>              (default: todos os de vendas)
 *   forecast_months=3               (1–12)
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  buildForecast,
  computeGoalProgress,
  computeOwnerStats,
  computeStageDurations,
  resolvePeriod,
  type GoalPeriodType,
  type StageHistoryEvent,
} from "@/lib/services/crm-performance"

const log = logger.child("CrmPerformance")

export const dynamic = "force-dynamic"

interface DealRow {
  id: string
  pipeline_id: string
  stage_id: string
  title: string
  value: number | null
  probability: number | null
  expected_close_date: string | null
  status: string
  owner_id: string | null
  created_at: string
  won_at: string | null
  lost_at: string | null
}

function isMissingSchema(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204") return true
  return (e.message || "").toLowerCase().includes("does not exist")
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: userOrg } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    const orgId = userOrg?.org_id ?? null

    const sp = request.nextUrl.searchParams
    const periodType = (["month", "quarter", "year"].includes(sp.get("period_type") ?? "")
      ? sp.get("period_type")
      : "month") as GoalPeriodType
    const pipelineFilter = sp.get("pipeline_id")
    const forecastMonths = Math.min(
      Math.max(parseInt(sp.get("forecast_months") || "3", 10) || 3, 1),
      12,
    )

    const now = new Date()
    const period = resolvePeriod(periodType, now)
    const schemaMissing: string[] = []

    // ── Pipelines de vendas ──────────────────────────────────────
    const { data: pipelines, error: pipErr } = await admin
      .from("pipelines")
      .select("id, name, color")
      .eq("scope", "sales")
      .eq("is_archived", false)
      .order("name")
    if (pipErr) throw pipErr

    const allIds = (pipelines ?? []).map((p) => p.id)
    const activeIds =
      pipelineFilter && pipelineFilter !== "all" && allIds.includes(pipelineFilter)
        ? [pipelineFilter]
        : allIds

    if (activeIds.length === 0) {
      return successResponse(request, emptyPayload(periodType, period))
    }

    // ── Deals: abertos (forecast/pipeline) + fechados no período ─
    const { data: dealRows, error: dealErr } = await admin
      .from("deals")
      .select(
        "id, pipeline_id, stage_id, title, value, probability, expected_close_date, status, owner_id, created_at, won_at, lost_at",
      )
      .in("pipeline_id", activeIds)
      .neq("status", "archived")
      .limit(10000)
    if (dealErr) throw dealErr
    const deals = (dealRows as DealRow[] | null) ?? []

    const inPeriod = (iso: string | null) =>
      !!iso && Date.parse(iso) >= period.start.getTime() && Date.parse(iso) < period.end.getTime()

    const closedInPeriod = deals.filter(
      (d) =>
        (d.status === "won" && inPeriod(d.won_at)) ||
        (d.status === "lost" && inPeriod(d.lost_at)),
    )
    const openDeals = deals.filter((d) => d.status === "open")

    // ── 1. Meta do período ───────────────────────────────────────
    const achievedRevenue = closedInPeriod
      .filter((d) => d.status === "won")
      .reduce((s, d) => s + (d.value ?? 0), 0)
    const achievedCount = closedInPeriod.filter((d) => d.status === "won").length

    let goal: {
      id: string
      goal_type: string
      target_value: number
      owner_id: string | null
      pipeline_id: string | null
    } | null = null

    if (orgId) {
      const { data: goalRow, error: goalErr } = await admin
        .from("crm_sales_goals")
        .select("id, goal_type, target_value, owner_id, pipeline_id")
        .eq("org_id", orgId)
        .eq("period_type", periodType)
        .eq("period_start", ymd(period.start))
        .is("owner_id", null)
        .is("pipeline_id", null)
        .maybeSingle()

      if (goalErr) {
        if (!isMissingSchema(goalErr)) throw goalErr
        schemaMissing.push("crm_sales_goals")
      } else {
        goal = goalRow
      }
    }

    // Metas INDIVIDUAIS do período (owner_id preenchido) — alimentam o
    // atingimento por vendedor no ranking.
    let individualGoals: Array<{
      owner_id: string
      goal_type: string
      target_value: number
    }> = []
    if (orgId) {
      const { data: rows } = await admin
        .from("crm_sales_goals")
        .select("owner_id, goal_type, target_value")
        .eq("org_id", orgId)
        .eq("period_type", periodType)
        .eq("period_start", ymd(period.start))
        .not("owner_id", "is", null)
        .is("pipeline_id", null)
      individualGoals = (rows ?? []).filter(
        (r): r is { owner_id: string; goal_type: string; target_value: number } =>
          !!r.owner_id,
      )
    }

    const goalProgress = goal
      ? computeGoalProgress({
          target: Number(goal.target_value),
          achieved: goal.goal_type === "deals_won" ? achievedCount : achievedRevenue,
          periodStart: period.start,
          periodEnd: period.end,
          now,
        })
      : null

    // ── 2. Forecast ──────────────────────────────────────────────
    const forecast = buildForecast(openDeals, { months: forecastMonths, from: now })

    // ── 3. Ranking por responsável ───────────────────────────────
    // Abertos entram inteiros (pipeline atual); fechados só os do período.
    const ownerStats = computeOwnerStats([...openDeals, ...closedInPeriod])
    const ownerIds = ownerStats.map((s) => s.owner_id)
    const ownerNames = new Map<string, { name: string; avatar_url: string | null }>()
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", ownerIds)
      for (const p of profiles ?? []) {
        ownerNames.set(p.id, { name: p.name, avatar_url: p.avatar_url })
      }
    }
    const byOwner = ownerStats.map((s) => ({
      ...s,
      name: ownerNames.get(s.owner_id)?.name ?? "Sem responsável",
      avatar_url: ownerNames.get(s.owner_id)?.avatar_url ?? null,
    }))

    // ── 4. Tempo por etapa ───────────────────────────────────────
    // Janela de 180 dias: histórico antigo distorce a leitura do
    // processo atual e pesa na query.
    const historySince = new Date(now.getTime() - 180 * 86_400_000).toISOString()
    const dealIds = deals.map((d) => d.id)
    let stageDurations: Array<{
      stage_id: string
      stage_name: string
      stage_color: string | null
      avgDays: number
      medianDays: number
      samples: number
    }> = []

    if (dealIds.length > 0) {
      const { data: histRows, error: histErr } = await admin
        .from("crm_deal_history")
        .select("deal_id, old_value, new_value, changed_at")
        .eq("field", "stage_id")
        .gte("changed_at", historySince)
        .order("changed_at", { ascending: true })
        .limit(20000)
      if (histErr) throw histErr

      const dealIdSet = new Set(dealIds)
      const events = ((histRows as StageHistoryEvent[] | null) ?? [])
        .filter((h) => dealIdSet.has(h.deal_id))
        .map((h) => ({
          ...h,
          // JSONB de uuid volta como string com aspas em alguns drivers
          old_value: typeof h.old_value === "string" ? h.old_value : null,
          new_value: typeof h.new_value === "string" ? h.new_value : null,
        }))

      const { data: stageRows } = await admin
        .from("pipeline_stages")
        .select('id, name, color, "order", stage_type')
        .in("pipeline_id", activeIds)
        .limit(2000)

      const stageMap = new Map(
        (stageRows ?? []).map((s) => [s.id, s as { id: string; name: string; color: string | null }]),
      )

      stageDurations = computeStageDurations(events)
        .filter((s) => stageMap.has(s.stage_id))
        .map((s) => ({
          ...s,
          stage_name: stageMap.get(s.stage_id)?.name ?? "—",
          stage_color: stageMap.get(s.stage_id)?.color ?? null,
        }))
    }

    return successResponse(request, {
      period: {
        type: periodType,
        start: ymd(period.start),
        end: ymd(new Date(period.end.getTime() - 86_400_000)),
      },
      goal: goal
        ? { id: goal.id, goal_type: goal.goal_type, target_value: Number(goal.target_value) }
        : null,
      goal_progress: goalProgress,
      achieved: { revenue: achievedRevenue, count: achievedCount },
      forecast,
      individual_goals: individualGoals,
      by_owner: byOwner,
      stage_durations: stageDurations,
      pipelines: pipelines ?? [],
      schema_missing: schemaMissing,
    })
  } catch (error) {
    log.error("Performance GET error:", error)
    return errorResponse(request, error, "crm-performance-get")
  }
}

function emptyPayload(periodType: GoalPeriodType, period: { start: Date; end: Date }) {
  return {
    period: {
      type: periodType,
      start: ymd(period.start),
      end: ymd(new Date(period.end.getTime() - 86_400_000)),
    },
    goal: null,
    goal_progress: null,
    achieved: { revenue: 0, count: 0 },
    forecast: { buckets: [], withoutDate: 0, withoutDateValue: 0 },
    by_owner: [],
    stage_durations: [],
    pipelines: [],
    schema_missing: [],
  }
}

export const GET = withTiming("crm/performance", handleGet)
