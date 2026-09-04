/**
 * GET /api/ai/convertia/perf-stats?days=30 — telemetria por rodada e
 * por tool da ConvertIA agregada (painel "ConvertIA · Desempenho" em
 * Custo de IA). Fonte: ai_usage_events (feature 'convertia') —
 * `context.rounds[]`, `context.tools[]`, `context.tokens_cached`.
 *
 * Responde: por modelo (turnos, rodadas médias, tempo médio, tokens,
 * % do input lido do cache, custo médio), por tool (chamadas, tempo
 * médio, taxa de erro, códigos) e o resumo de cache (quanto o item 1
 * está economizando de verdade).
 *
 * Auth: mesmo gate do dashboard (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import type { RoundStat, ToolStat } from "@/lib/ai/convertia/telemetry"

export const dynamic = "force-dynamic"

const MAX_ROWS = 4000

interface EventRow {
  model: string | null
  status: string
  tokens_input: number
  tokens_output: number
  cost_cents: number | string
  duration_ms: number
  context: {
    rounds?: RoundStat[]
    tools?: ToolStat[]
    tokens_cached?: number
    kind?: string
    status?: string
  } | null
}

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1), 365)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data, error } = await admin
      .from("ai_usage_events")
      .select("model, status, tokens_input, tokens_output, cost_cents, duration_ms, context")
      .eq("feature", "convertia")
      .eq("org_id", orgId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)
    if (error) throw error

    interface ModelAgg { turns: number; rounds: number; ms: number; tokens_input: number; tokens_output: number; tokens_cached: number; cost_cents: number; errors: number; cancelled: number; continued: number }
    const byModel = new Map<string, ModelAgg>()
    interface ToolAgg { calls: number; ms: number; errors: number; retries: number; codes: Map<string, number>; connector: string }
    const byTool = new Map<string, ToolAgg>()
    let turns = 0
    let withTelemetry = 0
    let totalInput = 0
    let totalCached = 0
    let cacheWrite = 0
    let roundsTotal = 0
    let cheapRounds = 0
    let rerouted = 0
    let nudged = 0

    for (const r of (data ?? []) as EventRow[]) {
      const ctx = r.context ?? {}
      if (ctx.kind === "summary" || ctx.kind === "eval") continue
      turns++
      const model = r.model ?? "?"
      const m = byModel.get(model) ?? { turns: 0, rounds: 0, ms: 0, tokens_input: 0, tokens_output: 0, tokens_cached: 0, cost_cents: 0, errors: 0, cancelled: 0, continued: 0 }
      m.turns++
      m.ms += r.duration_ms || 0
      m.tokens_input += r.tokens_input || 0
      m.tokens_output += r.tokens_output || 0
      m.cost_cents += Number(r.cost_cents) || 0
      if (r.status === "error") m.errors++
      if (ctx.status === "cancelled") m.cancelled++
      if (ctx.status === "budget") m.continued++
      totalInput += r.tokens_input || 0
      if (Array.isArray(ctx.rounds)) {
        withTelemetry++
        m.rounds += ctx.rounds.length
        roundsTotal += ctx.rounds.length
        for (const rd of ctx.rounds) {
          m.tokens_cached += rd.tokens_cached || 0
          totalCached += rd.tokens_cached || 0
          cacheWrite += rd.tokens_cache_write || 0
          if (rd.role === "cheap") cheapRounds++
          if (rd.outcome === "rerouted") rerouted++
          if (rd.outcome === "nudged") nudged++
        }
      } else if (typeof ctx.tokens_cached === "number") {
        m.tokens_cached += ctx.tokens_cached
        totalCached += ctx.tokens_cached
      }
      for (const t of ctx.tools ?? []) {
        const a = byTool.get(t.name) ?? { calls: 0, ms: 0, errors: 0, retries: 0, codes: new Map<string, number>(), connector: t.connector }
        a.calls++
        a.ms += t.ms || 0
        if (!t.ok) {
          a.errors++
          if (t.error_code) a.codes.set(t.error_code, (a.codes.get(t.error_code) ?? 0) + 1)
        }
        a.retries += t.retries || 0
        byTool.set(t.name, a)
      }
      byModel.set(model, m)
    }

    return successResponse(request, {
      window_days: days,
      turns,
      with_telemetry: withTelemetry,
      cache: {
        tokens_input: totalInput,
        tokens_cached: totalCached,
        tokens_cache_write: cacheWrite,
        hit_ratio: totalInput > 0 ? Math.round((totalCached / totalInput) * 1000) / 1000 : 0,
      },
      rounds: {
        total: roundsTotal,
        avg_per_turn: withTelemetry > 0 ? Math.round((roundsTotal / withTelemetry) * 10) / 10 : 0,
        cheap: cheapRounds,
        rerouted,
        nudged,
      },
      by_model: [...byModel.entries()]
        .map(([model, m]) => ({
          model,
          turns: m.turns,
          avg_rounds: m.rounds > 0 ? Math.round((m.rounds / m.turns) * 10) / 10 : null,
          avg_duration_ms: Math.round(m.ms / m.turns),
          tokens_input: m.tokens_input,
          tokens_output: m.tokens_output,
          cache_ratio: m.tokens_input > 0 ? Math.round((m.tokens_cached / m.tokens_input) * 1000) / 1000 : 0,
          avg_cost_cents: Math.round((m.cost_cents / m.turns) * 100) / 100,
          errors: m.errors,
          cancelled: m.cancelled,
          continued: m.continued,
        }))
        .sort((a, b) => b.turns - a.turns),
      by_tool: [...byTool.entries()]
        .map(([name, a]) => ({
          name,
          connector: a.connector,
          calls: a.calls,
          avg_ms: Math.round(a.ms / a.calls),
          error_rate: Math.round((a.errors / a.calls) * 1000) / 1000,
          retries: a.retries,
          codes: [...a.codes.entries()].map(([code, n]) => `${code}×${n}`).join(", "),
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 40),
      truncated: (data ?? []).length >= MAX_ROWS,
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-perf-stats")
  }
}

export const GET = withTiming("ai/convertia/perf-stats", handleGet)
