/**
 * GET  /api/ai/convertia/eval — casos + resultados por lote/modelo
 *      (painel "ConvertIA · Avaliação" em Custo de IA).
 * POST /api/ai/convertia/eval — ações: {action:'import'} importa casos
 *      dos 👍; {action:'run', models?, case_ids?} roda um lote agora
 *      (orçamento 280 s — o que não couber fica de fora);
 *      {action:'add', prompt, expectations?, workspace?, store_id?,
 *      connectors?} cria um caso à mão; {action:'toggle', id, is_active}.
 *
 * Auth: mesmo gate do dashboard (admin/owner OU tag 'dev').
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { EVAL_MODELS_DEFAULT, importCasesFromFeedback, runEvalBatch } from "@/lib/ai/convertia/eval"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MISSING = new Set(["42P01", "PGRST205"])

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const { data: cases, error } = await admin
      .from("ai_eval_cases")
      .select("id, prompt, workspace, store_id, connectors, expectations, is_active, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) {
      if (MISSING.has(error.code ?? "")) return successResponse(request, { schema_missing: true, cases: [], batches: [], by_model: [] })
      throw error
    }
    const caseIds = (cases ?? []).map((c) => c.id)
    const { data: runs } = caseIds.length
      ? await admin
          .from("ai_eval_runs")
          .select("id, case_id, batch_id, model, status, score, rubric, cost_cents, duration_ms, tool_calls, tokens_input, tokens_output, error, created_at")
          .in("case_id", caseIds)
          .order("created_at", { ascending: false })
          .limit(3000)
      : { data: [] }

    // agrega por lote × modelo e por modelo (todas as execuções)
    interface Agg { runs: number; scored: number; score_sum: number; cost_cents: number; duration_ms: number; errors: number; tool_calls: number }
    const mk = (): Agg => ({ runs: 0, scored: 0, score_sum: 0, cost_cents: 0, duration_ms: 0, errors: 0, tool_calls: 0 })
    const byBatch = new Map<string, { batch_id: string; started_at: string; models: Map<string, Agg> }>()
    const byModel = new Map<string, Agg>()
    for (const r of runs ?? []) {
      const b = byBatch.get(r.batch_id) ?? { batch_id: r.batch_id, started_at: r.created_at, models: new Map<string, Agg>() }
      if (r.created_at < b.started_at) b.started_at = r.created_at
      const a = b.models.get(r.model) ?? mk()
      const m = byModel.get(r.model) ?? mk()
      for (const agg of [a, m]) {
        agg.runs++
        if (r.status === "error") agg.errors++
        if (typeof r.score === "number" || (typeof r.score === "string" && r.score !== "")) {
          agg.scored++
          agg.score_sum += Number(r.score)
        }
        agg.cost_cents += Number(r.cost_cents) || 0
        agg.duration_ms += r.duration_ms || 0
        agg.tool_calls += r.tool_calls || 0
      }
      b.models.set(r.model, a)
      byBatch.set(r.batch_id, b)
      byModel.set(r.model, m)
    }
    const fmt = (model: string, a: Agg) => ({
      model,
      runs: a.runs,
      errors: a.errors,
      avg_score: a.scored > 0 ? Math.round((a.score_sum / a.scored) * 10) / 10 : null,
      avg_cost_cents: a.runs > 0 ? Math.round((a.cost_cents / a.runs) * 100) / 100 : 0,
      avg_duration_ms: a.runs > 0 ? Math.round(a.duration_ms / a.runs) : 0,
      avg_tool_calls: a.runs > 0 ? Math.round((a.tool_calls / a.runs) * 10) / 10 : 0,
    })
    const batches = [...byBatch.values()]
      .sort((x, y) => (x.started_at < y.started_at ? 1 : -1))
      .slice(0, 12)
      .map((b) => ({ batch_id: b.batch_id, started_at: b.started_at, models: [...b.models.entries()].map(([m, a]) => fmt(m, a)) }))
    const latestBatch = batches[0]?.batch_id
    const latestRuns = latestBatch ? (runs ?? []).filter((r) => r.batch_id === latestBatch) : []

    return successResponse(request, {
      schema_missing: false,
      models: EVAL_MODELS_DEFAULT,
      cases: (cases ?? []).map((c) => ({
        ...c,
        latest: latestRuns.filter((r) => r.case_id === c.id).map((r) => ({ model: r.model, score: r.score, status: r.status, comentario: (r.rubric as { comentario?: string } | null)?.comentario ?? null })),
      })),
      batches,
      by_model: [...byModel.entries()].map(([m, a]) => fmt(m, a)).sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1)),
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-eval-get")
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import") }),
  z.object({ action: z.literal("run"), models: z.array(z.string().max(80)).max(4).optional(), case_ids: z.array(z.string().uuid()).max(30).optional() }),
  z.object({
    action: z.literal("add"),
    prompt: z.string().min(5).max(8000),
    expectations: z.string().max(4000).optional(),
    workspace: z.enum(["operacional", "comercial"]).default("operacional"),
    store_id: z.string().uuid().nullable().optional(),
    connectors: z.array(z.string().max(50)).max(20).default([]),
  }),
  z.object({ action: z.literal("toggle"), id: z.string().uuid(), is_active: z.boolean() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
])

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)
    const body = postSchema.parse(await request.json())

    if (body.action === "import") {
      const imported = await importCasesFromFeedback(admin, orgId)
      return successResponse(request, { imported })
    }
    if (body.action === "run") {
      const result = await runEvalBatch(admin, { orgId, models: body.models, caseIds: body.case_ids, budgetMs: 280_000 })
      return successResponse(request, result)
    }
    if (body.action === "add") {
      const { data, error } = await admin
        .from("ai_eval_cases")
        .upsert(
          {
            org_id: orgId,
            prompt: body.prompt.trim(),
            expectations: body.expectations?.trim() || null,
            workspace: body.workspace,
            store_id: body.store_id ?? null,
            connectors: body.connectors,
            created_by: user.id,
          },
          { onConflict: "org_id,prompt_hash" },
        )
        .select("id")
        .single()
      if (error) {
        if (MISSING.has(error.code ?? "")) throw new AppError("Avaliação indisponível — aplique a migration 20261114.", 503, "schema-missing")
        throw error
      }
      return successResponse(request, { id: data.id }, { status: 201 })
    }
    if (body.action === "toggle") {
      const { error } = await admin.from("ai_eval_cases").update({ is_active: body.is_active, updated_at: new Date().toISOString() }).eq("id", body.id).eq("org_id", orgId)
      if (error) throw error
      return successResponse(request, { ok: true })
    }
    const { error } = await admin.from("ai_eval_cases").delete().eq("id", body.id).eq("org_id", orgId)
    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    return errorResponse(request, error, "convertia-eval-post")
  }
}
