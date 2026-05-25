import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

function currentWeekStart(): string {
  // Segunda-feira da semana corrente (ISO week, em UTC).
  const now = new Date()
  const dow = now.getUTCDay() // 0 = dom, 1 = seg, ..., 6 = sáb
  const offset = dow === 0 ? 6 : dow - 1 // dias desde segunda
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/**
 * GET /api/acompanhamento/pipeline
 *
 * Lista lojas no pipeline da semana corrente, agrupadas por stage.
 * Query params:
 *   - week_start (YYYY-MM-DD, default = segunda atual)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Pega org_id do usuário
    const admin = createAdminClient()
    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!member) throw new AppError("Usuário sem organização ativa", 403)

    const week = request.nextUrl.searchParams.get("week_start") ?? currentWeekStart()

    const { data: states, error } = await admin
      .from("weekly_pipeline_states")
      .select(
        "id, store_id, current_stage, health_state, health_score, flag_reason, " +
          "approved_actions, ai_message, feedback_sent_at, feedback_method, " +
          "flagged_at, approved_at, ai_message_generated_at, " +
          "store:client_stores(id, store_name, store_url, platform, niche, country, " +
          "mrr_cents, contract_end_date, email_platform, " +
          "client:clients!client_stores_client_id_fkey(id, name, " +
          "owner:profiles!clients_owner_id_fkey(id, name, avatar_url)))",
      )
      .eq("org_id", member.org_id)
      .eq("week_start", week)
      .eq("is_active", true)
      .order("flagged_at", { ascending: true })

    if (error) throw new AppError(error.message, 500)

    // Carrega o ultimo weekly_report de cada loja pra extrair revenue.change_pct
    const storeIds = ((states ?? []) as unknown as Array<{ store_id: string }>)
      .map((s) => s.store_id)
      .filter(Boolean)
    const revenueChangeByStore: Record<string, number | null> = {}
    if (storeIds.length > 0) {
      const { data: reports } = await admin
        .from("weekly_reports")
        .select("store_id, metrics, week_start")
        .in("store_id", storeIds)
        .order("week_start", { ascending: false })
      // Pega o mais recente por store_id (primeiro que aparece)
      for (const r of reports ?? []) {
        const sid = (r as { store_id: string }).store_id
        if (sid in revenueChangeByStore) continue
        const m = (r as { metrics?: { revenue?: { change_pct?: number } } })
          .metrics
        const pct = m?.revenue?.change_pct
        revenueChangeByStore[sid] = typeof pct === "number" ? pct : null
      }
    }

    const rows = (states ?? []) as unknown as Array<{
      id: string
      store_id: string
      current_stage: number
      health_state: string
      health_score: number
      flag_reason: string | null
      approved_actions: unknown[]
      ai_message: string | null
      feedback_sent_at: string | null
      feedback_method: string | null
      flagged_at: string
      approved_at: string | null
      ai_message_generated_at: string | null
      store: unknown
    }>

    // Converte mrr_cents (BIGINT em centavos) -> mrr_value (number em reais)
    // pra manter o contrato com o front sem mudar o componente.
    // Tambem adiciona revenue_change_pct vindo do ultimo weekly_report.
    const normalized = rows.map((r) => {
      const s = r.store as { mrr_cents?: number | null } | null
      if (s && typeof s === "object") {
        const cents = s.mrr_cents ?? 0
        ;(s as Record<string, unknown>).mrr_value =
          cents > 0 ? Math.round(cents / 100) : null
      }
      const pct = revenueChangeByStore[r.store_id]
      ;(r as Record<string, unknown>).revenue_change_pct =
        typeof pct === "number" ? pct : null
      return r
    })

    // Agrupa por stage
    const byStage: Record<number, typeof normalized> = { 1: [], 2: [], 3: [], 4: [] }
    for (const row of normalized) {
      byStage[row.current_stage]?.push(row)
    }

    // Contagem por health_state (Etapa 1 — ritual de sexta)
    const healthCounts = {
      risk: 0,
      attention: 0,
      renewal: 0,
      rampup: 0,
      healthy: 0,
    }
    for (const row of byStage[1] ?? []) {
      const hs = row.health_state as keyof typeof healthCounts
      if (hs in healthCounts) healthCounts[hs]++
    }

    return successResponse(request, {
      week_start: week,
      total: rows.length,
      by_stage: byStage,
      stage_counts: {
        1: byStage[1]!.length,
        2: byStage[2]!.length,
        3: byStage[3]!.length,
        4: byStage[4]!.length,
      },
      health_counts: healthCounts,
    })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoPipeline")
  }
}

/**
 * POST /api/acompanhamento/pipeline
 *
 * Insere/upsert uma loja no pipeline da semana corrente (manual).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    if (!body.store_id) throw new AppError("store_id obrigatório", 400)

    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id, store_name, created_at")
      .eq("id", body.store_id)
      .maybeSingle()
    if (!store) throw new AppError("Loja não encontrada", 404)

    const week = body.week_start ?? currentWeekStart()
    const healthState = body.health_state ?? "healthy"
    const healthScore = Number(body.health_score ?? 70)

    // Delete-then-insert: partial unique index nao funciona com upsert PostgREST
    await admin
      .from("weekly_pipeline_states")
      .delete()
      .eq("store_id", body.store_id)
      .eq("week_start", week)

    const { data: created, error } = await admin
      .from("weekly_pipeline_states")
      .insert({
        org_id: store.org_id,
        store_id: body.store_id,
        week_start: week,
        current_stage: body.current_stage ?? 1,
        health_state: healthState,
        health_score: healthScore,
        flag_reason: body.flag_reason ?? null,
        flagged_by: body.flagged_by ?? "manual",
        flagged_at: new Date().toISOString(),
        is_active: true,
      })
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)

    void user
    return successResponse(request, { state: created })
  } catch (error) {
    return errorResponse(request, error, "AcompanhamentoPipeline")
  }
}
