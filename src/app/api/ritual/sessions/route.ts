import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

function thisMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - offset)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

/**
 * GET /api/ritual/sessions
 * Lista sessões da semana corrente + ativa (in_progress).
 */
export async function GET(request: NextRequest) {
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
    if (!member) throw new AppError("Sem org", 403)

    const week = request.nextUrl.searchParams.get("week_start") ?? thisMonday()

    const { data, error } = await admin
      .from("ritual_sessions")
      .select("*")
      .eq("org_id", member.org_id)
      .eq("week_start", week)
      .order("started_at", { ascending: false })

    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { sessions: data ?? [], week_start: week })
  } catch (error) {
    return errorResponse(request, error, "RitualSessions")
  }
}

/**
 * POST /api/ritual/sessions
 * Inicia uma nova sessão pra semana corrente. Popula `store_ids` com
 * todas as lojas em Etapa 1 do pipeline (ordenadas por health_state).
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
    if (!member) throw new AppError("Sem org", 403)

    const body = await request.json().catch(() => ({}))
    const week = body.week_start ?? thisMonday()

    // Pega stores em Etapa 1 ordenadas por severidade (risk > attention > rampup > renewal > healthy)
    const { data: pipelineStates } = await admin
      .from("weekly_pipeline_states")
      .select("store_id, health_state, health_score")
      .eq("org_id", member.org_id)
      .eq("week_start", week)
      .eq("current_stage", 1)
      .eq("is_active", true)

    const stateOrder: Record<string, number> = {
      risk: 0,
      attention: 1,
      rampup: 2,
      renewal: 3,
      healthy: 4,
    }
    const sortedStores = (pipelineStates ?? [])
      .sort((a, b) => {
        const aOrder = stateOrder[a.health_state] ?? 99
        const bOrder = stateOrder[b.health_state] ?? 99
        if (aOrder !== bOrder) return aOrder - bOrder
        return (a.health_score ?? 100) - (b.health_score ?? 100)
      })
      .map((s) => s.store_id as string)

    const { data: created, error } = await admin
      .from("ritual_sessions")
      .insert({
        org_id: member.org_id,
        week_start: week,
        store_ids: sortedStores,
        current_store_index: 0,
        started_by: user.id,
        participants: [user.id],
        status: "in_progress",
      })
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)
    return successResponse(request, { session: created })
  } catch (error) {
    return errorResponse(request, error, "RitualSessions")
  }
}
