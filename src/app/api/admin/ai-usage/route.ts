/**
 * GET /api/admin/ai-usage — observabilidade de custo de IA.
 *
 * Lê a view `ai_usage_unified` (união de email_generation_runs,
 * campaign_ai_runs, crm_ai_action_runs e ai_usage_events) e devolve:
 *   - totals: tokens/custo/execuções no período
 *   - by_feature: agregado por agente/feature
 *   - by_model: agregado por modelo
 *   - by_day: série diária (pra gráfico)
 *   - recent: últimas N execuções (com erro destacado)
 *
 * Query params:
 *   - days: janela em dias (default 30, max 365)
 *   - feature: filtra por feature específica
 *   - source: filtra por source (email_generation|campaign_central|crm|standalone)
 *
 * Auth: admin/owner OU tag 'dev' (mesma regra de canManagePrompts).
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  ForbiddenError,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { canManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"

const log = logger.child("AiUsageRoute")

export const dynamic = "force-dynamic"

interface UnifiedRow {
  id: string
  source: string
  feature: string
  model: string | null
  status: string
  tokens_input: number
  tokens_output: number
  cost_cents: number
  duration_ms: number
  store_id: string | null
  org_id: string | null
  created_at: string
}

interface Aggregate {
  runs: number
  errors: number
  tokens_input: number
  tokens_output: number
  cost_cents: number
  avg_duration_ms: number
}

function emptyAgg(): Aggregate {
  return {
    runs: 0,
    errors: 0,
    tokens_input: 0,
    tokens_output: 0,
    cost_cents: 0,
    avg_duration_ms: 0,
  }
}

function accumulate(agg: Aggregate, row: UnifiedRow): void {
  agg.runs += 1
  if (row.status === "error") agg.errors += 1
  agg.tokens_input += row.tokens_input
  agg.tokens_output += row.tokens_output
  agg.cost_cents += Number(row.cost_cents)
  // média incremental
  agg.avg_duration_ms +=
    (row.duration_ms - agg.avg_duration_ms) / agg.runs
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, tags")
      .eq("id", user.id)
      .maybeSingle()
    const actor = {
      id: user.id,
      role: (profile as { role?: string | null } | null)?.role ?? null,
      tags: ((profile as { tags?: string[] } | null)?.tags ?? []) as string[],
    }
    if (!canManagePrompts(actor)) throw new ForbiddenError()

    const days = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1),
      365,
    )
    const featureFilter = request.nextUrl.searchParams.get("feature")
    const sourceFilter = request.nextUrl.searchParams.get("source")

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Paginação interna: view não tem limite natural; 10k rows cobre
    // ~3 meses do volume atual. Se estourar, agregação fica truncada e
    // o payload indica truncated=true.
    const PAGE = 1000
    const MAX_ROWS = 10000
    const rows: UnifiedRow[] = []
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      let query = admin
        .from("ai_usage_unified")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (featureFilter) query = query.eq("feature", featureFilter)
      if (sourceFilter) query = query.eq("source", sourceFilter)
      const { data, error } = await query
      if (error) throw error
      const batch = (data ?? []) as UnifiedRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
    }
    const truncated = rows.length >= MAX_ROWS

    // ── Agregações ────────────────────────────────────────────
    const totals = emptyAgg()
    const byFeature = new Map<string, Aggregate & { source: string }>()
    const byModel = new Map<string, Aggregate>()
    const byDay = new Map<string, Aggregate>()

    for (const row of rows) {
      accumulate(totals, row)

      const fKey = row.feature
      if (!byFeature.has(fKey)) {
        byFeature.set(fKey, { ...emptyAgg(), source: row.source })
      }
      accumulate(byFeature.get(fKey)!, row)

      const mKey = row.model ?? "(sem modelo)"
      if (!byModel.has(mKey)) byModel.set(mKey, emptyAgg())
      accumulate(byModel.get(mKey)!, row)

      const day = row.created_at.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, emptyAgg())
      accumulate(byDay.get(day)!, row)
    }

    const sortByCost = <T extends { cost_cents: number }>(arr: T[]) =>
      arr.sort((a, b) => b.cost_cents - a.cost_cents)

    return successResponse(request, {
      window_days: days,
      truncated,
      totals: {
        ...totals,
        cost_usd: totals.cost_cents / 100,
      },
      by_feature: sortByCost(
        Array.from(byFeature.entries()).map(([feature, agg]) => ({
          feature,
          ...agg,
          cost_usd: agg.cost_cents / 100,
        })),
      ),
      by_model: sortByCost(
        Array.from(byModel.entries()).map(([model, agg]) => ({
          model,
          ...agg,
          cost_usd: agg.cost_cents / 100,
        })),
      ),
      by_day: Array.from(byDay.entries())
        .map(([day, agg]) => ({
          day,
          ...agg,
          cost_usd: agg.cost_cents / 100,
        }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      recent: rows.slice(0, 50),
    })
  } catch (error) {
    log.error("GET ai-usage error", error)
    return errorResponse(request, error, "ai-usage-get")
  }
}
