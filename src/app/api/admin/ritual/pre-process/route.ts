import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { flagStoresForWeek, thisMonday, nextMonday } from "@/lib/services/acompanhamento-flagging.service"
import { logger } from "@/lib/logger"

const log = logger.child("RitualPreProcess")

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * POST /api/admin/ritual/pre-process
 *
 * Roda manualmente o mesmo processamento que o cron de domingo 22h:
 * 1. Desativa estados de semanas anteriores
 * 2. Avalia TODAS as lojas ativas e calcula health_state
 * 3. Popula weekly_pipeline_states com flag_reason
 * 4. Cria deals no pipeline CS (dual-write)
 *
 * Body opcional:
 *   - week (YYYY-MM-DD): semana alvo. Default: segunda corrente.
 *   - force (boolean): se true, inclui lojas saudáveis na fila. Default: true.
 *   - next_week (boolean): se true, usa próxima segunda. Default: false.
 *
 * Permissão: qualquer membro ativo da org.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem organização ativa", 403)

    const body = (await request.json().catch(() => ({}))) as {
      week?: string
      force?: boolean
      next_week?: boolean
    }

    const week = body.week ?? (body.next_week ? nextMonday() : thisMonday())
    const force = body.force !== false

    log.info("[RitualPreProcess] iniciando", { week, force, orgId: member.org_id, userId: user.id })

    const result = await flagStoresForWeek({
      admin,
      week,
      orgId: member.org_id as string,
      force,
    })

    log.info("[RitualPreProcess] concluido", result)

    return successResponse(request, {
      ...result,
      triggered_by: user.id,
      mode: force ? "all_stores" : "criteria_only",
    })
  } catch (error) {
    return errorResponse(request, error, "RitualPreProcess")
  }
}

/**
 * GET /api/admin/ritual/pre-process
 *
 * Retorna status da última execução (útil para polling no frontend).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    await requireAuth(supabase)
    const admin = createAdminClient()

    const week = request.nextUrl.searchParams.get("week") ?? thisMonday()

    const { data: states, error } = await admin
      .from("weekly_pipeline_states")
      .select("id, health_state, health_score, flag_reason, flagged_at, flagged_by")
      .eq("week_start", week)
      .eq("is_active", true)
      .order("flagged_at", { ascending: false })
      .limit(1)

    const lastFlagged = states?.[0] ?? null
    const { count } = await admin
      .from("weekly_pipeline_states")
      .select("id", { count: "exact", head: true })
      .eq("week_start", week)
      .eq("is_active", true)

    return successResponse(request, {
      week,
      total_flagged: count ?? 0,
      last_flagged_at: lastFlagged?.flagged_at ?? null,
      last_flagged_by: lastFlagged?.flagged_by ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "RitualPreProcessStatus")
  }
}
