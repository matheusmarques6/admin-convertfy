import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

/**
 * GET /api/stores/[id]/acompanhamento
 *
 * Retorna dados do "Acompanhamento Semanal" da loja:
 *  - Health score atual (calculado)
 *  - Estado (ramp-up/saudável/atenção/risco/renovação)
 *  - Últimas N semanas de weekly_reports
 *  - Tendência (delta vs semana anterior)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()

    // Weekly reports (últimos 12)
    const { data: reports } = await admin
      .from("weekly_reports")
      .select("id, week_start, week_end, metrics, highlights, concerns, suggestions, ai_summary, is_reviewed")
      .eq("store_id", id)
      .order("week_start", { ascending: false })
      .limit(12)

    // Health score via revenue summary (campo já existente em outras telas)
    const { data: store } = await admin
      .from("client_stores")
      .select("id, store_name, created_at")
      .eq("id", id)
      .maybeSingle()

    if (!store) throw new AppError("Loja não encontrada", 404)

    // Estado: ramp-up se < 60 dias, depois decidir por concerns count
    const ageDays = Math.floor(
      (Date.now() - new Date(store.created_at).getTime()) / (1000 * 60 * 60 * 24),
    )

    const latest = reports?.[0]
    const previousReport = reports?.[1]

    let healthScore = 70 // baseline
    let healthState: "rampup" | "healthy" | "attention" | "risk" | "renewal" = "healthy"

    if (ageDays < 60) {
      healthState = "rampup"
      healthScore = 60
    } else if (latest) {
      const concernsCount = Array.isArray(latest.concerns) ? latest.concerns.length : 0
      const highlightsCount = Array.isArray(latest.highlights) ? latest.highlights.length : 0
      healthScore = Math.min(
        100,
        Math.max(0, 70 + highlightsCount * 5 - concernsCount * 10),
      )
      if (healthScore < 50) healthState = "risk"
      else if (healthScore < 70) healthState = "attention"
      else healthState = "healthy"
    }

    return successResponse(request, {
      health_score: healthScore,
      health_state: healthState,
      age_days: ageDays,
      reports: reports ?? [],
      latest_report: latest ?? null,
      previous_report: previousReport ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreAcompanhamento")
  }
}
